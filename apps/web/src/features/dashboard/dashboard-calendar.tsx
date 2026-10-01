'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useId, useState } from 'react';
import { Badge, Button, Notice, Select } from '../../components/ui/controls';
import styles from './calendar.module.css';
import { CalendarBookings } from './calendar-bookings';
import {
  calendarSlotEnd,
  loadCalendarActivities,
  loadCalendarSlots,
} from './calendar-data';
import {
  CALENDAR_SEARCH_PARAMS,
  useCalendarNavigation,
} from './calendar-navigation';
import type { CalendarRange } from './calendar-view';
import type { SlotStatus } from './catalog-api';
import { CatalogNotice, describeCatalogError } from './catalog-feedback';
import { formatSlotStart } from './catalog-time';
import { useDashboardContext } from './dashboard-context';
import { DashboardApiError } from './tenant-context';
import {
  CATALOG_SEARCH_PARAMS,
  useCatalogNavigation,
} from './use-catalog-navigation';

const CalendarView = dynamic(() => import('./calendar-view'), {
  ssr: false,
  loading: () => <CatalogNotice title="Loading calendar" />,
});
const CATALOG_QUERY_ROOT = ['dashboard', 'catalog'] as const;

export function DashboardCalendar() {
  const { authorizedCenters, isReady, tenantContext } = useDashboardContext();
  const navigation = useCatalogNavigation();
  const center =
    authorizedCenters.find(
      (item) => item.id === navigation.requestedCenterId,
    ) ?? authorizedCenters[0];
  if (!isReady) return null;
  if (!center || !tenantContext)
    return <CatalogNotice title="No center is available" />;
  return (
    <CenterCalendar
      key={`${tenantContext}:${center.id}`}
      centerId={center.id}
      timeZone={center.timeZone ?? null}
      context={tenantContext}
    />
  );
}

function CenterCalendar({
  centerId,
  timeZone,
  context,
}: {
  centerId: string;
  timeZone: string | null;
  context: string;
}) {
  const { api, authorizedCenters, handleSessionExpired } =
    useDashboardContext();
  const { updateSearchParams } = useCatalogNavigation();
  const queryClient = useQueryClient();
  const queryScope = useId();
  const [range, setRange] = useState<CalendarRange | null>(null);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const validTimeZone =
    formatSlotStart(new Date().toISOString(), 'en', timeZone) !== null;
  const navigation = useCalendarNavigation(validTimeZone ? timeZone : null);
  const activityId = navigation?.activityId ?? null;
  const slotStatus = navigation?.slotStatus ?? '';
  const rangeMatchesNavigation =
    range !== null &&
    range.view === navigation?.view &&
    range.date === navigation?.date;
  const capabilitiesQuery = useQuery({
    queryKey: [
      ...CATALOG_QUERY_ROOT,
      'calendar',
      queryScope,
      'capabilities',
      centerId,
    ],
    queryFn: ({ signal }) =>
      api.getDashboardCapabilities(context, centerId, signal),
    enabled: validTimeZone,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const canManageSlots =
    capabilitiesQuery.isSuccess &&
    !capabilitiesQuery.isFetching &&
    capabilitiesQuery.data.canScheduleSession;
  const activitiesQuery = useQuery({
    queryKey: [
      ...CATALOG_QUERY_ROOT,
      'calendar',
      queryScope,
      'activities',
      centerId,
    ],
    queryFn: ({ signal }) =>
      loadCalendarActivities(api, context, centerId, signal),
    enabled: validTimeZone,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const activities = activitiesQuery.data ?? [];
  const slotsQuery = useQuery({
    queryKey: [
      ...CATALOG_QUERY_ROOT,
      'calendar',
      queryScope,
      'slots',
      centerId,
      activityId,
      range,
      slotStatus,
    ],
    queryFn: ({ signal }) => {
      if (!range) throw new Error('Calendar range unavailable.');
      return loadCalendarSlots(
        api,
        context,
        centerId,
        activityId,
        { from: range.from, to: range.to },
        slotStatus,
        signal,
      );
    },
    enabled: validTimeZone && rangeMatchesNavigation,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const sessionExpired = [
    activitiesQuery.error,
    slotsQuery.error,
    capabilitiesQuery.error,
  ].some(
    (error) =>
      error instanceof DashboardApiError && error.kind === 'session-expired',
  );
  useEffect(() => {
    if (sessionExpired) handleSessionExpired();
  }, [sessionExpired, handleSessionExpired]);

  useEffect(() => {
    if (!validTimeZone) return;
    const refresh = () => {
      void queryClient.invalidateQueries({
        queryKey: [...CATALOG_QUERY_ROOT, 'calendar', queryScope],
      });
    };
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [validTimeZone, queryClient, queryScope]);

  const mutation = useMutation({
    retry: false,
    mutationFn: ({
      slotId,
      command,
    }: {
      slotId: string;
      command: 'close' | 'cancel';
    }) =>
      command === 'close'
        ? api.closeSlot(context, centerId, slotId)
        : api.cancelSlot(context, centerId, slotId),
    onSuccess: (_, action) => {
      setNotice(
        action.command === 'close' ? 'Slot closed.' : 'Slot cancelled.',
      );
      void queryClient.invalidateQueries({ queryKey: CATALOG_QUERY_ROOT });
    },
    onError: (error) => {
      if (
        error instanceof DashboardApiError &&
        error.kind === 'session-expired'
      )
        handleSessionExpired();
    },
  });

  const slots =
    rangeMatchesNavigation && !slotsQuery.isFetching && !slotsQuery.error
      ? (slotsQuery.data ?? [])
      : [];
  const selectedSlot = slots.find((slot) => slot.id === selectedSlotId);
  const activityNames = new Map(
    activities.map((activity) => [
      activity.id,
      activity.name.en ?? activity.name[activity.baseLocale] ?? '',
    ]),
  );
  const events = slots.map((slot) => ({
    id: slot.id,
    title:
      slot.activity.name.en ??
      slot.activity.name[slot.activity.baseLocale] ??
      '',
    start: slot.startsAt,
    end: calendarSlotEnd(slot),
    extendedProps: {
      status: slot.status,
      confirmedSeats: slot.confirmedSeats,
      heldSeats: slot.heldSeats,
      remainingSeats: slot.remainingSeats,
    },
  }));

  const runCommand = (command: 'close' | 'cancel') => {
    if (!selectedSlot) return;
    setNotice(null);
    mutation.mutate({ slotId: selectedSlot.id, command });
  };

  return (
    <section className={styles.page} aria-labelledby="calendar-heading">
      <header className={styles.header}>
        <h2 id="calendar-heading">Calendar</h2>
        <Button
          variant="secondary"
          disabled={!navigation || slotsQuery.isFetching}
          onClick={() =>
            void queryClient.invalidateQueries({
              queryKey: [...CATALOG_QUERY_ROOT, 'calendar', queryScope],
            })
          }
        >
          Refresh
        </Button>
        <Link href={`/dashboard?center=${encodeURIComponent(centerId)}`}>
          Home
        </Link>
        <Link
          href={`/dashboard/activities?center=${encodeURIComponent(centerId)}`}
        >
          Manage activities
        </Link>
      </header>
      <div className={styles.filters}>
        <label className={styles.filter} htmlFor="calendar-center">
          <span>Center</span>
          <Select
            id="calendar-center"
            value={centerId}
            onChange={(event) =>
              updateSearchParams({
                [CATALOG_SEARCH_PARAMS.centerId]: event.target.value,
                [CATALOG_SEARCH_PARAMS.activityId]: null,
              })
            }
          >
            {authorizedCenters.map((center) => (
              <option key={center.id} value={center.id}>
                {center.name}
              </option>
            ))}
          </Select>
        </label>
        <label className={styles.filter} htmlFor="calendar-activity">
          <span>Activity</span>
          <Select
            id="calendar-activity"
            value={activityId ?? ''}
            disabled={!activitiesQuery.isSuccess}
            onChange={(event) => {
              setSelectedSlotId(null);
              updateSearchParams({
                [CATALOG_SEARCH_PARAMS.activityId]: event.target.value,
              });
            }}
          >
            <option value="">All activities</option>
            {activityId &&
              !activities.some((activity) => activity.id === activityId) && (
                <option value={activityId}>Selected activity</option>
              )}
            {activities.map((activity) => (
              <option key={activity.id} value={activity.id}>
                {activityNames.get(activity.id)}
              </option>
            ))}
          </Select>
        </label>
        <label className={styles.filter} htmlFor="calendar-status">
          <span>Status</span>
          <Select
            id="calendar-status"
            value={slotStatus}
            onChange={(event) => {
              setSelectedSlotId(null);
              updateSearchParams({
                [CATALOG_SEARCH_PARAMS.slotStatus]: event.target.value,
              });
            }}
          >
            <option value="">All statuses</option>
            {(
              [
                'Available',
                'Full',
                'Closed',
                'Cancelled',
              ] satisfies SlotStatus[]
            ).map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </Select>
        </label>
        {validTimeZone && <span className={styles.timeZone}>{timeZone}</span>}
      </div>
      {!navigation ? (
        <CatalogNotice title="Center time zone is not configured" />
      ) : (
        <>
          {(activitiesQuery.isPending || slotsQuery.isFetching) && (
            <CatalogNotice title="Loading scheduled activities" />
          )}
          {activitiesQuery.error && (
            <CatalogNotice
              title="Activity filters could not be loaded"
              message={describeCatalogError(activitiesQuery.error)}
            />
          )}
          {slotsQuery.error && (
            <CatalogNotice
              title="Calendar could not be loaded"
              message={describeCatalogError(slotsQuery.error)}
            />
          )}
          <div aria-busy={activitiesQuery.isPending || slotsQuery.isFetching}>
            <CalendarView
              events={events}
              timeZone={timeZone as string}
              view={navigation.view}
              date={navigation.date}
              onRangeChange={(nextRange) => {
                setRange((current) =>
                  current?.from === nextRange.from &&
                  current.to === nextRange.to &&
                  current.view === nextRange.view &&
                  current.date === nextRange.date
                    ? current
                    : nextRange,
                );
                if (
                  nextRange.view !== navigation.view ||
                  nextRange.date !== navigation.date
                ) {
                  setSelectedSlotId(null);
                  updateSearchParams({
                    [CALENDAR_SEARCH_PARAMS.view]: nextRange.view,
                    [CALENDAR_SEARCH_PARAMS.date]: nextRange.date,
                  });
                }
              }}
              onSelectSlot={setSelectedSlotId}
            />
          </div>
          {rangeMatchesNavigation &&
            !slotsQuery.isFetching &&
            slotsQuery.isSuccess &&
            slots.length === 0 && (
              <CatalogNotice title="No scheduled activities in this period" />
            )}
        </>
      )}
      {selectedSlotId &&
        rangeMatchesNavigation &&
        (selectedSlot || slotsQuery.isFetching || slotsQuery.error) && (
          <section
            className={styles.detail}
            aria-labelledby={selectedSlot ? 'calendar-slot-heading' : undefined}
            aria-busy={slotsQuery.isFetching}
          >
            {selectedSlot && (
              <>
                <div className={styles.header}>
                  <h3 id="calendar-slot-heading">
                    {selectedSlot.activity.name.en ??
                      selectedSlot.activity.name[
                        selectedSlot.activity.baseLocale
                      ]}
                  </h3>
                  <Badge>{selectedSlot.status}</Badge>
                </div>
                <p>
                  <time dateTime={selectedSlot.startsAt}>
                    {formatSlotStart(selectedSlot.startsAt, 'en', timeZone)}
                  </time>
                </p>
                <p>
                  {selectedSlot.durationMinutes} min · capacity{' '}
                  {selectedSlot.capacity}
                </p>
                <p>
                  {selectedSlot.confirmedSeats} confirmed ·{' '}
                  {selectedSlot.heldSeats} held ·{' '}
                  {selectedSlot.remainingSeats === null
                    ? 'Remaining capacity unavailable'
                    : `${selectedSlot.remainingSeats} remaining`}
                </p>
                <p>
                  Observed{' '}
                  <time dateTime={selectedSlot.asOf}>
                    {formatSlotStart(selectedSlot.asOf, 'en', timeZone)}
                  </time>
                </p>
                <div className={styles.actions}>
                  <Link
                    href={`/dashboard/activities/${encodeURIComponent(selectedSlot.activityId)}/edit?center=${encodeURIComponent(centerId)}`}
                  >
                    Manage activity
                  </Link>
                  {canManageSlots &&
                    ['Available', 'Full'].includes(selectedSlot.status) && (
                      <Button
                        disabled={mutation.isPending}
                        onClick={() => runCommand('close')}
                      >
                        Close
                      </Button>
                    )}
                  {canManageSlots &&
                    ['Available', 'Full', 'Closed'].includes(
                      selectedSlot.status,
                    ) && (
                      <Button
                        variant="secondary"
                        disabled={mutation.isPending}
                        onClick={() => runCommand('cancel')}
                      >
                        Cancel
                      </Button>
                    )}
                  <Button
                    variant="secondary"
                    onClick={() => setSelectedSlotId(null)}
                  >
                    Dismiss
                  </Button>
                </div>
              </>
            )}
            <CalendarBookings
              key={selectedSlotId}
              centerId={centerId}
              slotId={selectedSlotId}
              context={context}
              queryScope={queryScope}
              timeZone={timeZone as string}
              showDetails={selectedSlot !== undefined}
            />
          </section>
        )}
      {notice && (
        <Notice role="status" tone="success">
          {notice}
        </Notice>
      )}
      {mutation.error && (
        <CatalogNotice
          title="Slot could not be updated"
          message={describeCatalogError(mutation.error)}
        />
      )}
    </section>
  );
}
