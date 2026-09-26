import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { authorize, withAuthorizedTenant } from '../../src/authorize.js';
import { notes } from '../../src/harness-schema.js';
import * as databasePackage from '../../src/index.js';
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
    expect(databasePackage).not.toHaveProperty('withTenant');
  });

  it('allows membership lookup only through the RLS bootstrap function (MT-REQ-002, MT-REQ-004)', async () => {
    await expect(
      appPool.query('SELECT * FROM mt_spike.identities'),
    ).rejects.toThrow();

    const client = await appPool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [
        tenantA,
      ]);
      await expect(
        client.query('SELECT * FROM mt_spike.memberships'),
      ).rejects.toThrow();
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }

    await expect(authorize(appPool, identityA, tenantA)).resolves.toMatchObject(
      {
        identityId: identityA,
        tenantId: tenantA,
      },
    );
  });

  it('clears bootstrap tenant context before pooled connection reuse (MT-REQ-005)', async () => {
    const singleConnectionPool = createAppPool(1);
    try {
      await expect(
        authorize(singleConnectionPool, identityA, tenantA),
      ).resolves.toMatchObject({ tenantId: tenantA });

      const checkout = await singleConnectionPool.query<{ tenant_id: string }>(
        "SELECT current_setting('app.tenant_id', true) AS tenant_id",
      );
      expect(checkout.rows[0]?.tenant_id).toBe('');
    } finally {
      await singleConnectionPool.end();
    }
  });
});
