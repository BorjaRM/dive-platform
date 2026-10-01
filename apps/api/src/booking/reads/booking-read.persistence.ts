import type { PoolClient } from 'pg';
import type { ResolvedCenterApplicationScope } from '../../common/auth/http-admission.js';
import type {
  BookingContactReadDto,
  BookingPageReadDto,
  CalendarPageReadDto,
} from './booking-read.dto.js';
import type { BookingQuery, CalendarQuery } from './booking-read.validation.js';

type ReadConnection = Pick<PoolClient, 'query'>;

function postgresInstant(value: string): string {
  const fraction = (value.match(/\.(\d+)/)?.[1] ?? '')
    .slice(0, 6)
    .padEnd(6, '0');
  const utc = new Date(value)
    .toISOString()
    .replace(/\.\d{3}Z$/, `.${fraction}Z`);
  if (utc.startsWith('0000-')) return `${utc.replace(/^0000-/, '0001-')} BC`;
  return utc.replace(/^\+0*(\d{5,})-/, '$1-');
}

export async function readCalendar(
  client: ReadConnection,
  scope: ResolvedCenterApplicationScope,
  query: CalendarQuery,
): Promise<CalendarPageReadDto> {
  const result = await client.query<{ page: CalendarPageReadDto }>(
    `WITH observation AS MATERIALIZED (SELECT statement_timestamp() AS as_of),
     selected AS MATERIALIZED (
       SELECT s.*, a.name, a.base_locale
       FROM booking_app.slots s
       JOIN booking_app.activities a
         ON a.tenant_id=s.tenant_id AND a.center_id=s.center_id AND a.id=s.activity_id
       WHERE s.tenant_id=$1::uuid AND s.center_id=$2::uuid
         AND s.starts_at < $4::timestamptz
         AND s.starts_at + s.duration_minutes * interval '1 minute' > $3::timestamptz
         AND ($5::uuid IS NULL OR s.activity_id=$5::uuid)
         AND ($6::text IS NULL OR s.status=$6)
       ORDER BY s.starts_at, s.id LIMIT $7::int + 1 OFFSET $8::bigint
     ), occupancy AS (
       SELECT b.slot_id,
         coalesce(sum(b.seats) FILTER (WHERE b.status='Confirmed'), 0) AS confirmed,
         coalesce(sum(b.seats) FILTER (
           WHERE b.status='Pending' AND b.hold_expires_at > o.as_of
         ), 0) AS held
       FROM booking_app.bookings b CROSS JOIN observation o
       WHERE b.tenant_id=$1::uuid AND b.center_id=$2::uuid
         AND b.slot_id IN (SELECT id FROM selected)
       GROUP BY b.slot_id
     ), visible AS (SELECT * FROM selected ORDER BY starts_at, id LIMIT $7::int)
     SELECT jsonb_build_object(
       'items', coalesce((SELECT jsonb_agg(jsonb_build_object(
         'id', s.id, 'activityId', s.activity_id,
         'activity', jsonb_build_object('name', s.name, 'baseLocale', s.base_locale),
         'status', s.status,
         'startsAt', to_char(s.starts_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
         'durationMinutes', s.duration_minutes, 'capacity', s.capacity,
         'createdAt', to_char(s.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
         'confirmedSeats', coalesce(b.confirmed, 0), 'heldSeats', coalesce(b.held, 0),
         'remainingSeats', NULL
       ) ORDER BY s.starts_at, s.id)
       FROM visible s LEFT JOIN occupancy b ON b.slot_id=s.id), '[]'::jsonb),
       'page', $9::bigint, 'pageSize', $7::int,
       'hasNext', EXISTS (SELECT 1 FROM selected OFFSET $7::int),
       'asOf', to_char(o.as_of AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
     ) AS page FROM observation o`,
    [
      scope.access.tenantId,
      scope.centerId,
      postgresInstant(query.from),
      postgresInstant(query.to),
      query.activityId ?? null,
      query.slotStatus ?? null,
      query.pageSize,
      query.offset,
      query.page,
    ],
  );
  const page = result.rows[0]?.page;
  if (!page) throw new Error('Calendar observation unavailable');
  return page;
}

export async function readBookings(
  client: ReadConnection,
  scope: ResolvedCenterApplicationScope,
  slotId: string,
  query: BookingQuery,
): Promise<BookingPageReadDto> {
  const result = await client.query<{
    item: BookingPageReadDto['items'][number];
  }>(
    `SELECT jsonb_build_object(
       'bookingId', id, 'status', status, 'seats', seats, 'bookingChannel', booking_channel,
       'createdAt', to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
       'holdExpiresAt', to_char(hold_expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
     ) AS item FROM booking_app.bookings
     WHERE tenant_id=$1::uuid AND center_id=$2::uuid AND slot_id=$3::uuid
       AND ($4::text IS NULL OR status=$4)
     ORDER BY created_at, id LIMIT $5::int + 1 OFFSET $6::bigint`,
    [
      scope.access.tenantId,
      scope.centerId,
      slotId,
      query.bookingStatus ?? null,
      query.pageSize,
      query.offset,
    ],
  );
  return {
    items: result.rows.slice(0, query.pageSize).map((row) => row.item),
    page: query.page,
    pageSize: query.pageSize,
    hasNext: result.rows.length > query.pageSize,
  };
}

export async function readContact(
  client: ReadConnection,
  scope: ResolvedCenterApplicationScope,
  bookingId: string,
): Promise<BookingContactReadDto | undefined> {
  const result = await client.query<{ contact: BookingContactReadDto }>(
    `SELECT jsonb_build_object('bookingId', id, 'booker', jsonb_build_object(
       'firstName', booker_first_name, 'lastName', booker_last_name,
       'email', booker_email, 'phone', booker_phone
     )) AS contact FROM booking_app.bookings
     WHERE tenant_id=$1::uuid AND center_id=$2::uuid AND id=$3::uuid`,
    [scope.access.tenantId, scope.centerId, bookingId],
  );
  return result.rows[0]?.contact;
}

export async function resourceExists(
  client: ReadConnection,
  scope: ResolvedCenterApplicationScope,
  type: 'center' | 'activity' | 'slot',
  id: string,
): Promise<boolean> {
  const tables = {
    center: 'iam_app.centers',
    activity: 'booking_app.activities',
    slot: 'booking_app.slots',
  };
  const centerCheck = type === 'center' ? 'id=$2::uuid' : 'center_id=$2::uuid';
  const result = await client.query(
    `SELECT id FROM ${tables[type]} WHERE tenant_id=$1::uuid AND ${centerCheck} AND id=$3::uuid`,
    [scope.access.tenantId, scope.centerId, id],
  );
  return result.rows.length === 1;
}
