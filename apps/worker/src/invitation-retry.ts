export function fullJitterDelayMillis(
  attempt: number,
  random: () => number = Math.random,
): number {
  if (!Number.isSafeInteger(attempt) || attempt < 1 || attempt > 8) {
    throw new Error('Invalid invitation delivery attempt');
  }
  const ceiling = Math.min(5_000 * 2 ** (attempt - 1), 15 * 60_000);
  const sample = random();
  if (sample < 0 || sample >= 1) throw new Error('Invalid random sample');
  return Math.floor(sample * (ceiling + 1));
}

export function retryAfterDelayMillis(
  value: string | null,
  now: Date,
): number | null {
  if (value === null) return null;
  const normalized = value.trim();
  if (/^\d+$/.test(normalized)) {
    const delay = Number(normalized) * 1_000;
    return Number.isSafeInteger(delay) ? delay : Number.POSITIVE_INFINITY;
  }
  const timestamp = parseHttpDateTimestamp(normalized);
  const delay = timestamp - now.getTime();
  if (!Number.isFinite(timestamp) || delay <= 0) return null;
  return Number.isSafeInteger(delay) ? delay : Number.POSITIVE_INFINITY;
}

const shortWeekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const longWeekdays = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];
const months = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function parseHttpDateTimestamp(value: string): number {
  const imfFixdate =
    /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), (\d{2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{4}) (\d{2}):(\d{2}):(\d{2}) GMT$/.exec(
      value,
    );
  if (imfFixdate) {
    const [
      ,
      weekday = '',
      day = '',
      month = '',
      year = '',
      hour = '',
      minute = '',
      second = '',
    ] = imfFixdate;
    return validatedHttpDateTimestamp(
      weekday,
      day,
      month,
      year,
      hour,
      minute,
      second,
    );
  }

  const rfc850Date =
    /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), (\d{2})-(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-(\d{2}) (\d{2}):(\d{2}):(\d{2}) GMT$/.exec(
      value,
    );
  if (rfc850Date) {
    const [
      ,
      weekday = '',
      day = '',
      month = '',
      shortYearValue = '',
      hour = '',
      minute = '',
      second = '',
    ] = rfc850Date;
    const shortYear = Number(shortYearValue);
    return validatedHttpDateTimestamp(
      weekday,
      day,
      month,
      String(shortYear >= 50 ? 1900 + shortYear : 2000 + shortYear),
      hour,
      minute,
      second,
    );
  }

  const asctimeDate =
    /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) ([ 0-9]{2}) (\d{2}):(\d{2}):(\d{2}) (\d{4})$/.exec(
      value,
    );
  if (asctimeDate) {
    const [
      ,
      weekday = '',
      month = '',
      day = '',
      hour = '',
      minute = '',
      second = '',
      year = '',
    ] = asctimeDate;
    return validatedHttpDateTimestamp(
      weekday,
      day,
      month,
      year,
      hour,
      minute,
      second,
    );
  }

  return Number.NaN;
}

function validatedHttpDateTimestamp(
  weekday: string,
  day: string,
  month: string,
  year: string,
  hour: string,
  minute: string,
  second: string,
): number {
  const yearNumber = Number(year);
  const monthIndex = months.indexOf(month);
  const dayNumber = Number(day.trim());
  const hourNumber = Number(hour);
  const minuteNumber = Number(minute);
  const secondNumber = Number(second);
  if (
    monthIndex < 0 ||
    dayNumber < 1 ||
    dayNumber > 31 ||
    hourNumber > 23 ||
    minuteNumber > 59 ||
    secondNumber > 59
  ) {
    return Number.NaN;
  }

  const timestamp = Date.UTC(
    yearNumber,
    monthIndex,
    dayNumber,
    hourNumber,
    minuteNumber,
    secondNumber,
  );
  const date = new Date(timestamp);
  if (yearNumber >= 0 && yearNumber <= 99) {
    date.setUTCFullYear(yearNumber);
  }
  const expectedWeekdayName = longWeekdays.includes(weekday)
    ? (shortWeekdays[longWeekdays.indexOf(weekday)] ?? '')
    : weekday;
  const expectedWeekday = shortWeekdays.indexOf(expectedWeekdayName);
  if (
    !Number.isFinite(date.getTime()) ||
    date.getUTCFullYear() !== yearNumber ||
    date.getUTCMonth() !== monthIndex ||
    date.getUTCDate() !== dayNumber ||
    date.getUTCHours() !== hourNumber ||
    date.getUTCMinutes() !== minuteNumber ||
    date.getUTCSeconds() !== secondNumber ||
    date.getUTCDay() !== expectedWeekday
  ) {
    return Number.NaN;
  }
  return date.getTime();
}
