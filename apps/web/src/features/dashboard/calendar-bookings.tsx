'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState } from 'react';
import { Badge, Button, Select } from '../../components/ui/controls';
import styles from './calendar.module.css';
import {
  BOOKING_STATUSES,
  type BookingContactRead,
  type BookingStatus,
} from './calendar-api';
import { CatalogNotice, describeCatalogError } from './catalog-feedback';
import { formatSlotStart } from './catalog-time';
import { useDashboardContext } from './dashboard-context';
import { DashboardApiError } from './tenant-context';

type BookingProps = {
  centerId: string;
  slotId: string;
  context: string;
  queryScope: string;
  timeZone: string;
};
type ContactState =
  | { kind: 'closed' }
  | { kind: 'loading'; bookingId: string }
  | { kind: 'loaded'; bookingId: string; contact: BookingContactRead }
  | { kind: 'failed'; bookingId: string; error: unknown };

export function CalendarBookings({
  showDetails,
  ...props
}: BookingProps & { showDetails: boolean }) {
  const [status, setStatus] = useState<BookingStatus | ''>('');
  const [page, setPage] = useState(1);
  const filterId = useId();
  if (!showDetails) return null;
  return (
    <div className={styles.bookings}>
      <h4>Bookings</h4>
      <label className={styles.filter} htmlFor={filterId}>
        <span>Booking status</span>
        <Select
          id={filterId}
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as BookingStatus | '');
            setPage(1);
          }}
        >
          <option value="">All booking statuses</option>
          {BOOKING_STATUSES.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </Select>
      </label>
      <BookingPage
        key={`${status}:${page}`}
        {...props}
        status={status}
        page={page}
        onPageChange={setPage}
      />
    </div>
  );
}

function BookingPage({
  centerId,
  slotId,
  context,
  queryScope,
  timeZone,
  status,
  page,
  onPageChange,
}: BookingProps & {
  status: BookingStatus | '';
  page: number;
  onPageChange: (page: number) => void;
}) {
  const { api, handleSessionExpired } = useDashboardContext();
  const [contact, setContact] = useState<ContactState>({ kind: 'closed' });
  const controller = useRef<AbortController | null>(null);
  const contactHeading = useRef<HTMLHeadingElement>(null);
  const triggerPrefix = useId();
  const bookings = useQuery({
    queryKey: [
      'dashboard',
      'catalog',
      'calendar',
      queryScope,
      'bookings',
      centerId,
      slotId,
      status,
      page,
    ],
    queryFn: ({ signal }) =>
      api.listSlotBookings(
        context,
        centerId,
        slotId,
        { page, pageSize: 20, ...(status ? { bookingStatus: status } : {}) },
        signal,
      ),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const sessionExpired =
    bookings.error instanceof DashboardApiError &&
    bookings.error.kind === 'session-expired';
  useEffect(() => {
    if (sessionExpired) handleSessionExpired();
  }, [sessionExpired, handleSessionExpired]);
  useEffect(() => () => controller.current?.abort(), []);
  const openBookingId = contact.kind === 'closed' ? null : contact.bookingId;
  useEffect(() => {
    if (contact.kind === 'loaded')
      contactHeading.current?.focus({ preventScroll: true });
  }, [contact]);

  async function openContact(bookingId: string) {
    controller.current?.abort();
    const pending = new AbortController();
    controller.current = pending;
    setContact({ kind: 'loading', bookingId });
    try {
      const result = await api.getBookingContact(
        context,
        centerId,
        bookingId,
        pending.signal,
      );
      if (pending.signal.aborted) return;
      if (result.bookingId !== bookingId)
        throw new Error('Contact unavailable.');
      setContact({ kind: 'loaded', bookingId, contact: result });
    } catch (error) {
      if (pending.signal.aborted) return;
      if (
        error instanceof DashboardApiError &&
        error.kind === 'session-expired'
      )
        handleSessionExpired();
      setContact({ kind: 'failed', bookingId, error });
    }
  }

  function closeContact() {
    controller.current?.abort();
    setContact({ kind: 'closed' });
    if (openBookingId)
      document.getElementById(`${triggerPrefix}-${openBookingId}`)?.focus();
  }

  if (bookings.isFetching || bookings.isPending)
    return <CatalogNotice title="Loading bookings" />;
  if (bookings.error)
    return (
      <CatalogNotice
        title="Bookings could not be loaded"
        message={describeCatalogError(bookings.error)}
      />
    );
  return (
    <>
      {bookings.data.items.length === 0 ? (
        <CatalogNotice title="No bookings match this filter" />
      ) : (
        <ul className={styles.bookingList}>
          {bookings.data.items.map((booking) => (
            <li key={booking.bookingId} className={styles.bookingRow}>
              <div className={styles.bookingSummary}>
                <strong>{booking.bookingId}</strong>
                <Badge>{booking.status}</Badge>
                <span>{booking.seats} seats</span>
                <span>Online</span>
                <span>
                  Created{' '}
                  <time dateTime={booking.createdAt}>
                    {formatSlotStart(booking.createdAt, 'en', timeZone)}
                  </time>
                </span>
                <span>
                  Hold expiry:{' '}
                  {booking.holdExpiresAt === null ? (
                    'Not provided'
                  ) : (
                    <time dateTime={booking.holdExpiresAt}>
                      {formatSlotStart(booking.holdExpiresAt, 'en', timeZone)}
                    </time>
                  )}
                </span>
              </div>
              <Button
                id={`${triggerPrefix}-${booking.bookingId}`}
                variant="secondary"
                size="compact"
                aria-label={`View contact for booking ${booking.bookingId}`}
                onClick={() => void openContact(booking.bookingId)}
              >
                View contact
              </Button>
            </li>
          ))}
        </ul>
      )}
      <nav className={styles.actions} aria-label="Booking pages">
        <Button
          variant="secondary"
          size="compact"
          disabled={page === 1}
          onClick={() => onPageChange(page - 1)}
        >
          Previous bookings
        </Button>
        <span>Page {page}</span>
        <Button
          variant="secondary"
          size="compact"
          disabled={!bookings.data.hasNext}
          onClick={() => onPageChange(page + 1)}
        >
          Next bookings
        </Button>
      </nav>
      {contact.kind !== 'closed' && (
        <section
          className={styles.contact}
          aria-labelledby={`${triggerPrefix}-contact`}
        >
          <div className={styles.header}>
            <h4
              id={`${triggerPrefix}-contact`}
              ref={contactHeading}
              tabIndex={-1}
            >
              Booking contact
            </h4>
            <Button variant="secondary" size="compact" onClick={closeContact}>
              Hide contact
            </Button>
          </div>
          {contact.kind === 'loading' && (
            <CatalogNotice title="Loading contact" />
          )}
          {contact.kind === 'failed' && (
            <CatalogNotice
              title="Contact could not be loaded"
              message={describeCatalogError(contact.error)}
            />
          )}
          {contact.kind === 'loaded' && (
            <dl className={styles.contactFields}>
              <dt className={styles.contactLabel}>Name</dt>
              <dd>
                {contact.contact.booker.firstName}{' '}
                {contact.contact.booker.lastName}
              </dd>
              <dt className={styles.contactLabel}>Email</dt>
              <dd>{contact.contact.booker.email}</dd>
              <dt className={styles.contactLabel}>Phone</dt>
              <dd>{contact.contact.booker.phone ?? 'Not provided'}</dd>
            </dl>
          )}
        </section>
      )}
    </>
  );
}
