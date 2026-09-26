import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { notes } from '../../src/harness-schema.js';
import { withTenant } from '../../src/harness-unit-of-work.js';
import {
  centerA1,
  createAdminPool,
  createAppPool,
  setupHarness,
  tenantA,
  tenantB,
  truncateTenantData,
} from './harness.js';

describe('MT-SPIKE-001 pooling', () => {
  let adminPool: Pool;
  let appPool: Pool;

  beforeAll(async () => {
    adminPool = createAdminPool();
    appPool = createAppPool(1);
    await setupHarness(adminPool);
  });

  beforeEach(async () => {
    await truncateTenantData(adminPool);
  });

  afterAll(async () => {
    await appPool.end();
    await adminPool.end();
  });

  it('clears transaction-local tenant context before pool reuse (MT-REQ-005)', async () => {
    const tenantBackendPid = await withTenant(
      appPool,
      tenantA,
      async ({ client, db }) => {
        await db.insert(notes).values({
          id: '66666666-6666-6666-6666-666666666666',
          tenantId: tenantA,
          centerId: centerA1,
          body: 'after-commit',
        });
        return client
          .query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
          .then((result) => result.rows[0]?.pid);
      },
    );

    const client = await appPool.connect();
    try {
      const leftover = await client.query<{
        pid: number;
        value: string | null;
      }>(
        `SELECT current_setting('app.tenant_id', true) AS value,
                pg_backend_pid() AS pid`,
      );
      expect(leftover.rows[0]?.pid).toBe(tenantBackendPid);
      expect(leftover.rows[0]?.value ?? '').toBe('');
    } finally {
      client.release();
    }

    const visibleToB = await withTenant(appPool, tenantB, async ({ db }) => {
      return db.select().from(notes);
    });
    expect(visibleToB).toEqual([]);
  });

  it('clears tenant context and writes after rollback on the same connection (MT-REQ-005)', async () => {
    let transactionBackendPid: number | undefined;

    await expect(
      withTenant(appPool, tenantA, async ({ client, db }) => {
        transactionBackendPid = await client
          .query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
          .then((result) => result.rows[0]?.pid);
        await db.insert(notes).values({
          id: '67676767-6767-6767-6767-676767676767',
          tenantId: tenantA,
          centerId: centerA1,
          body: 'must-roll-back',
        });
        throw new Error('forced-rollback');
      }),
    ).rejects.toThrow('forced-rollback');

    const client = await appPool.connect();
    try {
      const afterRollback = await client.query<{
        pid: number;
        value: string | null;
      }>(
        `SELECT current_setting('app.tenant_id', true) AS value,
                pg_backend_pid() AS pid`,
      );
      expect(afterRollback.rows[0]?.pid).toBe(transactionBackendPid);
      expect(afterRollback.rows[0]?.value ?? '').toBe('');
    } finally {
      client.release();
    }

    const rows = await withTenant(appPool, tenantA, async ({ db }) => {
      return db.select().from(notes);
    });
    expect(rows).toEqual([]);
  });

  it('alternates tenants repeatedly on the same physical connection (MT-REQ-005)', async () => {
    const checkouts: Array<{ pid: number | undefined; tenantId: string }> = [];

    for (const tenantId of [tenantA, tenantB, tenantA]) {
      const checkout = await withTenant(
        appPool,
        tenantId,
        async ({ client }) => {
          return client
            .query<{ context: string; pid: number }>(
              `SELECT current_setting('app.tenant_id') AS context,
                      pg_backend_pid() AS pid`,
            )
            .then((result) => result.rows[0]);
        },
      );
      expect(checkout?.context).toBe(tenantId);
      checkouts.push({ pid: checkout?.pid, tenantId });
    }

    expect(new Set(checkouts.map(({ pid }) => pid))).toHaveLength(1);
    expect(checkouts.map(({ tenantId }) => tenantId)).toEqual([
      tenantA,
      tenantB,
      tenantA,
    ]);
  });

  it('clears context after a SQL error aborts the transaction (MT-REQ-005)', async () => {
    let transactionBackendPid: number | undefined;

    await expect(
      withTenant(appPool, tenantA, async ({ client }) => {
        transactionBackendPid = await client
          .query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
          .then((result) => result.rows[0]?.pid);
        await client.query('SELECT 1 / 0');
      }),
    ).rejects.toThrow();

    const client = await appPool.connect();
    try {
      const afterError = await client.query<{
        pid: number;
        value: string | null;
      }>(
        `SELECT current_setting('app.tenant_id', true) AS value,
                pg_backend_pid() AS pid`,
      );
      expect(afterError.rows[0]?.pid).toBe(transactionBackendPid);
      expect(afterError.rows[0]?.value ?? '').toBe('');
    } finally {
      client.release();
    }
  });
});
