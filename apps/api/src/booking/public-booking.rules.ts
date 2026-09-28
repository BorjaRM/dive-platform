import { createHash } from 'node:crypto';

export const PUBLIC_BOOKING_CHANNEL = 'public_hosted';
export const PUBLIC_BOOKING_CONFIRMATION_PURPOSE = 'booking_confirmation_read';
export const PUBLIC_BOOKING_CANCELLATION_PURPOSE = 'booking_cancel';
export const PUBLIC_BOOKING_CAPABILITY_TTL_MILLIS = 72 * 60 * 60 * 1_000;

const PENDING_HOLD_MILLIS = 15 * 60 * 1_000;

type PublicBookingRequestData = Readonly<{
  slotId: string;
  seats: number;
  locale: 'es' | 'en';
  booker: Readonly<{
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
  }>;
}>;

export function isPublicChannelIdValid(value: string): boolean {
  return (
    value.length > 0 && value.length <= 200 && /^[A-Za-z0-9._~-]+$/.test(value)
  );
}

export function isPublicBookingIdempotencyKeyValid(
  value: string | undefined,
): value is string {
  return (
    value !== undefined && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)
  );
}

export function hashPublicBookingRequest(
  input: PublicBookingRequestData,
): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        slotId: input.slotId,
        seats: input.seats,
        locale: input.locale,
        booker: input.booker,
      }),
      'utf8',
    )
    .digest('hex');
}

export function publicBookingState(
  confirmationMode: 'immediate' | 'staff_approval',
  now: Date,
): Readonly<{
  holdExpiresAt: Date | null;
  status: 'Pending' | 'Confirmed';
}> {
  if (confirmationMode === 'immediate') {
    return { holdExpiresAt: null, status: 'Confirmed' };
  }
  return {
    holdExpiresAt: new Date(now.getTime() + PENDING_HOLD_MILLIS),
    status: 'Pending',
  };
}

export function canAcceptPublicBooking(
  usedSeats: number,
  requestedSeats: number,
  capacity: number,
): boolean {
  return usedSeats + requestedSeats <= capacity;
}

export function publicSlotStatusAfterBooking(
  usedSeats: number,
  requestedSeats: number,
  capacity: number,
): 'Available' | 'Full' {
  return usedSeats + requestedSeats >= capacity ? 'Full' : 'Available';
}
