import { count, eq } from 'drizzle-orm';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  auditRecords,
  consumerReceipts,
  notes,
  outboxEvents,
} from '../../src/harness-schema.js';
import { withTenant } from '../../src/harness-unit-of-work.js';
import {
  centerA1,
  centerA2,
  centerB1,
  createAdminPool,
  createAppPool,
  setupHarness,
  tenantA,
  tenantB,
  truncateTenantData,
} from './harness.js';

describe('MT-SPIKE-001 isolation', () => {
  let adminPool: Pool;
  let appPool: Pool;

  beforeAll(async () => {
    adminPool = createAdminPool();
    appPool = createAppPool();
    await setupHarness(adminPool);
  });

  beforeEach(async () => {
    await truncateTenantData(adminPool);
  });

  afterAll(async () => {
    await appPool.end();
    await adminPool.end();
  });

  it('requires a non-null tenant key on every tenant-owned table (MT-REQ-001)', async () => {
    const tenantOwnedTables = [
      'audit_records',
      'centers',
      'consumer_receipts',
      'memberships',
      'notes',
      'outbox_events',
    ];
    const tenantColumns = await adminPool.query<{
      is_nullable: 'NO' | 'YES' | null;
      table_name: string;
    }>(
      `SELECT tables.tablename AS table_name, columns.is_nullable
       FROM pg_tables tables
       LEFT JOIN information_schema.columns columns
         ON columns.table_schema = tables.schemaname
        AND columns.table_name = tables.tablename
        AND columns.column_name = 'tenant_id'
       WHERE tables.schemaname = 'mt_spike'
         AND tables.tablename = ANY($1)
       ORDER BY tables.tablename`,
      [tenantOwnedTables],
    );
    expect(tenantColumns.rows).toEqual([
      { is_nullable: 'NO', table_name: 'audit_records' },
      { is_nullable: 'NO', table_name: 'centers' },
      { is_nullable: 'NO', table_name: 'consumer_receipts' },
      { is_nullable: 'NO', table_name: 'memberships' },
      { is_nullable: 'NO', table_name: 'notes' },
      { is_nullable: 'NO', table_name: 'outbox_events' },
    ]);

    const nullTenantInserts = [
      `INSERT INTO mt_spike.centers (id, tenant_id, name)
       VALUES ('01010101-0101-0101-0101-010101010101', NULL, 'invalid')`,
      `INSERT INTO mt_spike.notes (id, tenant_id, center_id, body)
       VALUES ('02020202-0202-0202-0202-020202020202', NULL, '${centerA1}', 'invalid')`,
      `INSERT INTO mt_spike.outbox_events
         (id, tenant_id, event_type, payload, correlation_id, idempotency_key)
       VALUES ('03030303-0303-0303-0303-030303030303', NULL, 'invalid', '{}', 'invalid', 'invalid')`,
      `INSERT INTO mt_spike.audit_records
         (id, tenant_id, actor, action, resource, result, correlation_id)
       VALUES ('04040404-0404-0404-0404-040404040404', NULL, 'invalid', 'invalid', 'invalid', 'invalid', 'invalid')`,
      `INSERT INTO mt_spike.consumer_receipts (tenant_id, event_id, consumer)
       VALUES (NULL, '03030303-0303-0303-0303-030303030303', 'invalid')`,
      `INSERT INTO mt_spike.memberships (tenant_id, identity_id, permissions)
       VALUES (NULL, 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', ARRAY['center.read'])`,
    ];
    for (const statement of nullTenantInserts) {
      await expect(adminPool.query(statement)).rejects.toThrow();
    }
  });

  it('allows authorized writes and reads inside tenant and center scope (MT-REQ-001, MT-REQ-002, MT-REQ-010)', async () => {
    const noteId = '33333333-3333-3333-3333-333333333333';

    await withTenant(appPool, tenantA, async ({ db }) => {
      await db.insert(notes).values({
        id: noteId,
        tenantId: tenantA,
        centerId: centerA1,
        body: 'tenant-a-note',
      });
      const rows = await db.select().from(notes).where(eq(notes.id, noteId));
      expect(rows).toHaveLength(1);
      expect(rows[0]?.tenantId).toBe(tenantA);
    });
  });

  it('rejects cross-tenant center relationships (MT-REQ-003)', async () => {
    await expect(
      withTenant(appPool, tenantA, async ({ db }) => {
        await db.insert(notes).values({
          id: '44444444-4444-4444-4444-444444444444',
          tenantId: tenantA,
          centerId: centerB1,
          body: 'cross-tenant',
        });
      }),
    ).rejects.toThrow();

    await withTenant(appPool, tenantA, async ({ db }) => {
      await db.insert(notes).values({
        id: '43434343-4343-4343-4343-434343434343',
        tenantId: tenantA,
        centerId: centerA1,
        body: 'valid-before-update',
      });
    });
    await expect(
      withTenant(appPool, tenantA, async ({ db }) => {
        await db
          .update(notes)
          .set({ centerId: centerB1 })
          .where(eq(notes.id, '43434343-4343-4343-4343-434343434343'));
      }),
    ).rejects.toThrow();

    const eventId = '42424242-4242-4242-4242-424242424242';
    await withTenant(appPool, tenantA, async ({ db }) => {
      await db.insert(outboxEvents).values({
        id: eventId,
        tenantId: tenantA,
        eventType: 'isolation.test',
        payload: {},
        correlationId: 'cross-tenant-receipt',
        idempotencyKey: 'cross-tenant-receipt',
        createdAt: new Date(),
      });
    });
    await expect(
      withTenant(appPool, tenantB, async ({ db }) => {
        await db.insert(consumerReceipts).values({
          tenantId: tenantB,
          eventId,
          consumer: 'worker-b',
          processedAt: new Date(),
        });
      }),
    ).rejects.toThrow();
  });

  it('rejects a row owned by another tenant under explicit context (MT-REQ-002)', async () => {
    await expect(
      withTenant(appPool, tenantA, async ({ db }) => {
        await db.insert(notes).values({
          id: '45454545-4545-4545-4545-454545454545',
          tenantId: tenantB,
          centerId: centerB1,
          body: 'wrong-tenant-context',
        });
      }),
    ).rejects.toThrow();
  });

  it('hides other-tenant rows and does not disclose them (MT-REQ-009)', async () => {
    await withTenant(appPool, tenantA, async ({ db }) => {
      await db.insert(notes).values({
        id: '55555555-5555-5555-5555-555555555555',
        tenantId: tenantA,
        centerId: centerA1,
        body: 'secret-a',
      });
      await db.insert(auditRecords).values({
        id: '56565656-5656-5656-5656-565656565656',
        tenantId: tenantA,
        actor: 'tenant-a-user',
        action: 'note.created',
        resource: '55555555-5555-5555-5555-555555555555',
        result: 'ok',
        correlationId: 'tenant-a-correlation',
        createdAt: new Date(),
      });
    });

    const visibleToB = await withTenant(appPool, tenantB, async ({ db }) => {
      return {
        aggregate: await db.select({ value: count() }).from(notes),
        audit: await db.select().from(auditRecords),
        byId: await db
          .select()
          .from(notes)
          .where(eq(notes.id, '55555555-5555-5555-5555-555555555555')),
        notes: await db.select().from(notes),
      };
    });
    expect(visibleToB).toEqual({
      aggregate: [{ value: 0 }],
      audit: [],
      byId: [],
      notes: [],
    });

    const mutationsByB = await withTenant(appPool, tenantB, async ({ db }) => {
      const updated = await db
        .update(notes)
        .set({ body: 'tampered-by-b' })
        .where(eq(notes.id, '55555555-5555-5555-5555-555555555555'))
        .returning({ id: notes.id });
      const deleted = await db
        .delete(notes)
        .where(eq(notes.id, '55555555-5555-5555-5555-555555555555'))
        .returning({ id: notes.id });
      return { deleted, updated };
    });
    expect(mutationsByB).toEqual({ deleted: [], updated: [] });

    const ownerView = await withTenant(appPool, tenantA, async ({ db }) => {
      return db
        .select({ body: notes.body })
        .from(notes)
        .where(eq(notes.id, '55555555-5555-5555-5555-555555555555'));
    });
    expect(ownerView).toEqual([{ body: 'secret-a' }]);
  });

  it('fails closed without tenant context (MT-REQ-006)', async () => {
    const client = await appPool.connect();
    try {
      await expect(
        client.query('SELECT * FROM mt_spike.notes'),
      ).rejects.toThrow();
      await expect(
        client.query(
          `INSERT INTO mt_spike.notes (id, tenant_id, center_id, body)
           VALUES ('57575757-5757-5757-5757-575757575757', $1, $2, 'no-context')`,
          [tenantA, centerA1],
        ),
      ).rejects.toThrow();
      await expect(
        client.query("UPDATE mt_spike.notes SET body = 'no-context'"),
      ).rejects.toThrow();
      await expect(
        client.query('DELETE FROM mt_spike.notes'),
      ).rejects.toThrow();
    } finally {
      client.release();
    }
  });

  it('fails closed with malformed or unknown tenant context (MT-REQ-006)', async () => {
    await expect(
      withTenant(appPool, '', async ({ db }) => {
        await db.select().from(notes);
      }),
    ).rejects.toThrow();
    await expect(
      withTenant(appPool, 'not-a-uuid', async ({ db }) => {
        await db.select().from(notes);
      }),
    ).rejects.toThrow();

    const unknownTenant = '12121212-1212-1212-1212-121212121212';
    const visible = await withTenant(appPool, unknownTenant, async ({ db }) => {
      return db.select().from(notes);
    });
    expect(visible).toEqual([]);

    await expect(
      withTenant(appPool, unknownTenant, async ({ db }) => {
        await db.insert(notes).values({
          id: '58585858-5858-5858-5858-585858585858',
          tenantId: unknownTenant,
          centerId: centerA1,
          body: 'unknown-tenant',
        });
      }),
    ).rejects.toThrow();
  });

  it('rejects spoofed tenant changes and repeats negatives across centers (MT-REQ-006, MT-REQ-010)', async () => {
    const noteId = '59595959-5959-5959-5959-595959595959';
    await withTenant(appPool, tenantA, async ({ db }) => {
      await db.insert(notes).values({
        id: noteId,
        tenantId: tenantA,
        centerId: centerA1,
        body: 'tenant-a-owned',
      });
    });
    await expect(
      withTenant(appPool, tenantA, async ({ db }) => {
        await db
          .update(notes)
          .set({ tenantId: tenantB, centerId: centerB1 })
          .where(eq(notes.id, noteId));
      }),
    ).rejects.toThrow();

    for (const centerId of [centerA1, centerA2]) {
      await expect(
        withTenant(appPool, tenantB, async ({ db }) => {
          await db.insert(notes).values({
            id:
              centerId === centerA1
                ? '60606060-6060-6060-6060-606060606060'
                : '61616161-6161-6161-6161-616161616161',
            tenantId: tenantB,
            centerId,
            body: 'cross-center-negative',
          });
        }),
      ).rejects.toThrow();
    }
  });
});
