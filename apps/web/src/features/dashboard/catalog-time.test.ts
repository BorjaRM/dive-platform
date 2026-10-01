import { describe, expect, it } from 'vitest';
import { formatSlotStart, slotStartFromLocal } from './catalog-time';

describe('catalog slot time presentation and conversion', () => {
  it('formats the instant in the requested language and center zone', () => {
    expect(
      formatSlotStart('2026-10-01T10:00:00Z', 'es-ES', 'Europe/Madrid'),
    ).toBe('1 oct 2026, 12:00 UTC+02:00');
    expect(
      formatSlotStart('2026-10-01T10:00:00Z', 'en-GB', 'Atlantic/Canary'),
    ).toBe('1 Oct 2026, 11:00 UTC+01:00');
  });

  it.each([
    '2026-10-01T10:00:00Z',
    '2026-10-01T12:00:00+02:00',
    '2026-10-01T06:00:00-04:00',
  ])(
    'uses the center zone regardless of the input offset in %s',
    (startsAt) => {
      expect(formatSlotStart(startsAt, 'en-GB', 'Atlantic/Canary')).toBe(
        '1 Oct 2026, 11:00 UTC+01:00',
      );
    },
  );

  it('uses the center-local calendar date when the instant crosses midnight', () => {
    expect(
      formatSlotStart('2026-10-01T22:30:00Z', 'en-GB', 'Europe/Madrid'),
    ).toBe('2 Oct 2026, 00:30 UTC+02:00');
    expect(
      formatSlotStart('2026-10-01T22:30:00Z', 'en-GB', 'Atlantic/Canary'),
    ).toBe('1 Oct 2026, 23:30 UTC+01:00');
  });

  it('uses the center offset at the slot date rather than a fixed summer offset', () => {
    expect(
      formatSlotStart('2026-12-01T10:00:00Z', 'en-GB', 'Europe/Madrid'),
    ).toBe('1 Dec 2026, 11:00 UTC+01:00');
    expect(
      formatSlotStart('2026-12-01T10:00:00Z', 'en-GB', 'Atlantic/Canary'),
    ).toBe('1 Dec 2026, 10:00 UTC+00:00');
  });

  it('distinguishes repeated center-local times by their actual offsets', () => {
    expect(
      formatSlotStart('2026-10-25T00:30:00Z', 'en-GB', 'Europe/Madrid'),
    ).toBe('25 Oct 2026, 02:30 UTC+02:00');
    expect(
      formatSlotStart('2026-10-25T01:30:00Z', 'en-GB', 'Europe/Madrid'),
    ).toBe('25 Oct 2026, 02:30 UTC+01:00');
  });

  it('shows the spring clock jump in the center zone', () => {
    expect(
      formatSlotStart('2026-03-29T00:30:00Z', 'en-GB', 'Europe/Madrid'),
    ).toBe('29 Mar 2026, 01:30 UTC+01:00');
    expect(
      formatSlotStart('2026-03-29T01:30:00Z', 'en-GB', 'Europe/Madrid'),
    ).toBe('29 Mar 2026, 03:30 UTC+02:00');
  });

  it('does not substitute a zone or format invalid instants', () => {
    expect(formatSlotStart('2026-10-01T10:00:00Z', 'en', null)).toBeNull();
    expect(formatSlotStart('invalid', 'en', 'Europe/Madrid')).toBeNull();
    expect(
      formatSlotStart('2026-10-01T10:00:00', 'en', 'Europe/Madrid'),
    ).toBeNull();
    expect(formatSlotStart('2026-10-01T10:00:00Z', 'en', 'invalid')).toBeNull();
  });

  it('converts center-local summer and winter times into UTC instants', () => {
    expect(slotStartFromLocal('2026-10-01T10:00', 'Europe/Madrid')).toBe(
      '2026-10-01T08:00:00Z',
    );
    expect(slotStartFromLocal('2026-12-01T10:00', 'Europe/Madrid')).toBe(
      '2026-12-01T09:00:00Z',
    );
    expect(slotStartFromLocal('2026-10-01T10:00', 'Atlantic/Canary')).toBe(
      '2026-10-01T09:00:00Z',
    );
  });

  it.each(['2026-03-29T02:30', '2026-10-25T02:30'])(
    'rejects nonexistent or ambiguous center-local time %s',
    (value) => {
      expect(() => slotStartFromLocal(value, 'Europe/Madrid')).toThrow();
    },
  );

  it.each([
    '',
    'invalid',
    '2026-02-30T10:00',
    '2026-10-01T10:00Z',
    '2026-10-01T10:00+02:00',
  ])('rejects invalid or nonlocal input %s', (value) => {
    expect(() => slotStartFromLocal(value, 'Europe/Madrid')).toThrow();
  });

  it.each(['', 'invalid'])(
    'rejects unavailable or invalid zone %s instead of using a default',
    (timeZone) => {
      expect(() => slotStartFromLocal('2026-10-01T10:00', timeZone)).toThrow();
    },
  );
});
