import { ApiProblemException } from '../../common/http/problem-details.js';
import { uuid } from '../../common/validation/request-validation.js';

export type ReadPage = { page: number; pageSize: number; offset: number };
export type CalendarQuery = ReadPage & {
  from: string;
  to: string;
  activityId?: string;
  slotStatus?: string;
};
export type BookingQuery = ReadPage & { bookingStatus?: string };

const slotStatuses = ['Available', 'Full', 'Closed', 'Cancelled'];
const bookingStatuses = [
  'Pending',
  'Confirmed',
  'Rejected',
  'Cancelled',
  'Expired',
];

function invalid(): never {
  throw new ApiProblemException(
    422,
    'validation_error',
    'Invalid read parameters',
  );
}

function queryObject(value: unknown, keys: string[]): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  const query = value as Record<string, unknown>;
  for (const [key, item] of Object.entries(query)) {
    if (!keys.includes(key) || typeof item !== 'string' || !item.trim())
      invalid();
  }
  return query as Record<string, string>;
}

function page(query: Record<string, string>): ReadPage {
  for (const key of ['page', 'pageSize']) {
    if (query[key] !== undefined && !/^[1-9]\d*$/.test(query[key])) invalid();
  }
  const pageNumber = Number(query.page ?? 1);
  const pageSize = Number(query.pageSize ?? 20);
  const offset = (pageNumber - 1) * pageSize;
  if (
    !Number.isSafeInteger(pageNumber) ||
    !Number.isSafeInteger(pageSize) ||
    pageSize > 50 ||
    !Number.isSafeInteger(offset)
  )
    invalid();
  return { page: pageNumber, pageSize, offset };
}

function instant(value: string | undefined): string {
  if (!value) invalid();
  const match =
    /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})$/.exec(
      value,
    );
  if (!match) invalid();
  const [, date, hour, minute, second, fraction, zone] = match;
  const day = new Date(`${date}T00:00:00Z`);
  if (
    !Number.isFinite(day.getTime()) ||
    day.toISOString().slice(0, 10) !== date ||
    Number(date?.slice(0, 4)) < 1 ||
    Number(hour) > 23 ||
    Number(minute) > 59 ||
    Number(second) > 59 ||
    (fraction?.replace(/0+$/, '').length ?? 0) > 6 ||
    (zone !== 'Z' &&
      (Number(zone?.slice(1, 3)) > 23 || Number(zone?.slice(4)) > 59)) ||
    !Number.isFinite(Date.parse(value))
  )
    invalid();
  return value;
}

function status(value: string, allowed: string[]): string {
  if (!allowed.includes(value)) invalid();
  return value;
}

function instantMicroseconds(value: string): bigint {
  const fraction = /\.(\d+)/.exec(value)?.[1] ?? '';
  return (
    BigInt(Date.parse(value)) * 1000n +
    BigInt(fraction.padEnd(6, '0').slice(3, 6))
  );
}

export function calendarQuery(value: unknown): CalendarQuery {
  const query = queryObject(value, [
    'from',
    'to',
    'activityId',
    'slotStatus',
    'page',
    'pageSize',
  ]);
  const from = instant(query.from);
  const to = instant(query.to);
  if (instantMicroseconds(from) >= instantMicroseconds(to)) invalid();
  return {
    ...page(query),
    from,
    to,
    ...(query.activityId
      ? { activityId: uuid(query.activityId, 'activityId') }
      : {}),
    ...(query.slotStatus
      ? { slotStatus: status(query.slotStatus, slotStatuses) }
      : {}),
  };
}

export function bookingQuery(value: unknown): BookingQuery {
  const query = queryObject(value, ['bookingStatus', 'page', 'pageSize']);
  return {
    ...page(query),
    ...(query.bookingStatus
      ? { bookingStatus: status(query.bookingStatus, bookingStatuses) }
      : {}),
  };
}

export function contactQuery(value: unknown): void {
  queryObject(value, []);
}
