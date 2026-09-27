import { describe, expect, it } from 'vitest';
import {
  formatCatalogInstant,
  parseCatalogInstant,
  validateCatalogTimeZone,
} from './catalog.time.js';

describe('catalog time helpers', () => {
  it('parses RFC3339 instants and rejects values without an instant', () => {
    expect(parseCatalogInstant('2026-01-15T12:30:00Z', 'from').toString()).toBe(
      '2026-01-15T12:30:00Z',
    );
    expect(() => parseCatalogInstant('2026-01-15', 'from')).toThrow(
      'from must be an RFC3339 instant',
    );
    expect(() => parseCatalogInstant('not-a-date', 'from')).toThrow(
      'from must be an RFC3339 instant',
    );
  });

  it('validates IANA time zones', () => {
    expect(validateCatalogTimeZone('Europe/Madrid')).toBe('Europe/Madrid');
    expect(() => validateCatalogTimeZone('PST')).toThrow(
      'timeZone must be an IANA time zone',
    );
    expect(() => validateCatalogTimeZone('Not/AZone')).toThrow(
      'timeZone must be an IANA time zone',
    );
  });

  it('renders both sides of the spring-forward transition in the center zone', () => {
    expect(
      formatCatalogInstant(
        new Date('2024-03-10T09:30:00Z'),
        'America/Los_Angeles',
      ),
    ).toBe('2024-03-10T01:30:00-08:00');
    expect(
      formatCatalogInstant(
        new Date('2024-03-10T10:30:00Z'),
        'America/Los_Angeles',
      ),
    ).toBe('2024-03-10T03:30:00-07:00');
  });

  it('keeps the repeated local time distinguishable by offset in the fall', () => {
    expect(
      formatCatalogInstant(
        new Date('2024-11-03T08:30:00Z'),
        'America/Los_Angeles',
      ),
    ).toBe('2024-11-03T01:30:00-07:00');
    expect(
      formatCatalogInstant(
        new Date('2024-11-03T09:30:00Z'),
        'America/Los_Angeles',
      ),
    ).toBe('2024-11-03T01:30:00-08:00');
  });
});
