import { eq } from 'drizzle-orm';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { recordBookingCatalogMutation } from '../../src/booking-catalog-commands.js';
import {
  bookingActivities,
  bookingBookings,
  bookingCapabilityVerifiers,
  bookingChannels,
  bookingSlots,
} from '../../src/booking-schema.js';
import { bootstrapRoles } from '../../src/bootstrap-roles.js';
import { migrateProduct } from '../../src/migrate.js';
import { withTenant } from '../../src/unit-of-work.js';
import {
  centerA1,
  centerB1,
  createAdminPool,
  createAppPool,
  tenantA,
  tenantB,
} from './harness.js';

const activityA = 'aaaaaaaa-1001-4001-8001-000000000001';
const activityB = 'bbbbbbbb-2002-4002-8002-000000000001';
const slotA = 'aaaaaaaa-1001-4001-8001-000000000011';
const slotB = 'bbbbbbbb-2002-4002-8002-000000000011';
const channelA = 'aaaaaaaa-1001-4001-8001-000000000041';
const channelB = 'bbbbbbbb-2002-4002-8002-000000000041';
const bookingA = 'aaaaaaaa-1001-4001-8001-000000000051';
const bookingB = 'bbbbbbbb-2002-4002-8002-000000000051';
const verifierA = 'aaaaaaaa-1001-4001-8001-000000000061';
const verifierB = 'bbbbbbbb-2002-4002-8002-000000000061';
const rollbackActivity = 'aaaaaaaa-1001-4001-8001-000000000021';
const rollbackActor = 'aaaaaaaa-1001-4001-8001-000000000031';
const rollbackMembership = 'aaaaaaaa-1001-4001-8001-000000000032';
const rollbackOutbox = 'aaaaaaaa-1001-4001-8001-000000000033';
const rollbackCorrelation = 'aaaaaaaa-1001-4001-8001-000000000034';
const rollbackIdempotencyKey = 'booking.catalog.rollback-conflict';

describe('booking catalog persistence controls', () => {
  let adminPool: Pool;
  let appPool: Pool;

  beforeAll(async () => {
    adminPool = createAdminPool();
    appPool = createAppPool(1);
    await bootstrapRoles(adminPool);
    await migrateProduct();
  });

  beforeEach(async () => {
    await adminPool.query(
      'TRUNCATE booking_app.capability_verifiers, booking_app.bookings, booking_app.channels, booking_app.slots, booking_app.activities',
    );
    await adminPool.query(
      `INSERT INTO iam_app.tenants(id, name) VALUES ($1, 'A'), ($2, 'B')
       ON CONFLICT (id) DO NOTHING`,
      [tenantA, tenantB],
    );
    await adminPool.query(
      `INSERT INTO iam_app.centers(id, tenant_id, name, time_zone)
       VALUES ($1, $2, 'A1', 'Europe/Madrid'), ($3, $4, 'B1', 'Europe/Madrid')
        ON CONFLICT (tenant_id, id) DO NOTHING`,
      [centerA1, tenantA, centerB1, tenantB],
    );
    await adminPool.query(
      `INSERT INTO iam_app.identities(id) VALUES ($1)
       ON CONFLICT (id) DO NOTHING`,
      [rollbackActor],
    );
    await adminPool.query(
      `INSERT INTO iam_app.memberships(id, tenant_id, identity_id, status, roles, center_ids)
       VALUES ($1, $2, $3, 'active', ARRAY['tenant_owner'], NULL)
       ON CONFLICT (tenant_id, id) DO NOTHING`,
      [rollbackMembership, tenantA, rollbackActor],
    );
    await adminPool.query(
      `INSERT INTO booking_app.activities
       (id, tenant_id, center_id, name, status)
       VALUES
         ($1, $2, $3, '{"es":"Actividad A"}'::jsonb, 'Draft'),
         ($4, $5, $6, '{"es":"Actividad B"}'::jsonb, 'Draft')`,
      [activityA, tenantA, centerA1, activityB, tenantB, centerB1],
    );
    await adminPool.query(
      `INSERT INTO booking_app.slots
       (id, tenant_id, center_id, activity_id, starts_at, duration_minutes, capacity, status)
       VALUES
         ($1, $2, $3, $4, '2026-10-01T10:00:00Z', 60, 4, 'Available'),
         ($5, $6, $7, $8, '2026-10-01T11:00:00Z', 60, 4, 'Available')`,
      [
        slotA,
        tenantA,
        centerA1,
        activityA,
        slotB,
        tenantB,
        centerB1,
        activityB,
      ],
    );
  });

  afterAll(async () => {
    await appPool?.end();
    await adminPool?.end();
  });

  it('keeps booking rows isolated and clears pooled tenant context (MT-REQ-005, MT-REQ-006, MT-REQ-009, MT-REQ-010)', async () => {
    await expect(
      appPool.query('SELECT id FROM booking_app.activities'),
    ).rejects.toThrow();
    await expect(
      appPool.query('SELECT id FROM booking_app.slots'),
    ).rejects.toThrow();

    const rowsA = await withTenant(appPool, tenantA, ({ db }) =>
      db
        .select({
          id: bookingActivities.id,
          tenantId: bookingActivities.tenantId,
        })
        .from(bookingActivities),
    );
    expect(rowsA).toEqual([{ id: activityA, tenantId: tenantA }]);

    const slotsA = await withTenant(appPool, tenantA, ({ db }) =>
      db
        .select({
          id: bookingSlots.id,
          tenantId: bookingSlots.tenantId,
          activityId: bookingSlots.activityId,
        })
        .from(bookingSlots),
    );
    expect(slotsA).toEqual([
      { id: slotA, tenantId: tenantA, activityId: activityA },
    ]);

    const foreignRows = await withTenant(appPool, tenantA, ({ db }) =>
      db
        .select({ id: bookingActivities.id })
        .from(bookingActivities)
        .where(eq(bookingActivities.id, activityB)),
    );
    expect(foreignRows).toEqual([]);

    const foreignSlotRows = await withTenant(appPool, tenantA, ({ db }) =>
      db
        .select({ id: bookingSlots.id })
        .from(bookingSlots)
        .where(eq(bookingSlots.id, slotB)),
    );
    expect(foreignSlotRows).toEqual([]);

    const rowsB = await withTenant(appPool, tenantB, ({ db }) =>
      db
        .select({
          id: bookingActivities.id,
          tenantId: bookingActivities.tenantId,
        })
        .from(bookingActivities),
    );
    expect(rowsB).toEqual([{ id: activityB, tenantId: tenantB }]);

    const slotsB = await withTenant(appPool, tenantB, ({ db }) =>
      db
        .select({
          id: bookingSlots.id,
          tenantId: bookingSlots.tenantId,
          activityId: bookingSlots.activityId,
        })
        .from(bookingSlots),
    );
    expect(slotsB).toEqual([
      { id: slotB, tenantId: tenantB, activityId: activityB },
    ]);

    await withTenant(appPool, tenantA, ({ db }) =>
      db
        .update(bookingActivities)
        .set({ name: { es: 'No debe cambiar' } })
        .where(eq(bookingActivities.id, activityB)),
    );
    await expect(
      withTenant(appPool, tenantA, ({ db }) =>
        db.delete(bookingActivities).where(eq(bookingActivities.id, activityB)),
      ),
    ).rejects.toThrow();

    const unchangedForeignRow = await adminPool.query<{
      name: { es?: string };
      status: string;
    }>(
      `SELECT name, status
       FROM booking_app.activities
       WHERE tenant_id=$1 AND id=$2`,
      [tenantB, activityB],
    );
    expect(unchangedForeignRow.rows).toEqual([
      { name: { es: 'Actividad B' }, status: 'Draft' },
    ]);

    await withTenant(appPool, tenantA, ({ db }) =>
      db
        .update(bookingSlots)
        .set({ status: 'Closed' })
        .where(eq(bookingSlots.id, slotB)),
    );
    await expect(
      withTenant(appPool, tenantA, ({ db }) =>
        db.delete(bookingSlots).where(eq(bookingSlots.id, slotB)),
      ),
    ).rejects.toThrow();

    const unchangedForeignSlot = await adminPool.query<{
      status: string;
    }>(
      `SELECT status
       FROM booking_app.slots
       WHERE tenant_id=$1 AND id=$2`,
      [tenantB, slotB],
    );
    expect(unchangedForeignSlot.rows).toEqual([{ status: 'Available' }]);

    await expect(
      withTenant(appPool, tenantA, ({ db }) =>
        db.insert(bookingActivities).values({
          id: 'aaaaaaaa-1001-4001-8001-000000000002',
          tenantId: tenantB,
          centerId: centerB1,
          name: { es: 'Spoofed' },
          status: 'Draft',
        }),
      ),
    ).rejects.toThrow();

    const afterSpoof = await adminPool.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM booking_app.activities
       WHERE tenant_id=$1 AND id='aaaaaaaa-1001-4001-8001-000000000002'`,
      [tenantB],
    );
    expect(afterSpoof.rows[0]?.count).toBe('0');

    await expect(
      withTenant(appPool, tenantA, ({ db }) =>
        db.insert(bookingSlots).values({
          id: 'aaaaaaaa-1001-4001-8001-000000000012',
          tenantId: tenantB,
          centerId: centerB1,
          activityId: activityB,
          startsAt: new Date('2026-10-01T12:00:00Z'),
          durationMinutes: 60,
          capacity: 4,
          status: 'Available',
        }),
      ),
    ).rejects.toThrow();

    const afterSlotSpoof = await adminPool.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM booking_app.slots
       WHERE tenant_id=$1 AND id='aaaaaaaa-1001-4001-8001-000000000012'`,
      [tenantB],
    );
    expect(afterSlotSpoof.rows[0]?.count).toBe('0');

    const setting = await appPool.query<{ tenant_id: string | null }>(
      `SELECT current_setting('app.tenant_id', true) AS tenant_id`,
    );
    expect(setting.rows[0]?.tenant_id).toBe('');
  });

  it('keeps public booking tables isolated and fails closed without context (MT-REQ-001, MT-REQ-004, MT-REQ-005, MT-REQ-006, MT-REQ-010)', async () => {
    await adminPool.query(
      `INSERT INTO booking_app.channels
       (id, tenant_id, center_id, public_id, type, activity_id, status, confirmation_mode, allowed_origins)
       VALUES
         ($1, $2, $3, 'channel-a', 'single_activity', $4, 'Published', 'immediate', ARRAY['https://a.example.test']),
         ($5, $6, $7, 'channel-b', 'single_activity', $8, 'Published', 'immediate', ARRAY['https://b.example.test'])`,
      [
        channelA,
        tenantA,
        centerA1,
        activityA,
        channelB,
        tenantB,
        centerB1,
        activityB,
      ],
    );
    await adminPool.query(
      `INSERT INTO booking_app.bookings
       (id, tenant_id, center_id, channel_id, slot_id, booking_channel, idempotency_key, request_hash, status, seats, locale, booker_first_name, booker_last_name, booker_email)
       VALUES
         ($1, $2, $3, $4, $5, 'public_hosted', 'tenant-a-key', 'hash-a', 'Confirmed', 1, 'es', 'Ana', 'A', 'ana@example.test'),
         ($6, $7, $8, $9, $10, 'public_hosted', 'tenant-b-key', 'hash-b', 'Confirmed', 1, 'en', 'Ben', 'B', 'ben@example.test')`,
      [
        bookingA,
        tenantA,
        centerA1,
        channelA,
        slotA,
        bookingB,
        tenantB,
        centerB1,
        channelB,
        slotB,
      ],
    );
    await adminPool.query(
      `INSERT INTO booking_app.capability_verifiers
       (id, tenant_id, booking_id, purpose, version, verifier_hash, expires_at)
       VALUES
         ($1, $2, $3, 'booking_cancel', 1, 'hash-a', now() + interval '1 hour'),
         ($4, $5, $6, 'booking_cancel', 1, 'hash-b', now() + interval '1 hour')`,
      [verifierA, tenantA, bookingA, verifierB, tenantB, bookingB],
    );

    const tenantARows = await withTenant(appPool, tenantA, ({ db }) =>
      Promise.all([
        db.select({ id: bookingChannels.id }).from(bookingChannels),
        db.select({ id: bookingBookings.id }).from(bookingBookings),
        db
          .select({ id: bookingCapabilityVerifiers.id })
          .from(bookingCapabilityVerifiers),
      ]),
    );
    expect(tenantARows).toEqual([
      [{ id: channelA }],
      [{ id: bookingA }],
      [{ id: verifierA }],
    ]);

    const crossTenantRows = await withTenant(appPool, tenantA, ({ db }) =>
      Promise.all([
        db
          .select({ id: bookingChannels.id })
          .from(bookingChannels)
          .where(eq(bookingChannels.id, channelB)),
        db
          .select({ id: bookingBookings.id })
          .from(bookingBookings)
          .where(eq(bookingBookings.id, bookingB)),
        db
          .select({ id: bookingCapabilityVerifiers.id })
          .from(bookingCapabilityVerifiers)
          .where(eq(bookingCapabilityVerifiers.id, verifierB)),
      ]),
    );
    expect(crossTenantRows).toEqual([[], [], []]);

    const withoutContext = await appPool.query<{ channel_count: string }>(
      `SELECT count(*)::text AS channel_count FROM booking_app.channels`,
    );
    expect(withoutContext.rows[0]?.channel_count).toBe('0');

    const malformedContextClient = await appPool.connect();
    try {
      await malformedContextClient.query('BEGIN');
      await malformedContextClient.query(
        `SELECT set_config('app.tenant_id', 'not-a-uuid', true)`,
      );
      await expect(
        malformedContextClient.query('SELECT id FROM booking_app.channels'),
      ).rejects.toThrow();
      await malformedContextClient.query('ROLLBACK');
    } finally {
      malformedContextClient.release();
    }
  });

  it('exposes public booking side effects only through a tenant-scoped command (DIVE-BOOK-REQ-045, MT-REQ-004, MT-REQ-007)', async () => {
    const command = await adminPool.query<{
      app_can_execute: boolean;
      owner: string;
      proconfig: string[] | null;
      prosecdef: boolean;
      public_can_execute: boolean;
    }>(
      `SELECT
         owner.rolname AS owner,
         routine.prosecdef,
         routine.proconfig,
         has_function_privilege('dive_app', routine.oid, 'EXECUTE') AS app_can_execute,
         has_function_privilege('public', routine.oid, 'EXECUTE') AS public_can_execute
       FROM pg_proc routine
       JOIN pg_namespace namespace ON namespace.oid = routine.pronamespace
       JOIN pg_roles owner ON owner.oid = routine.proowner
       WHERE namespace.nspname = 'iam_app'
         AND routine.proname = 'record_public_booking_created'`,
    );
    expect(command.rows).toEqual([
      {
        app_can_execute: true,
        owner: 'dive_migration',
        proconfig: ['search_path=iam_app, booking_app, pg_temp'],
        prosecdef: true,
        public_can_execute: false,
      },
    ]);

    await expect(
      appPool.query(
        'SELECT iam_app.record_public_booking_created($1::uuid, $2::uuid, $3::uuid)',
        [tenantA, bookingA, rollbackCorrelation],
      ),
    ).rejects.toThrow();
  });

  it('rolls back catalog domain, audit, and outbox changes together (DIVE-BOOK-REQ-045, MT-REQ-007)', async () => {
    await adminPool.query(
      `DELETE FROM iam_app.audit_records WHERE tenant_id=$1 AND resource_id=$2`,
      [tenantA, rollbackActivity],
    );
    await adminPool.query(
      `DELETE FROM iam_app.outbox_events WHERE tenant_id=$1 AND idempotency_key=$2`,
      [tenantA, rollbackIdempotencyKey],
    );
    await adminPool.query(
      `INSERT INTO iam_app.outbox_events
       (id, tenant_id, event_type, payload, correlation_id, idempotency_key)
       VALUES ($1, $2, 'test.catalog.rollback.conflict.v1', '{}'::jsonb, $3, $4)`,
      [rollbackOutbox, tenantA, rollbackCorrelation, rollbackIdempotencyKey],
    );

    await expect(
      withTenant(appPool, tenantA, async ({ client, db }) => {
        await db.insert(bookingActivities).values({
          id: rollbackActivity,
          tenantId: tenantA,
          centerId: centerA1,
          name: { es: 'Rollback', en: 'Rollback' },
          status: 'Draft',
        });
        await recordBookingCatalogMutation(client, {
          tenantId: tenantA,
          actorIdentityId: rollbackActor,
          action: 'booking.create',
          resourceType: 'activity',
          resourceId: rollbackActivity,
          eventType: 'booking.activity.created.v1',
          payload: { activityId: rollbackActivity, centerId: centerA1 },
          correlationId: rollbackCorrelation,
          idempotencyKey: rollbackIdempotencyKey,
        });
      }),
    ).rejects.toThrow();

    const state = await adminPool.query<{
      activity_count: number;
      audit_count: number;
      outbox_count: number;
    }>(
      `SELECT
         (SELECT count(*)::int FROM booking_app.activities WHERE tenant_id=$1 AND id=$2) activity_count,
         (SELECT count(*)::int FROM iam_app.audit_records WHERE tenant_id=$1 AND resource_id=$2) audit_count,
         (SELECT count(*)::int FROM iam_app.outbox_events WHERE tenant_id=$1 AND idempotency_key=$3) outbox_count`,
      [tenantA, rollbackActivity, rollbackIdempotencyKey],
    );
    expect(state.rows[0]).toEqual({
      activity_count: 0,
      audit_count: 0,
      outbox_count: 1,
    });
  });
});
