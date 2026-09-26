import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAdminPool, createAppPool, setupHarness } from './harness.js';

describe('MT-SPIKE-001 runtime role', () => {
  let adminPool: Pool;
  let appPool: Pool;

  beforeAll(async () => {
    adminPool = createAdminPool();
    appPool = createAppPool();
    await setupHarness(adminPool);
  });

  afterAll(async () => {
    await appPool.end();
    await adminPool.end();
  });

  it('has forced RLS, no BYPASSRLS, and no DDL (MT-REQ-004)', async () => {
    const role = await adminPool.query<{
      rolbypassrls: boolean;
      rolsuper: boolean;
    }>(
      `SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname = 'dive_app'`,
    );
    expect(role.rows[0]?.rolbypassrls).toBe(false);
    expect(role.rows[0]?.rolsuper).toBe(false);

    const client = await appPool.connect();
    try {
      await expect(
        client.query('CREATE TABLE mt_spike.should_not_exist (id int)'),
      ).rejects.toThrow();
    } finally {
      client.release();
    }
  });
});
