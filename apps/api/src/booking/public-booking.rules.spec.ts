import { describe, expect, it } from 'vitest';
import {
  canAcceptPublicBooking,
  hashPublicBookingRequest,
  isPublicBookingIdempotencyKeyValid,
  isPublicChannelIdValid,
  publicBookingState,
  publicSlotStatusAfterBooking,
} from './public-booking.rules.js';

describe('public booking rules', () => {
  it('validates public selectors and idempotency keys', () => {
    expect(isPublicChannelIdValid('hosted-a')).toBe(true);
    expect(isPublicChannelIdValid('')).toBe(false);
    expect(isPublicChannelIdValid('not allowed')).toBe(false);
    expect(isPublicBookingIdempotencyKeyValid('request-1')).toBe(true);
    expect(isPublicBookingIdempotencyKeyValid(undefined)).toBe(false);
    expect(isPublicBookingIdempotencyKeyValid('-invalid')).toBe(false);
  });

  it('hashes the complete semantic booking request', () => {
    const request = {
      slotId: 'aaaaaaaa-1001-4001-8001-000000000011',
      seats: 1,
      locale: 'es' as const,
      booker: {
        firstName: 'Ana',
        lastName: 'Buceadora',
        email: 'ana@example.test',
      },
    };
    expect(hashPublicBookingRequest(request)).toBe(
      hashPublicBookingRequest(request),
    );
    expect(hashPublicBookingRequest({ ...request, seats: 2 })).not.toBe(
      hashPublicBookingRequest(request),
    );
  });

  it('derives confirmation state and pending hold expiry', () => {
    const now = new Date('2026-09-28T12:00:00.000Z');
    expect(publicBookingState('immediate', now)).toEqual({
      holdExpiresAt: null,
      status: 'Confirmed',
    });
    expect(publicBookingState('staff_approval', now)).toEqual({
      holdExpiresAt: new Date('2026-09-28T12:15:00.000Z'),
      status: 'Pending',
    });
  });

  it('derives capacity acceptance and resulting slot state', () => {
    expect(canAcceptPublicBooking(2, 1, 4)).toBe(true);
    expect(publicSlotStatusAfterBooking(2, 1, 4)).toBe('Available');
    expect(canAcceptPublicBooking(3, 1, 4)).toBe(true);
    expect(publicSlotStatusAfterBooking(3, 1, 4)).toBe('Full');
    expect(canAcceptPublicBooking(4, 1, 4)).toBe(false);
  });
});
