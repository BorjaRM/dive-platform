import { Temporal } from '@js-temporal/polyfill';

export function formatSlotStart(
  startsAt: string,
  locale: string,
  timeZone: string | null,
): string | null {
  if (!timeZone) return null;
  try {
    const instant = Temporal.Instant.from(startsAt);
    const centerTime = instant.toZonedDateTimeISO(timeZone);
    const localTime = new Intl.DateTimeFormat(locale, {
      timeZone,
      dateStyle: 'medium',
      timeStyle: 'short',
      hourCycle: 'h23',
    }).format(new Date(instant.epochMilliseconds));
    return `${localTime} UTC${centerTime.offset}`;
  } catch {
    return null;
  }
}

export function slotStartFromLocal(value: string, timeZone: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    throw new RangeError('Enter a valid local date and time.');
  }
  return Temporal.PlainDateTime.from(value, { overflow: 'reject' })
    .toZonedDateTime(timeZone, { disambiguation: 'reject' })
    .toInstant()
    .toString();
}
