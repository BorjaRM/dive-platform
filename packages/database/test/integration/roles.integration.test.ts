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

    const protectedTables = await adminPool.query<{
      relforcerowsecurity: boolean;
      relname: string;
      relrowsecurity: boolean;
    }>(
      `SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'mt_spike'
         AND c.relkind = 'r'
         AND c.relforcerowsecurity
       ORDER BY c.relname`,
    );
    expect(protectedTables.rows).toEqual([
      {
        relforcerowsecurity: true,
        relname: 'audit_records',
        relrowsecurity: true,
      },
      {
        relforcerowsecurity: true,
        relname: 'centers',
        relrowsecurity: true,
      },
      {
        relforcerowsecurity: true,
        relname: 'consumer_receipts',
        relrowsecurity: true,
      },
      {
        relforcerowsecurity: true,
        relname: 'memberships',
        relrowsecurity: true,
      },
      {
        relforcerowsecurity: true,
        relname: 'notes',
        relrowsecurity: true,
      },
      {
        relforcerowsecurity: true,
        relname: 'outbox_events',
        relrowsecurity: true,
      },
      {
        relforcerowsecurity: true,
        relname: 'tenants',
        relrowsecurity: true,
      },
    ]);

    const policies = await adminPool.query<{
      cmd: string;
      policyname: string;
      qual: string | null;
      schemaname: string;
      tablename: string;
      with_check: string | null;
    }>(
      `SELECT schemaname, tablename, policyname, cmd, qual, with_check
       FROM pg_policies
       WHERE schemaname = 'mt_spike'
       ORDER BY tablename, policyname`,
    );
    expect(policies.rows.map((policy) => policy.tablename)).toEqual([
      'audit_records',
      'centers',
      'consumer_receipts',
      'memberships',
      'notes',
      'outbox_events',
      'tenants',
    ]);
    for (const policy of policies.rows) {
      expect(policy.cmd).toBe('ALL');
      expect(policy.qual).toContain("current_setting('app.tenant_id'::text)");
      expect(policy.with_check).toContain(
        "current_setting('app.tenant_id'::text)",
      );
    }

    const ownership = await adminPool.query<{
      owner: string;
      tablename: string;
    }>(
      `SELECT c.relname AS tablename, owner.rolname AS owner
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       JOIN pg_roles owner ON owner.oid = c.relowner
       WHERE n.nspname = 'mt_spike' AND c.relkind = 'r'
       ORDER BY c.relname`,
    );
    expect(ownership.rows.length).toBeGreaterThanOrEqual(6);
    for (const table of ownership.rows) {
      expect(table.owner).toBe('dive_migration');
      expect(table.owner).not.toBe('dive_app');
    }

    const identity = await adminPool.query<{
      relforcerowsecurity: boolean;
      relrowsecurity: boolean;
    }>(
      `SELECT c.relrowsecurity, c.relforcerowsecurity
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'mt_spike' AND c.relname = 'identities'`,
    );
    expect(identity.rows[0]).toEqual({
      relforcerowsecurity: false,
      relrowsecurity: false,
    });

    const bootstrapFunction = await adminPool.query<{
      app_can_execute: boolean;
      definition: string;
      owner: string;
      proconfig: string[] | null;
      prosecdef: boolean;
      public_can_execute: boolean;
    }>(
      `SELECT
         owner.rolname AS owner,
         routine.prosecdef,
         routine.proconfig,
         pg_get_functiondef(routine.oid) AS definition,
         has_function_privilege('dive_app', routine.oid, 'EXECUTE') AS app_can_execute,
         has_function_privilege('public', routine.oid, 'EXECUTE') AS public_can_execute
       FROM pg_proc routine
       JOIN pg_namespace namespace ON namespace.oid = routine.pronamespace
       JOIN pg_roles owner ON owner.oid = routine.proowner
       WHERE namespace.nspname = 'mt_spike'
         AND routine.proname = 'membership_permissions'`,
    );
    expect(bootstrapFunction.rows).toHaveLength(1);
    expect(bootstrapFunction.rows[0]).toMatchObject({
      app_can_execute: true,
      owner: 'dive_migration',
      proconfig: ['search_path=mt_spike, pg_temp'],
      prosecdef: true,
      public_can_execute: false,
    });
    expect(bootstrapFunction.rows[0]?.definition).toContain(
      "set_config('app.tenant_id', p_tenant::text, true)",
    );

    const client = await appPool.connect();
    try {
      await expect(
        client.query('CREATE TABLE mt_spike.should_not_exist (id int)'),
      ).rejects.toThrow();
      await expect(
        client.query('ALTER TABLE mt_spike.notes DISABLE ROW LEVEL SECURITY'),
      ).rejects.toThrow();
      await expect(
        client.query('DROP POLICY notes_isolation ON mt_spike.notes'),
      ).rejects.toThrow();
      await expect(
        client.query('ALTER ROLE dive_app BYPASSRLS'),
      ).rejects.toThrow();
    } finally {
      client.release();
    }
  });
});
