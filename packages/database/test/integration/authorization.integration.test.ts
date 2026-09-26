import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { authorize, withAuthorizedTenant } from '../../src/authorize.js';
import { notes } from '../../src/schema.js';
import {
  centerA1,
  createAdminPool,
  createAppPool,
  identityA,
  identityB,
  identityUnaffiliated,
  setupHarness,
  tenantA,
  tenantB,
  truncateTenantData,
  typicalPermissions,
} from './harness.js';

describe('MT-SPIKE-001 authorization', () => {
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

  it('creates tenant context only after identity-tenant membership is validated (MT-REQ-002)', async () => {
    const context = await authorize(appPool, identityA, tenantA);
    expect(context).toEqual({
      identityId: identityA,
      permissions: typicalPermissions,
      tenantId: tenantA,
    });

    const noteId = 'e1e1e1e1-e1e1-e1e1-e1e1-e1e1e1e1e1e1';
    const rows = await withAuthorizedTenant(
      appPool,
      context,
      async ({ db }) => {
        await db.insert(notes).values({
          id: noteId,
          tenantId: tenantA,
          centerId: centerA1,
          body: 'authorized',
        });
        return db.select().from(notes);
      },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tenantId).toBe(tenantA);
  });

  it('rejects identities without membership in the requested tenant (MT-REQ-002)', async () => {
    await expect(authorize(appPool, identityA, tenantB)).rejects.toThrow(
      'Access denied',
    );
    await expect(
      authorize(appPool, identityUnaffiliated, tenantA),
    ).rejects.toThrow('Access denied');
    await expect(
      withAuthorizedTenant(
        appPool,
        {
          identityId: identityB,
          permissions: typicalPermissions,
          tenantId: tenantA,
        },
        async ({ db }) => db.select().from(notes),
      ),
    ).rejects.toThrow('Access denied');
  });

  it('does not treat a client-supplied tenant id as authorization (MT-REQ-002)', async () => {
    await expect(authorize(appPool, identityA, tenantB)).rejects.toThrow(
      'Access denied',
    );
  });
});
