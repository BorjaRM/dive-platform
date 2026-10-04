import { createHash, randomUUID } from 'node:crypto';
import {
  authenticateIdentity,
  DeterministicIdentityProvider,
} from '@dive-center/identity';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootstrapRoles } from '../../src/bootstrap-roles.js';
import {
  resolveIamAccess,
  withIamAuthorizedTenant,
} from '../../src/iam-authorize.js';
import {
  issueIamInvitation,
  revokeIamInvitation,
} from '../../src/iam-membership-commands.js';
import {
  issueIamTenantContext,
  resolveIamTenantContext,
} from '../../src/iam-tenant-context-commands.js';
import { migrateProduct } from '../../src/migrate.js';
import { createAdminPool, createAppPool } from './harness.js';

const tenantColumnRelations = [
  'booking_app.activities',
  'booking_app.bookings',
  'booking_app.capability_verifiers',
  'booking_app.catalog_settings',
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
  'booking_app.catalog_settings',
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

const commandOnlyRelations = [
  'iam_app.audit_records',
  'iam_app.invitations',
  'iam_app.memberships',
  'iam_app.outbox_events',
  'iam_app.tenant_contexts',
] as const;

const readableIsolationRelations = [
  {
    relation: 'booking_app.activities',
    updateColumn: 'status',
    insertable: true,
  },
  {
    relation: 'booking_app.bookings',
    updateColumn: 'status',
    insertable: true,
  },
  {
    relation: 'booking_app.capability_verifiers',
    updateColumn: 'revoked_at',
    insertable: true,
  },
  {
    relation: 'booking_app.catalog_settings',
    updateColumn: null,
    insertable: true,
  },
  {
    relation: 'booking_app.channels',
    updateColumn: 'confirmation_mode',
    insertable: false,
  },
  { relation: 'booking_app.slots', updateColumn: 'status', insertable: true },
  { relation: 'iam_app.center_entries', updateColumn: null, insertable: false },
  { relation: 'iam_app.centers', updateColumn: null, insertable: false },
  { relation: 'iam_app.tenants', updateColumn: null, insertable: false },
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
  let appPool: Pool;

  beforeAll(async () => {
    adminPool = createAdminPool();
    appPool = createAppPool(1);
    await bootstrapRoles(adminPool);
    await migrateProduct();
  });

  afterAll(async () => {
    await appPool.end();
    await adminPool.end();
  });

  it('limits activity UPDATE grants to editable content, revision and state (DIVE-BOOK-REQ-078, MT-REQ-004)', async () => {
    const columns = await adminPool.query<{
      column_name: string;
      allowed: boolean;
    }>(
      `SELECT column_name, has_column_privilege('dive_app', 'booking_app.activities', column_name, 'UPDATE') AS allowed FROM information_schema.columns WHERE table_schema='booking_app' AND table_name='activities' ORDER BY column_name`,
    );
    expect(
      columns.rows
        .filter(({ allowed }) => allowed)
        .map(({ column_name }) => column_name),
    ).toEqual([
      'default_capacity',
      'description',
      'name',
      'revision',
      'status',
    ]);
  });

  it('isolates rows selected by real handles for an identity authorized in both tenants (MT-REQ-002, MT-REQ-004, MT-REQ-009, MT-REQ-010)', async () => {
    const identityId = randomUUID();
    const principal = await authenticateIdentity(
      new DeterministicIdentityProvider(
        new Map([
          [
            identityId,
            {
              issuer: 'product-isolation',
              subject: identityId,
              verifiedAddresses: [],
            },
          ],
        ]),
      ),
      identityId,
    );
    const sessionIdHash = createHash('sha256')
      .update(principal.sessionId)
      .digest('hex');
    const selections = Array.from({ length: 2 }, () => ({
      tenantId: randomUUID(),
      centerId: randomUUID(),
      handleHash: createHash('sha256').update(randomUUID()).digest('hex'),
      centerKey: `test-${randomUUID()}`,
      activityId: randomUUID(),
      slotId: randomUUID(),
      channelId: randomUUID(),
      bookingId: randomUUID(),
      invitationId: '',
      membershipId: '',
    }));
    expect(
      [
        ...commandOnlyRelations,
        ...readableIsolationRelations.map(({ relation }) => relation),
      ].sort(),
    ).toEqual([...tenantProtectedRelations].sort());
    await adminPool.query('INSERT INTO iam_app.identities(id) VALUES ($1)', [
      identityId,
    ]);
    await adminPool.query(
      'INSERT INTO iam_app.external_identities(identity_id,issuer,subject) VALUES ($1,$2,$3)',
      [identityId, principal.issuer, principal.subject],
    );
    for (const selection of selections) {
      await adminPool.query(
        'INSERT INTO iam_app.tenants(id,name) VALUES ($1,$2)',
        [selection.tenantId, selection.centerKey],
      );
      await adminPool.query(
        'INSERT INTO iam_app.centers(id,tenant_id,name,time_zone) VALUES ($1,$2,$3,$4)',
        [
          selection.centerId,
          selection.tenantId,
          selection.centerKey,
          'Europe/Madrid',
        ],
      );
      await adminPool.query(
        'INSERT INTO iam_app.center_entries(center_key,tenant_id,center_id) VALUES ($1,$2,$3)',
        [selection.centerKey, selection.tenantId, selection.centerId],
      );
      await adminPool.query(
        "INSERT INTO iam_app.memberships(id,tenant_id,identity_id,status,roles,center_ids) VALUES ($1,$2,$3,'active',ARRAY['tenant_admin'],NULL)",
        [randomUUID(), selection.tenantId, identityId],
      );
      await adminPool.query(
        "INSERT INTO booking_app.catalog_settings(tenant_id,center_id,default_activity_locale) VALUES ($1,$2,'es')",
        [selection.tenantId, selection.centerId],
      );
      await adminPool.query(
        `INSERT INTO booking_app.activities(id,tenant_id,center_id,base_locale,name,status)
         VALUES ($1,$2,$3,'es','{"es":"Isolation activity"}'::jsonb,'Published')`,
        [selection.activityId, selection.tenantId, selection.centerId],
      );
      await adminPool.query(
        `INSERT INTO booking_app.slots(id,tenant_id,center_id,activity_id,starts_at,duration_minutes,capacity,status)
         VALUES ($1,$2,$3,$4,'2030-10-01T10:00:00Z',60,4,'Available')`,
        [
          selection.slotId,
          selection.tenantId,
          selection.centerId,
          selection.activityId,
        ],
      );
      await adminPool.query(
        `INSERT INTO booking_app.channels(id,tenant_id,center_id,public_id,type,activity_id,status,confirmation_mode,allowed_origins)
         VALUES ($1,$2,$3,$4,'single_activity',$5,'Published','immediate',ARRAY['https://isolation.example.test'])`,
        [
          selection.channelId,
          selection.tenantId,
          selection.centerId,
          selection.centerKey,
          selection.activityId,
        ],
      );
      await adminPool.query(
        `INSERT INTO booking_app.bookings(id,tenant_id,center_id,channel_id,slot_id,booking_channel,idempotency_key,request_hash,status,seats,locale,booker_first_name,booker_last_name,booker_email)
         VALUES ($1,$2,$3,$4,$5,'public_hosted',$6,$6,'Confirmed',1,'es','Test','Isolation','test@example.test')`,
        [
          selection.bookingId,
          selection.tenantId,
          selection.centerId,
          selection.channelId,
          selection.slotId,
          selection.centerKey,
        ],
      );
      await adminPool.query(
        `INSERT INTO booking_app.capability_verifiers(id,tenant_id,booking_id,purpose,version,verifier_hash,expires_at)
         VALUES ($1,$2,$3,'booking_cancel',1,$4,'2030-10-01T12:00:00Z')`,
        [
          randomUUID(),
          selection.tenantId,
          selection.bookingId,
          selection.centerKey,
        ],
      );
      const invitation = await issueIamInvitation(appPool, principal, {
        tenantId: selection.tenantId,
        targetAddress: `${selection.centerKey}@example.test`,
        roles: ['center_manager'],
        centerIds: [selection.centerId],
        idempotencyKey: randomUUID(),
        correlationId: randomUUID(),
      });
      expect(invitation).toMatchObject({ status: 'pending', created: true });
      if ('deniedReason' in invitation)
        throw new Error('Expected an authorized invitation');
      selection.invitationId = invitation.invitationId;
      selection.membershipId = invitation.membershipId;
      await expect(
        issueIamTenantContext(appPool, principal, {
          tenantId: selection.tenantId,
          handleHash: selection.handleHash,
          sessionIdHash,
        }),
      ).resolves.toMatchObject({ tenantId: selection.tenantId });
    }
    const snapshotCommandTables = (tenantId: string) =>
      adminPool.query(
        `SELECT jsonb_build_object(
      'invitations', (SELECT jsonb_agg(to_jsonb(record) ORDER BY id) FROM iam_app.invitations record WHERE tenant_id=$1),
      'memberships', (SELECT jsonb_agg(to_jsonb(record) ORDER BY id) FROM iam_app.memberships record WHERE tenant_id=$1),
      'audit', (SELECT jsonb_agg(to_jsonb(record) ORDER BY id) FROM iam_app.audit_records record WHERE tenant_id=$1),
      'outbox', (SELECT jsonb_agg(to_jsonb(record) ORDER BY id) FROM iam_app.outbox_events record WHERE tenant_id=$1)
    ) AS state`,
        [tenantId],
      );
    for (const selection of selections) {
      const resolved = await resolveIamTenantContext(appPool, principal, {
        handleHash: selection.handleHash,
        sessionIdHash,
      });
      expect(resolved).toEqual({ identityId, tenantId: selection.tenantId });
      if (!resolved) throw new Error('Expected a valid tenant handle');
      const access = await resolveIamAccess(
        appPool,
        principal,
        resolved.tenantId,
      );
      await withIamAuthorizedTenant(appPool, access, async ({ client }) => {
        for (const { relation, updateColumn } of readableIsolationRelations) {
          const tenantColumn =
            relation === 'iam_app.tenants' ? 'id' : 'tenant_id';
          const own = await client.query(`SELECT * FROM ${relation}`);
          expect(own.rows.length, relation).toBeGreaterThan(0);
          expect(
            own.rows.every((row) => row[tenantColumn] === selection.tenantId),
            relation,
          ).toBe(true);
          const count = await client.query(
            `SELECT count(*)::int AS total FROM ${relation}`,
          );
          expect(count.rows[0]?.total, relation).toBe(own.rows.length);
          if (updateColumn) {
            const permitted = await client.query(
              `UPDATE ${relation} SET ${updateColumn}=${updateColumn} WHERE ${tenantColumn}=$1 RETURNING *`,
              [selection.tenantId],
            );
            expect(permitted.rows.length, relation).toBe(own.rows.length);
          }
          for (const foreign of selections.filter(
            (entry) => entry.tenantId !== selection.tenantId,
          )) {
            const denied = await client.query(
              `SELECT * FROM ${relation} WHERE ${tenantColumn}=$1`,
              [foreign.tenantId],
            );
            expect(denied.rows, relation).toEqual([]);
            const aggregate = await client.query(
              `SELECT count(*)::int AS total FROM ${relation} WHERE ${tenantColumn}=$1`,
              [foreign.tenantId],
            );
            expect(aggregate.rows[0]?.total, relation).toBe(0);
            if (updateColumn) {
              const mutation = await client.query(
                `UPDATE ${relation} SET ${updateColumn}=${updateColumn} WHERE ${tenantColumn}=$1 RETURNING *`,
                [foreign.tenantId],
              );
              expect(mutation.rows, relation).toEqual([]);
            }
          }
        }
      });
      for (const relation of [
        ...commandOnlyRelations,
        'iam_app.identity_tenants',
      ]) {
        const seeded = await adminPool.query(
          `SELECT count(*)::int AS total FROM ${relation} WHERE tenant_id=$1`,
          [selection.tenantId],
        );
        expect(seeded.rows[0]?.total, relation).toBeGreaterThan(0);
        await expect(
          withIamAuthorizedTenant(appPool, access, ({ client }) =>
            client.query(`SELECT * FROM ${relation}`),
          ),
          relation,
        ).rejects.toMatchObject({ code: '42501' });
      }
      for (const foreign of selections.filter(
        (entry) => entry.tenantId !== selection.tenantId,
      )) {
        for (const { relation, insertable } of readableIsolationRelations) {
          if (!insertable) continue;
          const row = await adminPool.query(
            `SELECT to_jsonb(record) AS row FROM ${relation} record WHERE tenant_id=$1 LIMIT 1`,
            [foreign.tenantId],
          );
          const attemptedRow = { ...row.rows[0]?.row, id: randomUUID() };
          await expect(
            withIamAuthorizedTenant(appPool, access, ({ client }) =>
              client.query(
                `INSERT INTO ${relation} SELECT * FROM jsonb_populate_record(NULL::${relation}, $1::jsonb)`,
                [JSON.stringify(attemptedRow)],
              ),
            ),
            relation,
          ).rejects.toMatchObject({ code: '42501' });
        }
        const before = await snapshotCommandTables(foreign.tenantId);
        await expect(
          revokeIamInvitation(appPool, principal, {
            tenantId: resolved.tenantId,
            invitationId: foreign.invitationId,
            correlationId: randomUUID(),
          }),
        ).resolves.toMatchObject({ deniedReason: 'duplicate_or_replayed' });
        const after = await snapshotCommandTables(foreign.tenantId);
        expect(after.rows).toEqual(before.rows);
      }
    }
    for (const selection of selections) {
      await expect(
        revokeIamInvitation(appPool, principal, {
          tenantId: selection.tenantId,
          invitationId: selection.invitationId,
          correlationId: randomUUID(),
        }),
      ).resolves.toMatchObject({
        status: 'revoked',
        invitationId: selection.invitationId,
      });
      const state = await snapshotCommandTables(selection.tenantId);
      expect(state.rows[0]?.state.invitations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: selection.invitationId,
            status: 'revoked',
          }),
        ]),
      );
      expect(state.rows[0]?.state.memberships).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: selection.membershipId,
            status: 'disabled',
          }),
        ]),
      );
      expect(state.rows[0]?.state.audit).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            resource_id: selection.invitationId,
            actor_identity_id: identityId,
            result: 'success',
          }),
        ]),
      );
      expect(state.rows[0]?.state.outbox).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            event_type: 'iam.invitation.revoked.v1',
            payload: expect.objectContaining({
              invitationId: selection.invitationId,
            }),
          }),
        ]),
      );
    }
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
    expect(functions.rows.map((routine) => routine.routine)).toContain(
      'iam_app.record_booking_read',
    );
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

  it('allows only tenant-scoped runtime reads of retained center mappings (MT-REQ-004)', async () => {
    const privileges = await adminPool.query<{
      can_delete: boolean;
      can_insert: boolean;
      can_select: boolean;
      can_update: boolean;
    }>(
      `SELECT has_table_privilege('dive_app', 'iam_app.center_entries', 'SELECT') AS can_select,
              has_table_privilege('dive_app', 'iam_app.center_entries', 'INSERT') AS can_insert,
              has_table_privilege('dive_app', 'iam_app.center_entries', 'UPDATE') AS can_update,
              has_table_privilege('dive_app', 'iam_app.center_entries', 'DELETE') AS can_delete`,
    );
    expect(privileges.rows[0]).toEqual({
      can_delete: false,
      can_insert: false,
      can_select: true,
      can_update: false,
    });
    const policies = await adminPool.query<{ qual: string }>(
      `SELECT qual FROM pg_policies
       WHERE schemaname = 'iam_app' AND tablename = 'center_entries'`,
    );
    expect(policies.rows).toHaveLength(1);
    expect(policies.rows[0]?.qual).toContain('CURRENT_USER');
    expect(policies.rows[0]?.qual).toContain("'dive_migration'::name");
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
