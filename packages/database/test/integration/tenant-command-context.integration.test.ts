import type { Pool, PoolClient } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { recordBookingCatalogMutation } from '../../src/booking-catalog-commands.js';
import { bootstrapRoles } from '../../src/bootstrap-roles.js';
import { migrateProduct } from '../../src/migrate.js';
import { recordPublicBookingCreated } from '../../src/public-booking-commands.js';
import { withTenant } from '../../src/unit-of-work.js';
import { createAdminPool, createAppPool, tenantA, tenantB } from './harness.js';

const commands: ReadonlyArray<{
  correlationId: string;
  execute(client: PoolClient): Promise<void>;
  name: string;
}> = [
  {
    name: 'catalog mutation',
    correlationId: 'aaaaaaaa-1001-4001-8001-000000000023',
    execute: (client) =>
      recordBookingCatalogMutation(client, {
        tenantId: tenantB,
        actorIdentityId: 'aaaaaaaa-1001-4001-8001-000000000031',
        action: 'booking.create',
        resourceType: 'activity',
        resourceId: 'aaaaaaaa-1001-4001-8001-000000000022',
        eventType: 'booking.activity.created.v1',
        payload: { activityId: 'aaaaaaaa-1001-4001-8001-000000000022' },
        correlationId: 'aaaaaaaa-1001-4001-8001-000000000023',
        idempotencyKey: 'booking.catalog.tenant-mismatch',
      }),
  },
  {
    name: 'public booking creation',
    correlationId: 'aaaaaaaa-1001-4001-8001-000000000024',
    execute: (client) =>
      recordPublicBookingCreated(client, {
        tenantId: tenantB,
        bookingId: 'aaaaaaaa-1001-4001-8001-000000000025',
        correlationId: 'aaaaaaaa-1001-4001-8001-000000000024',
      }),
  },
];

describe('tenant-scoped product commands', () => {
  let adminPool: Pool;
  let appPool: Pool;

  beforeAll(async () => {
    adminPool = createAdminPool();
    appPool = createAppPool(1);
    await bootstrapRoles(adminPool);
    await migrateProduct();
  });

  afterAll(async () => {
    await appPool.end();
    await adminPool.end();
  });

  it.each(commands)(
    'rejects $name when its tenant differs from transaction context (MT-REQ-005, MT-REQ-007, MT-REQ-010)',
    async ({ correlationId, execute }) => {
      await expect(
        withTenant(appPool, tenantA, ({ client }) => execute(client)),
      ).rejects.toThrow(/Tenant context mismatch/);

      const effects = await adminPool.query<{
        audit_count: number;
        outbox_count: number;
      }>(
        `SELECT
           (SELECT count(*)::int FROM iam_app.audit_records WHERE correlation_id=$1) audit_count,
           (SELECT count(*)::int FROM iam_app.outbox_events WHERE correlation_id=$1) outbox_count`,
        [correlationId],
      );
      expect(effects.rows[0]).toEqual({
        audit_count: 0,
        outbox_count: 0,
      });
    },
  );
});
