import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { applyIamApiVertical } from '../../src/apply-iam-api.js';
import { resolveIamAccess } from '../../src/iam-authorize.js';
import { createAdminPool, createAppPool } from './harness.js';

const tenantA = '11111111-1111-1111-1111-111111111111';
const tenantB = '22222222-2222-2222-2222-222222222222';
const identity = 'a1111111-1111-1111-1111-111111111111';

describe('IAM/API persistence controls', () => {
  let adminPool: Pool;
  let appPool: Pool;

  beforeAll(async () => {
    adminPool = createAdminPool();
    appPool = createAppPool();
    await applyIamApiVertical(adminPool);
  });

  beforeEach(async () => {
    await adminPool.query(
      'TRUNCATE iam_app.outbox_events, iam_app.audit_records, iam_app.memberships, iam_app.centers, iam_app.external_identities, iam_app.identities, iam_app.tenants CASCADE',
    );
  });

  afterAll(async () => {
    await appPool.end();
    await adminPool.end();
  });

  it('forces RLS and keeps global identity tables inaccessible to the app role (MT-REQ-004)', async () => {
    const role = await adminPool.query<{
      rolbypassrls: boolean;
      rolsuper: boolean;
    }>(
      `SELECT rolbypassrls, rolsuper
       FROM pg_roles
       WHERE rolname = 'dive_app'`,
    );
    expect(role.rows[0]).toEqual({ rolbypassrls: false, rolsuper: false });

    const protectedTables = await adminPool.query<{
      owner: string;
      relforcerowsecurity: boolean;
      relname: string;
      relrowsecurity: boolean;
    }>(
      `SELECT relation.relname,
              relation.relrowsecurity,
              relation.relforcerowsecurity,
              owner.rolname AS owner
       FROM pg_class relation
       JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
       JOIN pg_roles owner ON owner.oid = relation.relowner
       WHERE namespace.nspname = 'iam_app'
         AND relation.relkind = 'r'
         AND relation.relrowsecurity
       ORDER BY relation.relname`,
    );
    expect(protectedTables.rows).toEqual(
      [
        'audit_records',
        'centers',
        'memberships',
        'outbox_events',
        'tenants',
      ].map((relname) => ({
        owner: 'dive_migration',
        relforcerowsecurity: true,
        relname,
        relrowsecurity: true,
      })),
    );

    const policies = await adminPool.query<{
      tablename: string;
      with_check: string | null;
      qual: string | null;
    }>(
      `SELECT tablename, qual, with_check
       FROM pg_policies
       WHERE schemaname = 'iam_app'
       ORDER BY tablename`,
    );
    expect(policies.rows).toHaveLength(5);
    for (const policy of policies.rows) {
      expect(policy.qual).toContain("current_setting('app.tenant_id'::text)");
      expect(policy.with_check).toContain(
        "current_setting('app.tenant_id'::text)",
      );
    }

    await expect(
      appPool.query('SELECT * FROM iam_app.identities'),
    ).rejects.toThrow();
    await expect(
      appPool.query('SELECT * FROM iam_app.external_identities'),
    ).rejects.toThrow();
    await expect(
      appPool.query(
        'ALTER TABLE iam_app.memberships DISABLE ROW LEVEL SECURITY',
      ),
    ).rejects.toThrow();

    const bootstrapFunction = await adminPool.query<{
      app_can_execute: boolean;
      owner: string;
      proconfig: string[] | null;
      prosecdef: boolean;
      public_can_execute: boolean;
    }>(
      `SELECT
         owner.rolname AS owner,
         routine.prosecdef,
         routine.proconfig,
         has_function_privilege('dive_app', routine.oid, 'EXECUTE') AS app_can_execute,
         has_function_privilege('public', routine.oid, 'EXECUTE') AS public_can_execute
       FROM pg_proc routine
       JOIN pg_namespace namespace ON namespace.oid = routine.pronamespace
       JOIN pg_roles owner ON owner.oid = routine.proowner
       WHERE namespace.nspname = 'iam_app'
         AND routine.proname = 'resolve_access'`,
    );
    expect(bootstrapFunction.rows).toEqual([
      {
        app_can_execute: true,
        owner: 'dive_migration',
        proconfig: ['search_path=iam_app, pg_temp'],
        prosecdef: true,
        public_can_execute: false,
      },
    ]);

    const privileges = await adminPool.query<{
      can_delete_membership: boolean;
      can_insert_audit: boolean;
      can_insert_membership: boolean;
      can_update_membership_roles: boolean;
      can_update_membership_status: boolean;
    }>(
      `SELECT
         has_table_privilege('dive_app', 'iam_app.memberships', 'DELETE') AS can_delete_membership,
         has_table_privilege('dive_app', 'iam_app.memberships', 'INSERT') AS can_insert_membership,
         has_column_privilege('dive_app', 'iam_app.memberships', 'status', 'UPDATE') AS can_update_membership_status,
         has_column_privilege('dive_app', 'iam_app.memberships', 'roles', 'UPDATE') AS can_update_membership_roles,
         has_table_privilege('dive_app', 'iam_app.audit_records', 'INSERT') AS can_insert_audit`,
    );
    expect(privileges.rows[0]).toEqual({
      can_delete_membership: false,
      can_insert_audit: true,
      can_insert_membership: false,
      can_update_membership_roles: false,
      can_update_membership_status: true,
    });
  });

  it('resolves independent memberships for one global identity and clears pooled context (DIVE-IAM-REQ-001, DIVE-IAM-REQ-002, DIVE-IAM-REQ-005, MT-REQ-005)', async () => {
    await adminPool.query(
      `INSERT INTO iam_app.tenants(id,name) VALUES ($1,'A'),($2,'B')`,
      [tenantA, tenantB],
    );
    await adminPool.query(
      `INSERT INTO iam_app.centers(id,tenant_id,name)
       VALUES
         ('aaaaaaaa-0001-0001-0001-000000000001',$1,'A1'),
         ('bbbbbbbb-0002-0002-0002-000000000001',$2,'B1')`,
      [tenantA, tenantB],
    );
    await adminPool.query('INSERT INTO iam_app.identities(id) VALUES ($1)', [
      identity,
    ]);
    await adminPool.query(
      `INSERT INTO iam_app.external_identities(identity_id,issuer,subject)
       VALUES ($1,'test','shared-person')`,
      [identity],
    );
    await adminPool.query(
      `INSERT INTO iam_app.memberships(id,tenant_id,identity_id,status,roles,center_ids)
       VALUES
         ('aaaaaaaa-1111-1111-1111-111111111111',$1,$3,'active',ARRAY['tenant_owner'],NULL),
         ('bbbbbbbb-2222-2222-2222-222222222222',$2,$3,'active',ARRAY['auditor_compliance'],NULL)`,
      [tenantA, tenantB, identity],
    );

    const singleConnectionPool = createAppPool(1);
    try {
      await expect(
        resolveIamAccess(
          singleConnectionPool,
          { issuer: 'test', subject: 'shared-person' },
          tenantA,
        ),
      ).resolves.toMatchObject({ roles: ['tenant_owner'], tenantId: tenantA });
      await expect(
        resolveIamAccess(
          singleConnectionPool,
          { issuer: 'test', subject: 'shared-person' },
          tenantB,
        ),
      ).resolves.toMatchObject({
        roles: ['auditor_compliance'],
        tenantId: tenantB,
      });

      const client = await singleConnectionPool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT set_config($1, $2, true)', [
          'app.tenant_id',
          tenantA,
        ]);
        const centers = await client.query<{ tenant_id: string }>(
          'SELECT tenant_id FROM iam_app.centers ORDER BY tenant_id',
        );
        expect(centers.rows).toEqual([{ tenant_id: tenantA }]);
        await client.query('ROLLBACK');
      } finally {
        client.release();
      }

      const context = await singleConnectionPool.query<{ tenantId: string }>(
        `SELECT current_setting('app.tenant_id', true) AS "tenantId"`,
      );
      expect(context.rows[0]?.tenantId).toBe('');
    } finally {
      await singleConnectionPool.end();
    }
  });
});
