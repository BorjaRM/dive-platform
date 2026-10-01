import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootstrapRoles } from '../../src/bootstrap-roles.js';
import { migrateProduct } from '../../src/migrate.js';
import { withTenant } from '../../src/unit-of-work.js';
import { createAdminPool, createAppPool, tenantA, tenantB } from './harness.js';

describe('product tenant unit of work', () => {
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

  async function expectClearedContext(expectedPid: number | undefined) {
    const client = await appPool.connect();
    try {
      const result = await client.query<{
        center_key: string | null;
        pid: number;
        tenant_id: string | null;
      }>(
        `SELECT pg_backend_pid() AS pid,
                current_setting('app.tenant_id', true) AS tenant_id,
                current_setting('app.center_entry_key', true) AS center_key`,
      );
      expect(result.rows[0]?.pid).toBe(expectedPid);
      expect(result.rows[0]?.tenant_id ?? '').toBe('');
      expect(result.rows[0]?.center_key ?? '').toBe('');
    } finally {
      client.release();
    }
  }

  it('clears transaction-local tenant context after commit (MT-REQ-005)', async () => {
    const transaction = await withTenant(
      appPool,
      tenantA,
      async ({ client }) => {
        await client.query(
          "SELECT set_config('app.center_entry_key', 'probe', true)",
        );
        const result = await client.query<{
          pid: number;
          tenant_id: string;
        }>(
          `SELECT pg_backend_pid() AS pid,
                  current_setting('app.tenant_id') AS tenant_id`,
        );
        return result.rows[0];
      },
    );
    expect(transaction?.tenant_id).toBe(tenantA);
    await expectClearedContext(transaction?.pid);
  });

  it('clears transaction-local tenant context after application rollback (MT-REQ-005)', async () => {
    let transactionPid: number | undefined;
    await expect(
      withTenant(appPool, tenantA, async ({ client }) => {
        await client.query(
          "SELECT set_config('app.center_entry_key', 'probe', true)",
        );
        transactionPid = await client
          .query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
          .then((result) => result.rows[0]?.pid);
        throw new Error('forced-product-rollback');
      }),
    ).rejects.toThrow('forced-product-rollback');
    await expectClearedContext(transactionPid);
  });

  it('clears transaction-local tenant context after a SQL error (MT-REQ-005)', async () => {
    let transactionPid: number | undefined;
    await expect(
      withTenant(appPool, tenantA, async ({ client }) => {
        await client.query(
          "SELECT set_config('app.center_entry_key', 'probe', true)",
        );
        transactionPid = await client
          .query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
          .then((result) => result.rows[0]?.pid);
        await client.query('SELECT 1 / 0');
      }),
    ).rejects.toThrow();
    await expectClearedContext(transactionPid);
  });

  it('alternates tenant context on the same pooled connection (MT-REQ-005)', async () => {
    const checkouts = [];
    for (const tenantId of [tenantA, tenantB, tenantA]) {
      checkouts.push(
        await withTenant(appPool, tenantId, ({ client }) =>
          client
            .query<{ pid: number; tenant_id: string }>(
              `SELECT pg_backend_pid() AS pid,
                      current_setting('app.tenant_id') AS tenant_id`,
            )
            .then((result) => result.rows[0]),
        ),
      );
    }
    expect(new Set(checkouts.map((checkout) => checkout?.pid))).toHaveLength(1);
    expect(checkouts.map((checkout) => checkout?.tenant_id)).toEqual([
      tenantA,
      tenantB,
      tenantA,
    ]);
  });
});
