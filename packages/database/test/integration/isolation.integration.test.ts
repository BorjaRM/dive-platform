import { eq } from 'drizzle-orm';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { notes } from '../../src/schema.js';
import { withTenant } from '../../src/unit-of-work.js';
import {
  centerA1,
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
  });

  it('hides other-tenant rows and does not disclose them (MT-REQ-009)', async () => {
    await withTenant(appPool, tenantA, async ({ db }) => {
      await db.insert(notes).values({
        id: '55555555-5555-5555-5555-555555555555',
        tenantId: tenantA,
        centerId: centerA1,
        body: 'secret-a',
      });
    });

    const visibleToB = await withTenant(appPool, tenantB, async ({ db }) => {
      return db.select().from(notes);
    });
    expect(visibleToB).toEqual([]);
  });

  it('fails closed without tenant context (MT-REQ-006)', async () => {
    const client = await appPool.connect();
    try {
      await expect(
        client.query('SELECT * FROM mt_spike.notes'),
      ).rejects.toThrow();
    } finally {
      client.release();
    }
  });
});
