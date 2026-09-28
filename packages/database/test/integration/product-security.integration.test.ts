import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootstrapRoles } from '../../src/bootstrap-roles.js';
import { migrateProduct } from '../../src/migrate.js';
import { createAdminPool } from './harness.js';

const tenantColumnRelations = [
  'booking_app.activities',
  'booking_app.bookings',
  'booking_app.capability_verifiers',
  'booking_app.channels',
  'booking_app.slots',
  'iam_app.audit_records',
  'iam_app.centers',
  'iam_app.identity_tenants',
  'iam_app.invitations',
  'iam_app.memberships',
  'iam_app.outbox_events',
  'iam_app.tenant_contexts',
] as const;

const tenantProtectedRelations = [
  'booking_app.activities',
  'booking_app.bookings',
  'booking_app.capability_verifiers',
  'booking_app.channels',
  'booking_app.slots',
  'iam_app.audit_records',
  'iam_app.centers',
  'iam_app.invitations',
  'iam_app.memberships',
  'iam_app.outbox_events',
  'iam_app.tenant_contexts',
  'iam_app.tenants',
] as const;

describe('product database security contract', () => {
  let adminPool: Pool;

  beforeAll(async () => {
    adminPool = createAdminPool();
    await bootstrapRoles(adminPool);
    await migrateProduct();
  });

  afterAll(async () => {
    await adminPool.end();
  });

  it('keeps every product tenant_id column non-null (MT-REQ-001)', async () => {
    const columns = await adminPool.query<{
      is_nullable: 'NO' | 'YES';
      relation: string;
    }>(
      `SELECT format('%I.%I', table_schema, table_name) AS relation,
              is_nullable
       FROM information_schema.columns
       WHERE table_schema IN ('booking_app', 'iam_app')
         AND column_name = 'tenant_id'
       ORDER BY relation`,
    );

    expect(columns.rows).toEqual(
      tenantColumnRelations.map((relation) => ({
        is_nullable: 'NO',
        relation,
      })),
    );
  });

  it('forces RLS with tenant-scoped policies on every protected product relation (MT-REQ-004)', async () => {
    const relations = await adminPool.query<{
      owner: string;
      relation: string;
      relforcerowsecurity: boolean;
      relrowsecurity: boolean;
    }>(
      `SELECT format('%I.%I', namespace.nspname, relation.relname) AS relation,
              relation.relrowsecurity,
              relation.relforcerowsecurity,
              owner.rolname AS owner
       FROM pg_class relation
       JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
       JOIN pg_roles owner ON owner.oid = relation.relowner
       WHERE namespace.nspname IN ('booking_app', 'iam_app')
         AND relation.relkind = 'r'
         AND relation.relrowsecurity
       ORDER BY relation`,
    );
    expect(relations.rows).toEqual(
      tenantProtectedRelations.map((relation) => ({
        owner: 'dive_migration',
        relation,
        relforcerowsecurity: true,
        relrowsecurity: true,
      })),
    );

    const policies = await adminPool.query<{
      cmd: string;
      qual: string | null;
      relation: string;
      with_check: string | null;
    }>(
      `SELECT format('%I.%I', schemaname, tablename) AS relation,
              cmd,
              qual,
              with_check
       FROM pg_policies
       WHERE schemaname IN ('booking_app', 'iam_app')
       ORDER BY relation, policyname`,
    );
    expect(policies.rows.map(({ relation }) => relation)).toEqual([
      ...tenantProtectedRelations,
    ]);
    for (const policy of policies.rows) {
      expect(policy.cmd, policy.relation).toBe('ALL');
      expect(policy.qual, policy.relation).toContain(
        "current_setting('app.tenant_id'::text",
      );
      expect(policy.with_check, policy.relation).toContain(
        "current_setting('app.tenant_id'::text",
      );
    }
  });

  it('hardens every product function executable by the runtime role', async () => {
    const functions = await adminPool.query<{
      owner: string;
      proconfig: string[] | null;
      prosecdef: boolean;
      public_can_execute: boolean;
      routine: string;
    }>(
      `SELECT format('%I.%I', namespace.nspname, routine.proname) AS routine,
              owner.rolname AS owner,
              routine.prosecdef,
              routine.proconfig,
              has_function_privilege('public', routine.oid, 'EXECUTE') AS public_can_execute
       FROM pg_proc routine
       JOIN pg_namespace namespace ON namespace.oid = routine.pronamespace
       JOIN pg_roles owner ON owner.oid = routine.proowner
       WHERE namespace.nspname IN ('booking_app', 'iam_app')
         AND has_function_privilege('dive_app', routine.oid, 'EXECUTE')
       ORDER BY routine`,
    );
    expect(functions.rows.length).toBeGreaterThan(0);
    for (const routine of functions.rows) {
      expect(routine.owner, routine.routine).toBe('dive_migration');
      expect(routine.prosecdef, routine.routine).toBe(true);
      expect(routine.public_can_execute, routine.routine).toBe(false);
      expect(routine.proconfig, routine.routine).toHaveLength(1);
      expect(routine.proconfig?.[0], routine.routine).toMatch(
        /^search_path=.*pg_temp$/,
      );
    }
  });
});
