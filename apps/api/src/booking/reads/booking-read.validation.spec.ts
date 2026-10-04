import { describe, expect, it } from 'vitest';
import {
  bookingQuery,
  calendarQuery,
  contactQuery,
} from './booking-read.validation.js';

const interval = {
  from: '2026-10-01T00:00:00Z',
  to: '2026-10-02T00:00:00+02:00',
};

describe('calendar read validation (DIVE-BOOK-REQ-043, 049)', () => {
  it('uses the approved page defaults and retains explicit-offset instants', () => {
    expect(calendarQuery(interval)).toEqual({
      ...interval,
      page: 1,
      pageSize: 20,
      offset: 0,
    });
    expect(
      bookingQuery({ page: '2', pageSize: '50', bookingStatus: 'Expired' }),
    ).toEqual({ page: 2, pageSize: 50, offset: 50, bookingStatus: 'Expired' });
    expect(() => contactQuery({})).not.toThrow();
  });

  it.each([
    {},
    { ...interval, from: '2026-02-30T00:00:00Z' },
    { ...interval, from: '2026-10-01T00:00:00' },
    { ...interval, from: ['2026-10-01T00:00:00Z'] },
    { ...interval, from: '2026-10-01T24:00:00Z' },
    { ...interval, to: interval.from },
    { ...interval, page: '' },
    { ...interval, page: '0' },
    { ...interval, page: '1.5' },
    { ...interval, pageSize: '51' },
    { ...interval, page: String(Number.MAX_SAFE_INTEGER), pageSize: '50' },
    { ...interval, tenantId: 'untrusted' },
    { ...interval, activityId: 'not-a-uuid' },
    { ...interval, slotStatus: 'Confirmed' },
    { ...interval, from: '2026-10-01T00:00:00.0000001Z' },
  ])(
    'rejects malformed, repeated, unknown and unrepresentable inputs',
    (input) => {
      expect(() => calendarQuery(input)).toThrow(
        expect.objectContaining({ status: 422 }),
      );
    },
  );

  it('separates slot and booking filters and forbids contact query fields', () => {
    expect(() => bookingQuery({ bookingStatus: 'Available' })).toThrow();
    expect(() => contactQuery({ email: 'private@example.test' })).toThrow();
  });

  it('orders representable instants without losing sub-millisecond precision', () => {
    const from = '2026-10-01T00:00:00.000001Z';
    const to = '2026-10-01T02:00:00.000002+02:00';
    expect(calendarQuery({ from, to })).toMatchObject({ from, to });
    expect(() => calendarQuery({ from: to, to: from })).toThrow();
  });
});
