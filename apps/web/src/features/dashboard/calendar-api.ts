import type {
  CatalogListResponse,
  CatalogSlot,
  LocalizedText,
  SlotStatus,
} from './catalog-api';
import type { DashboardRequest } from './tenant-context';

export type CalendarSlotRead = CatalogSlot & {
  activity: { name: LocalizedText; baseLocale: 'es' | 'en' };
  confirmedSeats: number;
  heldSeats: number;
  remainingSeats: number | null;
};
export type CalendarPageRead = CatalogListResponse<CalendarSlotRead> & {
  asOf: string;
};
export type BookingStatus =
  | 'Pending'
  | 'Confirmed'
  | 'Rejected'
  | 'Cancelled'
  | 'Expired';
export const BOOKING_STATUSES: readonly BookingStatus[] = [
  'Pending',
  'Confirmed',
  'Rejected',
  'Cancelled',
  'Expired',
];
export type BookingRead = {
  bookingId: string;
  status: BookingStatus;
  seats: number;
  bookingChannel: 'public_hosted';
  createdAt: string;
  holdExpiresAt: string | null;
};
export type BookingContactRead = {
  bookingId: string;
  booker: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
  };
};
export type CalendarReadQuery = {
  from: string;
  to: string;
  activityId?: string;
  slotStatus?: SlotStatus;
  page?: number;
  pageSize?: number;
};
export type BookingReadQuery = {
  bookingStatus?: BookingStatus;
  page?: number;
  pageSize?: number;
};

function readPath(
  centerId: string,
  path: string,
  query: CalendarReadQuery | BookingReadQuery = {},
) {
  const search = new URLSearchParams();
  for (const [name, value] of Object.entries(query)) {
    if (value !== undefined) search.set(name, String(value));
  }
  const suffix = search.toString();
  return `/v1/centers/${encodeURIComponent(centerId)}/${path}${suffix ? `?${suffix}` : ''}`;
}

export function createCalendarApi({ request }: { request: DashboardRequest }) {
  return {
    listCalendarSlots: (
      context: string,
      centerId: string,
      query: CalendarReadQuery,
      signal?: AbortSignal,
    ) =>
      request<CalendarPageRead>(readPath(centerId, 'calendar/slots', query), {
        context,
        signal,
      }),
    listSlotBookings: (
      context: string,
      centerId: string,
      slotId: string,
      query: BookingReadQuery = {},
      signal?: AbortSignal,
    ) =>
      request<CatalogListResponse<BookingRead>>(
        readPath(
          centerId,
          `slots/${encodeURIComponent(slotId)}/bookings`,
          query,
        ),
        { context, signal },
      ),
    getBookingContact: (
      context: string,
      centerId: string,
      bookingId: string,
      signal?: AbortSignal,
    ) =>
      request<BookingContactRead>(
        readPath(centerId, `bookings/${encodeURIComponent(bookingId)}/contact`),
        { context, signal },
      ),
  };
}
