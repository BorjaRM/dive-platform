import { Temporal } from '@js-temporal/polyfill';

export function parseCatalogInstant(value: unknown, field: string) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${field} must be an RFC3339 instant`);
  }
  try {
    return Temporal.Instant.from(value);
  } catch {
    throw new Error(`${field} must be an RFC3339 instant`);
  }
}

export function validateCatalogTimeZone(value: unknown, field = 'timeZone') {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${field} must be an IANA time zone`);
  }
  try {
    Temporal.Instant.from('2000-01-01T00:00:00Z').toZonedDateTimeISO(value);
  } catch {
    throw new Error(`${field} must be an IANA time zone`);
  }
  return value;
}

export function formatCatalogInstant(value: Date, timeZone: string): string {
  const instant = Temporal.Instant.from(value.toISOString());
  return instant
    .toZonedDateTimeISO(validateCatalogTimeZone(timeZone))
    .toString({ timeZoneName: 'never' });
}
