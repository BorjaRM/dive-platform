import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { notes } from '../../src/schema.js';
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

describe('MT-SPIKE-001 pooling', () => {
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

  it('clears transaction-local tenant context before pool reuse (MT-REQ-005)', async () => {
    await withTenant(appPool, tenantA, async ({ db }) => {
      await db.insert(notes).values({
        id: '66666666-6666-6666-6666-666666666666',
        tenantId: tenantA,
        centerId: centerA1,
        body: 'after-commit',
      });
    });

    const client = await appPool.connect();
    try {
      const leftover = await client.query<{ value: string | null }>(
        "SELECT current_setting('app.tenant_id', true) AS value",
      );
      expect(leftover.rows[0]?.value ?? '').toBe('');
    } finally {
      client.release();
    }

    const visibleToB = await withTenant(appPool, tenantB, async ({ db }) => {
      return db.select().from(notes);
    });
    expect(visibleToB).toEqual([]);
  });
});
