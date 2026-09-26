import { eq } from 'drizzle-orm';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { processOutboxOnce } from '../../src/outbox-consumer.js';
import {
  auditRecords,
  consumerReceipts,
  notes,
  outboxEvents,
} from '../../src/schema.js';
import { withTenant } from '../../src/unit-of-work.js';
import {
  centerA1,
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
    const deliveredContexts: Array<{
      correlationId: string;
      tenantId: string;
    }> = [];

    await withTenant(appPool, tenantA, async ({ db, client }) => {
      await db.insert(notes).values({
        id: '76767676-7676-7676-7676-767676767676',
        tenantId: tenantA,
        centerId: centerA1,
        body: 'atomic-domain-change',
      });
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
      async ({ correlationId: deliveredCorrelationId, tenantId }) => {
        deliveredContexts.push({
          correlationId: deliveredCorrelationId,
          tenantId,
        });
      },
    );
    const second = await processOutboxOnce(
      appPool,
      tenantA,
      eventId,
      'worker-a',
      async ({ correlationId: deliveredCorrelationId, tenantId }) => {
        deliveredContexts.push({
          correlationId: deliveredCorrelationId,
          tenantId,
        });
      },
    );
    expect(first).toBe('processed');
    expect(second).toBe('duplicate');
    expect(deliveredContexts).toEqual([{ correlationId, tenantId: tenantA }]);

    const crossTenantError = await processOutboxOnce(
      appPool,
      tenantB,
      eventId,
      'worker-a',
    ).then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(crossTenantError).toBeInstanceOf(Error);
    expect((crossTenantError as Error).message).toBe(
      'Outbox event not visible in tenant context',
    );
    expect((crossTenantError as Error).message).not.toContain(eventId);
    expect((crossTenantError as Error).message).not.toContain(correlationId);

    const committed = await withTenant(appPool, tenantA, async ({ db }) => {
      return {
        audit: await db
          .select()
          .from(auditRecords)
          .where(eq(auditRecords.correlationId, correlationId)),
        domain: await db
          .select()
          .from(notes)
          .where(eq(notes.id, '76767676-7676-7676-7676-767676767676')),
        outbox: await db
          .select()
          .from(outboxEvents)
          .where(eq(outboxEvents.id, eventId)),
      };
    });
    expect(committed.audit).toHaveLength(1);
    expect(committed.audit[0]?.tenantId).toBe(tenantA);
    expect(committed.domain).toHaveLength(1);
    expect(committed.outbox).toHaveLength(1);
  });

  it('rolls back outbox together with the domain write (MT-REQ-007)', async () => {
    await expect(
      withTenant(appPool, tenantA, async ({ db }) => {
        await db.insert(notes).values({
          id: '98989898-9898-9898-9898-989898989898',
          tenantId: tenantA,
          centerId: centerA1,
          body: 'must-roll-back',
        });
        await db.insert(outboxEvents).values({
          id: '99999999-9999-9999-9999-999999999999',
          tenantId: tenantA,
          eventType: 'note.created',
          payload: { ok: false },
          correlationId: 'corr-rollback',
          idempotencyKey: 'idem-rollback',
          createdAt: new Date(),
        });
        await db.insert(auditRecords).values({
          id: '97979797-9797-9797-9797-979797979797',
          tenantId: tenantA,
          actor: 'spike',
          action: 'note.created',
          resource: '98989898-9898-9898-9898-989898989898',
          result: 'ok',
          correlationId: 'corr-rollback',
          createdAt: new Date(),
        });
        throw new Error('forced-failure');
      }),
    ).rejects.toThrow('forced-failure');

    const leftover = await withTenant(appPool, tenantA, async ({ db }) => {
      return {
        audit: await db.select().from(auditRecords),
        domain: await db.select().from(notes),
        outbox: await db.select().from(outboxEvents),
      };
    });
    expect(leftover).toEqual({ audit: [], domain: [], outbox: [] });
  });

  it('does not double-apply concurrent deliveries (MT-REQ-008)', async () => {
    const eventId = '96969696-9696-9696-9696-969696969696';
    await withTenant(appPool, tenantA, async ({ db }) => {
      await db.insert(outboxEvents).values({
        id: eventId,
        tenantId: tenantA,
        eventType: 'note.created',
        payload: { ok: true },
        correlationId: 'corr-concurrent',
        idempotencyKey: 'idem-concurrent',
        createdAt: new Date(),
      });
    });

    const applied: string[] = [];
    const results = await Promise.all([
      processOutboxOnce(appPool, tenantA, eventId, 'worker-a', async () => {
        applied.push('worker-a');
      }),
      processOutboxOnce(appPool, tenantA, eventId, 'worker-a', async () => {
        applied.push('worker-a');
      }),
    ]);

    expect(results.sort()).toEqual(['duplicate', 'processed']);
    expect(applied).toEqual(['worker-a']);
    const receipts = await withTenant(appPool, tenantA, async ({ db }) => {
      return db.select().from(consumerReceipts);
    });
    expect(receipts).toHaveLength(1);
  });

  it('rolls back the database effect with its receipt before retry (MT-REQ-007, MT-REQ-008)', async () => {
    const eventId = '95959595-9595-9595-9595-959595959595';
    const correlationId = 'corr-retry';
    await withTenant(appPool, tenantA, async ({ db }) => {
      await db.insert(outboxEvents).values({
        id: eventId,
        tenantId: tenantA,
        eventType: 'note.created',
        payload: { private: 'must-not-leak' },
        correlationId,
        idempotencyKey: 'idem-retry',
        createdAt: new Date(),
      });
    });

    await expect(
      processOutboxOnce(
        appPool,
        tenantA,
        eventId,
        'worker-a',
        async ({ correlationId: deliveredCorrelationId, db, tenantId }) => {
          await db.insert(auditRecords).values({
            id: '94949494-9494-9494-9494-949494949494',
            tenantId,
            actor: 'worker-a',
            action: 'note.created',
            resource: eventId,
            result: 'failed',
            correlationId: deliveredCorrelationId,
            createdAt: new Date(),
          });
          throw new Error('generic-worker-failure');
        },
      ),
    ).rejects.toThrow('generic-worker-failure');

    const rolledBack = await withTenant(appPool, tenantA, async ({ db }) => ({
      audit: await db.select().from(auditRecords),
      receipts: await db.select().from(consumerReceipts),
    }));
    expect(rolledBack).toEqual({ audit: [], receipts: [] });

    const retried = await processOutboxOnce(
      appPool,
      tenantA,
      eventId,
      'worker-a',
      async ({ correlationId: deliveredCorrelationId, db, tenantId }) => {
        await db.insert(auditRecords).values({
          id: '94949494-9494-9494-9494-949494949494',
          tenantId,
          actor: 'worker-a',
          action: 'note.created',
          resource: eventId,
          result: 'processed',
          correlationId: deliveredCorrelationId,
          createdAt: new Date(),
        });
      },
    );
    expect(retried).toBe('processed');
    const committed = await withTenant(appPool, tenantA, async ({ db }) => ({
      audit: await db.select().from(auditRecords),
      receipts: await db.select().from(consumerReceipts),
    }));
    expect(committed.audit).toHaveLength(1);
    expect(committed.audit[0]).toMatchObject({
      correlationId,
      result: 'processed',
      tenantId: tenantA,
    });
    expect(committed.receipts).toHaveLength(1);
  });
});
