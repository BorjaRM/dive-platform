import { eq } from 'drizzle-orm';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { processOutboxOnce } from '../../src/outbox-consumer.js';
import { auditRecords, outboxEvents } from '../../src/schema.js';
import { withTenant } from '../../src/unit-of-work.js';
import {
  createAdminPool,
  createAppPool,
  setupHarness,
  tenantA,
  tenantB,
  truncateTenantData,
} from './harness.js';

describe('MT-SPIKE-001 outbox', () => {
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

  it('writes domain audit and outbox atomically and keeps tenant on consume (MT-REQ-007, MT-REQ-008)', async () => {
    const eventId = '77777777-7777-7777-7777-777777777777';
    const correlationId = 'corr-outbox-1';

    await withTenant(appPool, tenantA, async ({ db, client }) => {
      await db.insert(outboxEvents).values({
        id: eventId,
        tenantId: tenantA,
        eventType: 'note.created',
        payload: { ok: true },
        correlationId,
        idempotencyKey: 'idem-1',
        createdAt: new Date(),
      });
      await db.insert(auditRecords).values({
        id: '88888888-8888-8888-8888-888888888888',
        tenantId: tenantA,
        actor: 'spike',
        action: 'note.created',
        resource: eventId,
        result: 'ok',
        correlationId,
        createdAt: new Date(),
      });
      await client.query('SELECT 1');
    });

    const first = await processOutboxOnce(
      appPool,
      tenantA,
      eventId,
      'worker-a',
    );
    const second = await processOutboxOnce(
      appPool,
      tenantA,
      eventId,
      'worker-a',
    );
    expect(first).toBe('processed');
    expect(second).toBe('duplicate');

    await expect(
      processOutboxOnce(appPool, tenantB, eventId, 'worker-a'),
    ).rejects.toThrow(/not visible/);

    const audit = await withTenant(appPool, tenantA, async ({ db }) => {
      return db
        .select()
        .from(auditRecords)
        .where(eq(auditRecords.correlationId, correlationId));
    });
    expect(audit).toHaveLength(1);
    expect(audit[0]?.tenantId).toBe(tenantA);
  });

  it('rolls back outbox together with the domain write (MT-REQ-007)', async () => {
    await expect(
      withTenant(appPool, tenantA, async ({ db }) => {
        await db.insert(outboxEvents).values({
          id: '99999999-9999-9999-9999-999999999999',
          tenantId: tenantA,
          eventType: 'note.created',
          payload: { ok: false },
          correlationId: 'corr-rollback',
          idempotencyKey: 'idem-rollback',
          createdAt: new Date(),
        });
        throw new Error('forced-failure');
      }),
    ).rejects.toThrow('forced-failure');

    const leftover = await withTenant(appPool, tenantA, async ({ db }) => {
      return db.select().from(outboxEvents);
    });
    expect(leftover).toEqual([]);
  });
});
