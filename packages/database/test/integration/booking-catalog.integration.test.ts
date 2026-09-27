import { eq } from 'drizzle-orm';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { recordBookingCatalogMutation } from '../../src/booking-catalog-commands.js';
import { bookingActivities, bookingSlots } from '../../src/booking-schema.js';
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
    await adminPool.query('TRUNCATE booking_app.slots, booking_app.activities');
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
