import { Pool, type PoolClient } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { bootstrapRoles } from '../../src/bootstrap-roles.js';
import { migrationDatabaseUrl } from '../../src/env.js';
import { resolveIamAccess } from '../../src/iam-authorize.js';
import { setIamCenterEntryStatus } from '../../src/iam-center-entry-commands.js';
import { disableIamMembership } from '../../src/iam-membership-commands.js';
import {
  cleanupRevokedIamTenantContexts,
  resolveIamCenterEntry,
} from '../../src/iam-tenant-context-commands.js';
import { migrateProduct } from '../../src/migrate.js';
import { createAdminPool, createAppPool } from './harness.js';

const tenantA = '11111111-1111-1111-1111-111111111111';
const tenantB = '22222222-2222-2222-2222-222222222222';
const identity = 'a1111111-1111-1111-1111-111111111111';

async function withAdminTenant<T>(
  pool: Pool,
  tenantId: string,
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT set_config($1, $2, true)', [
      'app.tenant_id',
      tenantId,
    ]);
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

describe('IAM/API persistence controls', () => {
  let adminPool: Pool;
  let appPool: Pool;
  let migrationPool: Pool;

  beforeAll(async () => {
    adminPool = createAdminPool();
    appPool = createAppPool();
    await bootstrapRoles(adminPool);
    migrationPool = new Pool({
      connectionString: migrationDatabaseUrl(),
      max: 2,
    });
    await migrateProduct();
  });

  beforeEach(async () => {
    await adminPool.query(
      'TRUNCATE iam_app.outbox_events, iam_app.audit_records, iam_app.memberships, iam_app.centers, iam_app.external_identities, iam_app.identities, iam_app.tenants CASCADE',
    );
  });

  afterAll(async () => {
    await migrationPool.end();
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
        'center_entries',
        'centers',
        'invitations',
        'memberships',
        'outbox_events',
        'tenant_contexts',
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
        AND ('public' = ANY(roles) OR 'dive_app' = ANY(roles))
       ORDER BY tablename`,
    );
    expect(policies.rows).toHaveLength(8);
    for (const policy of policies.rows) {
      expect(policy.qual).toContain("current_setting('app.tenant_id'::text");
      expect(policy.with_check).toContain(
        "current_setting('app.tenant_id'::text",
      );
    }

    await expect(
      appPool.query('SELECT * FROM iam_app.identities'),
    ).rejects.toThrow();
    await expect(
      appPool.query('SELECT * FROM iam_app.external_identities'),
    ).rejects.toThrow();
    await expect(
      appPool.query('SELECT * FROM iam_app.identity_tenants'),
    ).rejects.toThrow();
    await expect(
      appPool.query('SELECT * FROM iam_app.identity_preferences'),
    ).rejects.toThrow();
    await expect(
      appPool.query(
        'ALTER TABLE iam_app.memberships DISABLE ROW LEVEL SECURITY',
      ),
    ).rejects.toThrow();

    const commandFunctions = await adminPool.query<{
      app_can_execute: boolean;
      owner: string;
      proname: string;
      proconfig: string[] | null;
      prosecdef: boolean;
      public_can_execute: boolean;
    }>(
      `SELECT
        routine.proname,
         owner.rolname AS owner,
         routine.prosecdef,
         routine.proconfig,
         has_function_privilege('dive_app', routine.oid, 'EXECUTE') AS app_can_execute,
         has_function_privilege('public', routine.oid, 'EXECUTE') AS public_can_execute
       FROM pg_proc routine
       JOIN pg_namespace namespace ON namespace.oid = routine.pronamespace
       JOIN pg_roles owner ON owner.oid = routine.proowner
       WHERE namespace.nspname = 'iam_app'
         AND routine.proname IN (
           'apply_identity_webhook_command',
           'cleanup_revoked_tenant_contexts_command',
           'disable_membership_command',
           'issue_invitation_command',
           'issue_tenant_context_command',
           'list_operators_command',
           'resolve_access',
           'resolve_center_entry_command',
           'resolve_tenant_context_command',
           'respond_invitation_command',
           'revoke_invitation_command',
           'revoke_tenant_context_command',
           'set_center_entry_status_command'
         )
       ORDER BY routine.proname`,
    );
    expect(commandFunctions.rows).toEqual(
      [
        'apply_identity_webhook_command',
        'cleanup_revoked_tenant_contexts_command',
        'disable_membership_command',
        'issue_invitation_command',
        'issue_tenant_context_command',
        'list_operators_command',
        'resolve_access',
        'resolve_center_entry_command',
        'resolve_tenant_context_command',
        'respond_invitation_command',
        'revoke_invitation_command',
        'revoke_tenant_context_command',
        'set_center_entry_status_command',
      ].map((proname) => ({
        app_can_execute: true,
        owner: 'dive_migration',
        proname,
        proconfig: [
          proname === 'resolve_center_entry_command' ||
          proname === 'set_center_entry_status_command'
            ? 'search_path=iam_app, pg_catalog, pg_temp'
            : 'search_path=iam_app, pg_temp',
        ],
        prosecdef: true,
        public_can_execute: false,
      })),
    );

    const privileges = await adminPool.query<{
      can_delete_membership: boolean;
      can_delete_identity_tenants: boolean;
      can_insert_audit: boolean;
      can_insert_identity_tenants: boolean;
      can_insert_invitation: boolean;
      can_insert_membership: boolean;
      can_insert_outbox: boolean;
      can_select_identity_tenants: boolean;
      can_update_center_entry_status: boolean;
      can_update_identity_tenants: boolean;
      can_update_invitation: boolean;
      can_update_membership_roles: boolean;
      can_update_membership_status: boolean;
    }>(
      `SELECT
         has_table_privilege('dive_app', 'iam_app.memberships', 'DELETE') AS can_delete_membership,
         has_table_privilege('dive_app', 'iam_app.memberships', 'INSERT') AS can_insert_membership,
         has_column_privilege('dive_app', 'iam_app.memberships', 'status', 'UPDATE') AS can_update_membership_status,
         has_column_privilege('dive_app', 'iam_app.memberships', 'roles', 'UPDATE') AS can_update_membership_roles,
         has_table_privilege('dive_app', 'iam_app.invitations', 'INSERT') AS can_insert_invitation,
         has_table_privilege('dive_app', 'iam_app.invitations', 'UPDATE') AS can_update_invitation,
         has_table_privilege('dive_app', 'iam_app.audit_records', 'INSERT') AS can_insert_audit,
        has_table_privilege('dive_app', 'iam_app.outbox_events', 'INSERT') AS can_insert_outbox,
        has_table_privilege('dive_app', 'iam_app.identity_tenants', 'SELECT') AS can_select_identity_tenants,
        has_table_privilege('dive_app', 'iam_app.identity_tenants', 'INSERT') AS can_insert_identity_tenants,
        has_table_privilege('dive_app', 'iam_app.identity_tenants', 'UPDATE') AS can_update_identity_tenants,
        has_table_privilege('dive_app', 'iam_app.identity_tenants', 'DELETE') AS can_delete_identity_tenants,
        has_column_privilege('dive_app', 'iam_app.center_entries', 'status', 'UPDATE') AS can_update_center_entry_status`,
    );
    expect(privileges.rows[0]).toEqual({
      can_delete_membership: false,
      can_delete_identity_tenants: false,
      can_insert_audit: false,
      can_insert_identity_tenants: false,
      can_insert_invitation: false,
      can_insert_membership: false,
      can_insert_outbox: false,
      can_select_identity_tenants: false,
      can_update_center_entry_status: false,
      can_update_identity_tenants: false,
      can_update_invitation: false,
      can_update_membership_roles: false,
      can_update_membership_status: false,
    });
    await expect(
      appPool.query(`UPDATE iam_app.center_entries SET status = 'disabled'`),
    ).rejects.toThrow('permission denied for table center_entries');
  });

  it('rejects invalid direct center-entry lifecycle arguments before setting tenant context (MT-REQ-004)', async () => {
    const validArguments: unknown[] = [
      'test',
      'identity-a',
      tenantA,
      'aaaaaaaa-0001-0001-0001-000000000001',
      'disabled',
      'temporary center closure',
      '11111111-1111-4111-8111-111111111111',
    ];
    const argumentTypes = [
      'text',
      'text',
      'uuid',
      'uuid',
      'text',
      'text',
      'uuid',
    ];

    for (const invalidIndex of validArguments.keys()) {
      const invalidArguments = [...validArguments];
      invalidArguments[invalidIndex] = null;
      const result = await appPool.query<{ outcome: unknown }>(
        `SELECT iam_app.set_center_entry_status_command(
          ${argumentTypes.map((type, index) => `$${index + 1}::${type}`).join(', ')}
        ) AS outcome`,
        invalidArguments,
      );
      expect(result.rows[0]?.outcome).toEqual({
        deniedReason: 'invariant_violation',
      });
    }

    for (const [status, purpose] of [
      ['unknown', 'temporary center closure'],
      ['disabled', '   '],
    ]) {
      const result = await appPool.query<{ outcome: unknown }>(
        `SELECT iam_app.set_center_entry_status_command(
          $1, $2, $3::uuid, $4::uuid, $5, $6, $7::uuid
        ) AS outcome`,
        [
          validArguments[0],
          validArguments[1],
          validArguments[2],
          validArguments[3],
          status,
          purpose,
          validArguments[6],
        ],
      );
      expect(result.rows[0]?.outcome).toEqual({
        deniedReason: 'invariant_violation',
      });
    }

    const context = await appPool.query<{ tenantId: string | null }>(
      `SELECT current_setting('app.tenant_id', true) AS "tenantId"`,
    );
    expect(context.rows[0]).toEqual({ tenantId: null });
  });

  it('resolves exact center-entry mappings and clears pooled selector context (DIVE-IAM-REQ-032, MT-REQ-004..005, MT-REQ-010)', async () => {
    const centerA = 'aaaaaaaa-0001-0001-0001-000000000001';
    const disabledCenterA = 'aaaaaaaa-0001-0001-0001-000000000002';
    const centerB = 'bbbbbbbb-0002-0002-0002-000000000001';
    await adminPool.query(
      `INSERT INTO iam_app.tenants(id,name) VALUES ($1,'A'),($2,'B')`,
      [tenantA, tenantB],
    );
    await adminPool.query(
      `INSERT INTO iam_app.centers(id,tenant_id,name)
       VALUES ($1,$2,'A1'),($3,$4,'B1'),($5,$2,'A2')`,
      [centerA, tenantA, centerB, tenantB, disabledCenterA],
    );
    await withAdminTenant(migrationPool, tenantA, (client) =>
      client.query(
        `INSERT INTO iam_app.center_entries(center_key,tenant_id,center_id,status)
         VALUES ('alpha', $1, $2, 'active'),('delta', $1, $3, 'disabled')`,
        [tenantA, centerA, disabledCenterA],
      ),
    );
    await withAdminTenant(migrationPool, tenantB, (client) =>
      client.query(
        `INSERT INTO iam_app.center_entries(center_key,tenant_id,center_id)
         VALUES ('bravo', $1, $2)`,
        [tenantB, centerB],
      ),
    );

    const singleConnectionPool = createAppPool(1);
    try {
      await expect(
        resolveIamCenterEntry(singleConnectionPool, 'alpha'),
      ).resolves.toEqual({ tenantId: tenantA, centerId: centerA });
      await expect(
        resolveIamCenterEntry(singleConnectionPool, 'bravo'),
      ).resolves.toEqual({ tenantId: tenantB, centerId: centerB });
      await expect(
        resolveIamCenterEntry(singleConnectionPool, 'delta'),
      ).resolves.toBeNull();
      await expect(
        resolveIamCenterEntry(singleConnectionPool, 'unknown'),
      ).resolves.toBeNull();
      await expect(
        resolveIamCenterEntry(singleConnectionPool, 'www'),
      ).resolves.toBeNull();
      await expect(
        resolveIamCenterEntry(singleConnectionPool, ' Alpha '),
      ).resolves.toBeNull();
      await expect(
        singleConnectionPool.query('SELECT * FROM iam_app.center_entries'),
      ).resolves.toMatchObject({ rows: [] });

      const backendPids = new Set<number>();
      for (const selectedTenant of [tenantA, tenantB, tenantA]) {
        const rows = await withAdminTenant(
          singleConnectionPool,
          selectedTenant,
          async (client) => {
            const backend = await client.query<{ pid: number }>(
              'SELECT pg_backend_pid() AS pid',
            );
            const backendPid = backend.rows[0]?.pid;
            if (backendPid === undefined) {
              throw new Error('Missing PostgreSQL backend PID');
            }
            backendPids.add(backendPid);
            await client.query('SELECT set_config($1, $2, true)', [
              'app.center_entry_key',
              selectedTenant === tenantA ? 'bravo' : 'alpha',
            ]);
            return client.query(
              'SELECT center_key, status FROM iam_app.center_entries ORDER BY center_key',
            );
          },
        );
        expect(rows.rows).toEqual(
          selectedTenant === tenantA
            ? [
                { center_key: 'alpha', status: 'active' },
                { center_key: 'delta', status: 'disabled' },
              ]
            : [{ center_key: 'bravo', status: 'active' }],
        );
      }
      expect(backendPids.size).toBe(1);

      const forgedKey = await withAdminTenant(
        singleConnectionPool,
        '',
        async (client) => {
          await client.query('SELECT set_config($1, $2, true)', [
            'app.center_entry_key',
            'bravo',
          ]);
          return client.query('SELECT * FROM iam_app.center_entries');
        },
      );
      expect(forgedKey.rows).toEqual([]);

      await expect(
        withAdminTenant(singleConnectionPool, 'invalid-tenant', (client) =>
          client.query('SELECT * FROM iam_app.center_entries'),
        ),
      ).rejects.toThrow();

      const context = await singleConnectionPool.query<{
        centerKey: string | null;
        tenantId: string | null;
      }>(
        `SELECT current_setting('app.center_entry_key', true) AS "centerKey",
                current_setting('app.tenant_id', true) AS "tenantId"`,
      );
      expect(context.rows[0]?.centerKey ?? '').toBe('');
      expect(context.rows[0]?.tenantId ?? '').toBe('');
      await expect(
        singleConnectionPool.query('SELECT * FROM iam_app.center_entries'),
      ).resolves.toMatchObject({ rows: [] });
    } finally {
      await singleConnectionPool.end();
    }
  });

  it('keeps center-entry lifecycle changes tenant-scoped, audited, and reversible (DIVE-IAM-REQ-003, DIVE-IAM-REQ-023, DIVE-IAM-REQ-025, MT-REQ-004..005, MT-REQ-010)', async () => {
    const centerA = 'aaaaaaaa-0001-0001-0001-000000000001';
    const centerB = 'bbbbbbbb-0002-0002-0002-000000000001';
    const managerIdentity = 'c3333333-3333-3333-3333-333333333333';
    const ownerMembership = 'aaaaaaaa-1111-1111-1111-111111111111';
    const managerMembership = 'bbbbbbbb-2222-2222-2222-222222222222';
    await adminPool.query(
      `INSERT INTO iam_app.tenants(id,name) VALUES ($1,'A'),($2,'B')`,
      [tenantA, tenantB],
    );
    await adminPool.query(
      `INSERT INTO iam_app.identities(id) VALUES ($1),($2)`,
      [identity, managerIdentity],
    );
    await adminPool.query(
      `INSERT INTO iam_app.external_identities(identity_id,issuer,subject)
       VALUES ($1,'test','identity-a'),($2,'test','identity-manager')`,
      [identity, managerIdentity],
    );
    await adminPool.query(
      `INSERT INTO iam_app.centers(id,tenant_id,name)
       VALUES ($1,$3,'A1'),($2,$4,'B1')`,
      [centerA, centerB, tenantA, tenantB],
    );
    await adminPool.query(
      `INSERT INTO iam_app.memberships(id,tenant_id,identity_id,status,roles,center_ids)
       VALUES
         ($1,$3,$4,'active',ARRAY['tenant_owner'],NULL),
         ($2,$3,$5,'active',ARRAY['center_manager'],$6::uuid[])`,
      [
        ownerMembership,
        managerMembership,
        tenantA,
        identity,
        managerIdentity,
        [centerA],
      ],
    );
    await withAdminTenant(migrationPool, tenantA, (client) =>
      client.query(
        `INSERT INTO iam_app.center_entries(center_key,tenant_id,center_id)
         VALUES ('alpha',$1,$2)`,
        [tenantA, centerA],
      ),
    );
    await withAdminTenant(migrationPool, tenantB, (client) =>
      client.query(
        `INSERT INTO iam_app.center_entries(center_key,tenant_id,center_id)
         VALUES ('bravo',$1,$2)`,
        [tenantB, centerB],
      ),
    );

    await expect(
      setIamCenterEntryStatus(
        appPool,
        { issuer: 'test', subject: 'identity-a', tenantId: tenantA },
        {
          centerId: centerA,
          status: 'disabled',
          purpose: 'center temporarily closed',
          correlationId: '11111111-1111-4111-8111-111111111111',
        },
      ),
    ).resolves.toEqual({ changed: true, status: 'disabled' });
    await expect(
      setIamCenterEntryStatus(
        appPool,
        { issuer: 'test', subject: 'identity-a', tenantId: tenantA },
        {
          centerId: centerA,
          status: 'disabled',
          purpose: 'retry center closure',
          correlationId: '66666666-6666-4666-8666-666666666666',
        },
      ),
    ).resolves.toEqual({ changed: false, status: 'disabled' });
    await expect(resolveIamCenterEntry(appPool, 'alpha')).resolves.toBeNull();

    await expect(
      setIamCenterEntryStatus(
        appPool,
        { issuer: 'test', subject: 'identity-manager', tenantId: tenantA },
        {
          centerId: centerA,
          status: 'active',
          purpose: 'manager cannot change platform entry lifecycle',
          correlationId: '22222222-2222-4222-8222-222222222222',
        },
      ),
    ).resolves.toEqual({ deniedReason: 'permission_missing' });

    await expect(
      setIamCenterEntryStatus(
        appPool,
        { issuer: 'test', subject: 'identity-a', tenantId: tenantA },
        {
          centerId: centerB,
          status: 'disabled',
          purpose: 'cross-tenant target must remain inaccessible',
          correlationId: '33333333-3333-4333-8333-333333333333',
        },
      ),
    ).resolves.toEqual({ deniedReason: 'resource_missing_or_inaccessible' });
    await expect(resolveIamCenterEntry(appPool, 'bravo')).resolves.toEqual({
      tenantId: tenantB,
      centerId: centerB,
    });

    await expect(
      setIamCenterEntryStatus(
        appPool,
        { issuer: 'test', subject: 'unknown', tenantId: tenantA },
        {
          centerId: centerA,
          status: 'active',
          purpose: 'unknown actor must be audited',
          correlationId: '55555555-5555-4555-8555-555555555555',
        },
      ),
    ).resolves.toEqual({ deniedReason: 'membership_missing_or_inactive' });

    await expect(
      setIamCenterEntryStatus(
        appPool,
        { issuer: 'test', subject: 'identity-a', tenantId: tenantA },
        {
          centerId: centerA,
          status: 'active',
          purpose: 'center reopened',
          correlationId: '44444444-4444-4444-8444-444444444444',
        },
      ),
    ).resolves.toEqual({ changed: true, status: 'active' });
    await expect(resolveIamCenterEntry(appPool, 'alpha')).resolves.toEqual({
      tenantId: tenantA,
      centerId: centerA,
    });

    const audit = await adminPool.query<{
      action: string;
      purpose: string | null;
      reason: string | null;
      result: string;
      sourceMetadata: Record<string, boolean | string> | null;
    }>(
      `SELECT action, purpose, reason, result, source_metadata AS "sourceMetadata"
       FROM iam_app.audit_records
       WHERE tenant_id = $1 AND resource_id = $2
       ORDER BY created_at, action`,
      [tenantA, centerA],
    );
    expect(audit.rows).toEqual([
      {
        action: 'center_entry.disable',
        purpose: 'center temporarily closed',
        reason: null,
        result: 'success',
        sourceMetadata: {
          changed: true,
          centerKey: 'alpha',
          previousStatus: 'active',
          newStatus: 'disabled',
        },
      },
      {
        action: 'center_entry.disable',
        purpose: 'retry center closure',
        reason: null,
        result: 'success',
        sourceMetadata: {
          changed: false,
          centerKey: 'alpha',
          previousStatus: 'disabled',
          newStatus: 'disabled',
        },
      },
      {
        action: 'center_entry.enable',
        purpose: 'manager cannot change platform entry lifecycle',
        reason: 'permission_missing',
        result: 'denied',
        sourceMetadata: null,
      },
      {
        action: 'center_entry.enable',
        purpose: 'unknown actor must be audited',
        reason: 'membership_missing_or_inactive',
        result: 'denied',
        sourceMetadata: null,
      },
      {
        action: 'center_entry.enable',
        purpose: 'center reopened',
        reason: null,
        result: 'success',
        sourceMetadata: {
          changed: true,
          centerKey: 'alpha',
          previousStatus: 'disabled',
          newStatus: 'active',
        },
      },
    ]);
  });

  it('forces tenant-context RLS while privileged commands remain tenant-scoped (DATA-01, MT-REQ-004)', async () => {
    const secondIdentity = 'b2222222-2222-2222-2222-222222222222';
    const sessionHashA = 'a'.repeat(64);
    const sessionHashB = 'b'.repeat(64);
    const handleHashA = 'c'.repeat(64);
    const handleHashB = 'd'.repeat(64);

    await adminPool.query(
      `INSERT INTO iam_app.tenants(id,name) VALUES ($1,'A'),($2,'B')`,
      [tenantA, tenantB],
    );
    await adminPool.query(
      `INSERT INTO iam_app.identities(id) VALUES ($1),($2)`,
      [identity, secondIdentity],
    );
    await adminPool.query(
      `INSERT INTO iam_app.external_identities(identity_id,issuer,subject)
       VALUES ($1,'test','identity-a'),($2,'test','identity-b')`,
      [identity, secondIdentity],
    );
    await adminPool.query(
      `INSERT INTO iam_app.memberships(id,tenant_id,identity_id,status,roles)
       VALUES
         ('aaaaaaaa-1111-1111-1111-111111111111',$1,$3,'active',ARRAY['tenant_owner']),
         ('bbbbbbbb-2222-2222-2222-222222222222',$2,$4,'active',ARRAY['tenant_owner'])`,
      [tenantA, tenantB, identity, secondIdentity],
    );

    const issueForTenantA = await appPool.query<{ outcome: object }>(
      `SELECT iam_app.issue_tenant_context_command(
        'test', 'identity-a', $1, $2::uuid, $3
      ) AS outcome`,
      [sessionHashA, tenantA, handleHashA],
    );
    expect(issueForTenantA.rows[0]?.outcome).toMatchObject({
      tenantId: tenantA,
    });

    const unauthorizedIssue = await appPool.query<{ outcome: object }>(
      `SELECT iam_app.issue_tenant_context_command(
        'test', 'identity-a', $1, $2::uuid, $3
      ) AS outcome`,
      [sessionHashA, tenantB, handleHashB],
    );
    expect(unauthorizedIssue.rows[0]?.outcome).toEqual({
      deniedReason: 'membership_missing_or_inactive',
    });

    const issueForTenantB = await appPool.query<{ outcome: object }>(
      `SELECT iam_app.issue_tenant_context_command(
        'test', 'identity-b', $1, $2::uuid, $3
      ) AS outcome`,
      [sessionHashB, tenantB, handleHashB],
    );
    expect(issueForTenantB.rows[0]?.outcome).toMatchObject({
      tenantId: tenantB,
    });

    await expect(
      appPool.query('SELECT tenant_id FROM iam_app.tenant_contexts'),
    ).rejects.toThrow();
    await expect(
      migrationPool.query('SELECT tenant_id FROM iam_app.tenant_contexts'),
    ).rejects.toThrow();

    const crossTenantResolution = await appPool.query<{
      context: object | null;
    }>(
      `SELECT iam_app.resolve_tenant_context_command(
        'test', 'identity-b', $1, $2
      ) AS context`,
      [sessionHashA, handleHashA],
    );
    expect(crossTenantResolution.rows[0]?.context).toBeNull();

    const storedContexts = await Promise.all(
      [tenantA, tenantB].map((tenantId) =>
        withAdminTenant(migrationPool, tenantId, async (client) => {
          const result = await client.query<{ tenant_id: string }>(
            `SELECT tenant_id
             FROM iam_app.tenant_contexts
             ORDER BY tenant_id`,
          );
          return result.rows[0];
        }),
      ),
    );
    expect(storedContexts).toEqual([
      { tenant_id: tenantA },
      { tenant_id: tenantB },
    ]);
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

  it('enforces the context issuance rate across an identity session in multiple tenants (ADR-DIVE-008, MT-REQ-004)', async () => {
    const sessionHash = 'a'.repeat(64);
    await adminPool.query(
      `INSERT INTO iam_app.tenants(id,name) VALUES ($1,'A'),($2,'B')`,
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
      `INSERT INTO iam_app.memberships(id,tenant_id,identity_id,status,roles)
       VALUES
         ('aaaaaaaa-1111-1111-1111-111111111111',$1,$3,'active',ARRAY['tenant_owner']),
         ('bbbbbbbb-2222-2222-2222-222222222222',$2,$3,'active',ARRAY['auditor_compliance'])`,
      [tenantA, tenantB, identity],
    );

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const tenantId = attempt % 2 === 0 ? tenantA : tenantB;
      const handleHash = attempt.toString(16).padStart(64, '0');
      const issued = await appPool.query<{ outcome: object }>(
        `SELECT iam_app.issue_tenant_context_command(
          'test', 'shared-person', $1, $2::uuid, $3
        ) AS outcome`,
        [sessionHash, tenantId, handleHash],
      );
      expect(issued.rows[0]?.outcome).toMatchObject({ tenantId });
    }

    const denied = await appPool.query<{ outcome: object }>(
      `SELECT iam_app.issue_tenant_context_command(
        'test', 'shared-person', $1, $2::uuid, $3
      ) AS outcome`,
      [sessionHash, tenantA, 'f'.repeat(64)],
    );
    expect(denied.rows[0]?.outcome).toEqual({
      deniedReason: 'invariant_violation',
    });
  });

  it('retains active and recent revoked contexts while cleaning older revoked contexts (ADR-DIVE-008)', async () => {
    await adminPool.query(
      `INSERT INTO iam_app.tenants(id,name) VALUES ($1,'A')`,
      [tenantA],
    );
    await adminPool.query('INSERT INTO iam_app.identities(id) VALUES ($1)', [
      identity,
    ]);
    await adminPool.query(
      `INSERT INTO iam_app.memberships(id,tenant_id,identity_id,status,roles)
       VALUES ('aaaaaaaa-1111-1111-1111-111111111111',$1,$2,'active',ARRAY['tenant_owner'])`,
      [tenantA, identity],
    );
    await withAdminTenant(migrationPool, tenantA, (client) =>
      client.query(
        `INSERT INTO iam_app.tenant_contexts(
           handle_hash, identity_id, tenant_id, session_id_hash, issued_at, revoked_at
         ) VALUES
           ($1,$2,$3,$4,clock_timestamp() - interval '31 days',clock_timestamp() - interval '31 days'),
           ($5,$2,$3,$4,clock_timestamp() - interval '29 days',clock_timestamp() - interval '29 days'),
           ($6,$2,$3,$4,clock_timestamp(),NULL)`,
        [
          'a'.repeat(64),
          identity,
          tenantA,
          'b'.repeat(64),
          'c'.repeat(64),
          'd'.repeat(64),
        ],
      ),
    );

    await expect(cleanupRevokedIamTenantContexts(appPool)).resolves.toEqual({
      deletedCount: 1,
    });
    const remaining = await withAdminTenant(migrationPool, tenantA, (client) =>
      client.query<{ handle_hash: string }>(
        `SELECT handle_hash
         FROM iam_app.tenant_contexts
         WHERE tenant_id=$1 AND identity_id=$2
         ORDER BY handle_hash`,
        [tenantA, identity],
      ),
    );
    expect(remaining.rows).toEqual([
      { handle_hash: 'c'.repeat(64) },
      { handle_hash: 'd'.repeat(64) },
    ]);
  });

  it('denies direct app-role updates and enforces last-owner through the command (DIVE-IAM-REQ-018, DIVE-IAM-REQ-025)', async () => {
    await adminPool.query(
      `INSERT INTO iam_app.tenants(id,name) VALUES ($1,'A')`,
      [tenantA],
    );
    await adminPool.query('INSERT INTO iam_app.identities(id) VALUES ($1)', [
      identity,
    ]);
    await adminPool.query(
      `INSERT INTO iam_app.external_identities(identity_id,issuer,subject)
       VALUES ($1,'test','owner')`,
      [identity],
    );
    await adminPool.query(
      `INSERT INTO iam_app.memberships(id,tenant_id,identity_id,status,roles)
       VALUES ('aaaaaaaa-1111-1111-1111-111111111111',$1,$2,'active',ARRAY['tenant_owner'])`,
      [tenantA, identity],
    );

    const client = await appPool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT set_config($1, $2, true)', [
        'app.tenant_id',
        tenantA,
      ]);
      await expect(
        client.query(
          `UPDATE iam_app.memberships
           SET status='disabled'
           WHERE tenant_id=$1 AND id='aaaaaaaa-1111-1111-1111-111111111111'`,
          [tenantA],
        ),
      ).rejects.toThrow('permission denied for table memberships');
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }

    const result = await adminPool.query(
      `SELECT status FROM iam_app.memberships
       WHERE tenant_id=$1 AND id='aaaaaaaa-1111-1111-1111-111111111111'`,
      [tenantA],
    );
    expect(result.rows[0]?.status).toBe('active');

    await expect(
      disableIamMembership(
        appPool,
        {
          issuer: 'test',
          subject: 'owner',
          verifiedAddresses: ['owner@example.test'],
        },
        {
          tenantId: tenantA,
          membershipId: 'aaaaaaaa-1111-1111-1111-111111111111',
          correlationId: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
        },
      ),
    ).resolves.toEqual({ deniedReason: 'last_owner' });
  });
});
