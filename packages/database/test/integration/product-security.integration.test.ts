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
  'iam_app.center_entries',
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
  'iam_app.center_entries',
  'iam_app.centers',
  'iam_app.invitations',
  'iam_app.memberships',
  'iam_app.outbox_events',
  'iam_app.tenant_contexts',
  'iam_app.tenants',
] as const;

const onboardingGlobalRelations = [
  'bootstrap_invitation_audit_records',
  'bootstrap_invitation_command_receipts',
  'bootstrap_invitation_rate_limits',
  'bootstrap_redemption_rate_limits',
  'platform_principal_capabilities',
  'platform_principals',
  'tenant_bootstrap_grants',
  'tenant_bootstrap_outbox_events',
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

  it('keeps global onboarding relations out of tenant RLS and inaccessible directly', async () => {
    const relations = await adminPool.query<{
      app_can_select: boolean;
      owner: string;
      platform_admin_can_select: boolean;
      relation: string;
      relforcerowsecurity: boolean;
      relrowsecurity: boolean;
      worker_can_select: boolean;
    }>(
      `SELECT relation.relname AS relation,
              owner.rolname AS owner,
              relation.relrowsecurity,
              relation.relforcerowsecurity,
              has_table_privilege('dive_app', relation.oid, 'SELECT') AS app_can_select,
              has_table_privilege('dive_worker', relation.oid, 'SELECT') AS worker_can_select,
              has_table_privilege('dive_platform_admin', relation.oid, 'SELECT') AS platform_admin_can_select
       FROM pg_class relation
       JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
       JOIN pg_roles owner ON owner.oid = relation.relowner
       WHERE namespace.nspname = 'onboarding_app'
         AND relation.relkind = 'r'
       ORDER BY relation.relname`,
    );
    expect(relations.rows.map(({ relation }) => relation)).toEqual([
      ...onboardingGlobalRelations,
    ]);
    for (const relation of relations.rows) {
      expect(relation).toMatchObject({
        app_can_select: false,
        owner: 'dive_migration',
        platform_admin_can_select: false,
        relforcerowsecurity: false,
        relrowsecurity: false,
        worker_can_select: false,
      });
    }
  });

  it('grants each hardened onboarding function only to its owning runtime role', async () => {
    const functions = await adminPool.query<{
      app_can_execute: boolean;
      owner: string;
      platform_admin_can_execute: boolean;
      proconfig: string[] | null;
      prosecdef: boolean;
      public_can_execute: boolean;
      routine: string;
      worker_can_execute: boolean;
    }>(
      `SELECT routine.proname AS routine,
              owner.rolname AS owner,
              routine.prosecdef,
              routine.proconfig,
              has_function_privilege('public', routine.oid, 'EXECUTE') AS public_can_execute,
              has_function_privilege('dive_app', routine.oid, 'EXECUTE') AS app_can_execute,
              has_function_privilege('dive_worker', routine.oid, 'EXECUTE') AS worker_can_execute,
              has_function_privilege('dive_platform_admin', routine.oid, 'EXECUTE') AS platform_admin_can_execute
       FROM pg_proc routine
       JOIN pg_namespace namespace ON namespace.oid = routine.pronamespace
       JOIN pg_roles owner ON owner.oid = routine.proowner
       WHERE namespace.nspname = 'onboarding_app'
       ORDER BY routine.proname`,
    );
    expect(
      functions.rows.map(
        ({
          app_can_execute,
          platform_admin_can_execute,
          routine,
          worker_can_execute,
        }) => ({
          app_can_execute,
          platform_admin_can_execute,
          routine,
          worker_can_execute,
        }),
      ),
    ).toEqual([
      {
        app_can_execute: false,
        platform_admin_can_execute: false,
        routine: 'claim_bootstrap_outbox_event',
        worker_can_execute: true,
      },
      {
        app_can_execute: false,
        platform_admin_can_execute: false,
        routine: 'complete_bootstrap_outbox_event',
        worker_can_execute: true,
      },
      {
        app_can_execute: true,
        platform_admin_can_execute: false,
        routine: 'complete_own_tenant_bootstrap_command',
        worker_can_execute: false,
      },
      {
        app_can_execute: true,
        platform_admin_can_execute: false,
        routine: 'consume_bootstrap_invitation_rate_limit',
        worker_can_execute: false,
      },
      {
        app_can_execute: false,
        platform_admin_can_execute: false,
        routine: 'fail_bootstrap_outbox_event',
        worker_can_execute: true,
      },
      {
        app_can_execute: true,
        platform_admin_can_execute: false,
        routine: 'issue_bootstrap_invitation_command',
        worker_can_execute: false,
      },
      {
        app_can_execute: true,
        platform_admin_can_execute: false,
        routine: 'read_bootstrap_invitation_command',
        worker_can_execute: false,
      },
      {
        app_can_execute: true,
        platform_admin_can_execute: false,
        routine: 'reissue_bootstrap_invitation_command',
        worker_can_execute: false,
      },
      {
        app_can_execute: true,
        platform_admin_can_execute: false,
        routine: 'revoke_bootstrap_invitation_command',
        worker_can_execute: false,
      },
      {
        app_can_execute: false,
        platform_admin_can_execute: true,
        routine: 'set_platform_capability',
        worker_can_execute: false,
      },
    ]);
    for (const routine of functions.rows) {
      expect(routine.owner, routine.routine).toBe('dive_migration');
      expect(routine.prosecdef, routine.routine).toBe(true);
      expect(routine.public_can_execute, routine.routine).toBe(false);
      expect(routine.proconfig, routine.routine).toEqual([
        routine.routine === 'complete_own_tenant_bootstrap_command'
          ? 'search_path=onboarding_app, iam_app, pg_catalog, pg_temp'
          : 'search_path=onboarding_app, pg_catalog, pg_temp',
      ]);
    }
  });
});
