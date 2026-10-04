import {
  authenticateIdentity,
  DeterministicIdentityProvider,
} from '@dive-center/identity';
import { Pool, type PoolClient } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { bootstrapRoles } from '../../src/bootstrap-roles.js';
import {
  spikeAppDatabaseUrl,
  spikePlatformAdminDatabaseUrl,
  spikeWorkerDatabaseUrl,
} from '../../src/env.js';
import { migrateProduct } from '../../src/migrate.js';
import {
  claimBootstrapOutboxEvent,
  completeBootstrapOutboxEvent,
  completeOwnTenantBootstrap,
  consumeBootstrapInvitationRateLimit,
  failBootstrapOutboxEvent,
  issueBootstrapInvitation,
  readBootstrapInvitation,
  reissueBootstrapInvitation,
  retryBootstrapInvitationRevoke,
  revokeBootstrapInvitation,
  setBootstrapPlatformCapability,
} from '../../src/onboarding-commands.js';
import { createAdminPool, tenantA } from './harness.js';

const correlationId = 'aaaaaaaa-1111-4111-8111-111111111111';
const provider = new DeterministicIdentityProvider(
  new Map([
    [
      'platform-token',
      {
        issuer: 'https://identity.example.test',
        subject: 'platform-operator',
        sessionId: 'platform-session',
        verifiedAddresses: ['operator@example.test'],
      },
    ],
    [
      'tenant-token',
      {
        issuer: 'https://identity.example.test',
        subject: 'tenant-operator',
        sessionId: 'tenant-session',
        verifiedAddresses: ['tenant@example.test'],
      },
    ],
    [
      'bootstrap-token',
      {
        issuer: 'https://identity.example.test',
        subject: 'invited-owner',
        sessionId: 'bootstrap-session',
        verifiedAddresses: ['owner@example.test'],
      },
    ],
  ]),
);

describe('bootstrap invitation persistence (DIVE-ONB-REQ-001..009, 013, 039..040, 043..047)', () => {
  let adminPool: Pool;
  let appPool: Pool;
  let platformAdminPool: Pool;
  let workerPool: Pool;

  beforeAll(async () => {
    adminPool = createAdminPool();
    await bootstrapRoles(adminPool);
    await migrateProduct();
    appPool = new Pool({ connectionString: spikeAppDatabaseUrl(), max: 2 });
    platformAdminPool = new Pool({
      connectionString: spikePlatformAdminDatabaseUrl(),
      max: 1,
    });
    workerPool = new Pool({
      connectionString: spikeWorkerDatabaseUrl(),
      max: 2,
    });
  });

  beforeEach(async () => {
    await adminPool.query(
      `TRUNCATE onboarding_app.bootstrap_invitation_audit_records,
        onboarding_app.tenant_bootstrap_outbox_events,
        onboarding_app.bootstrap_invitation_command_receipts,
        onboarding_app.bootstrap_redemption_rate_limits,
        onboarding_app.tenant_bootstrap_grants,
        onboarding_app.platform_principal_capabilities,
        onboarding_app.platform_principals CASCADE`,
    );
    for (const capability of [
      'bootstrap_invitation.issue',
      'bootstrap_invitation.read',
      'bootstrap_invitation.reissue',
      'bootstrap_invitation.revoke',
    ] as const) {
      await setBootstrapPlatformCapability(platformAdminPool, {
        issuer: 'https://identity.example.test',
        subject: 'platform-operator',
        capability,
        enabled: true,
      });
    }
  });

  afterAll(async () => {
    await workerPool?.end();
    await platformAdminPool?.end();
    await appPool?.end();
    await adminPool?.end();
  });

  async function issueDeliveredGrant(idempotencyKey: string): Promise<string> {
    const platformPrincipal = await authenticateIdentity(
      provider,
      'platform-token',
    );
    const issued = await issueBootstrapInvitation(appPool, platformPrincipal, {
      destinationEmail: 'owner@example.test',
      reason: 'Self bootstrap',
      idempotencyKey,
      correlationId,
    });
    if ('deniedReason' in issued) throw new Error('Expected issued invitation');
    const workerClient = await workerPool.connect();
    try {
      await workerClient.query('BEGIN');
      const event = await claimBootstrapOutboxEvent(workerClient);
      if (!event) throw new Error('Expected provider create command');
      await completeBootstrapOutboxEvent(workerClient, {
        eventId: event.eventId,
        providerInvitationRef: `clerk_${idempotencyKey}`,
        providerStatus: 'pending',
      });
      await workerClient.query('COMMIT');
    } catch (error) {
      await workerClient.query('ROLLBACK');
      throw error;
    } finally {
      workerClient.release();
    }
    return issued.invitationId;
  }

  it('denies direct relation access while allowing only role-owned commands', async () => {
    await expect(
      appPool.query('SELECT * FROM onboarding_app.tenant_bootstrap_grants'),
    ).rejects.toThrow(/permission denied/);
    await expect(
      appPool.query(
        'SELECT * FROM onboarding_app.bootstrap_invitation_rate_limits',
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      workerPool.query('SELECT * FROM onboarding_app.tenant_bootstrap_grants'),
    ).rejects.toThrow(/permission denied/);
    await expect(
      platformAdminPool.query(
        'SELECT * FROM onboarding_app.platform_principals',
      ),
    ).rejects.toThrow(/permission denied/);
    const workerClient = await workerPool.connect();
    try {
      await workerClient.query('BEGIN');
      await workerClient.query("SELECT set_config('app.tenant_id', $1, true)", [
        tenantA,
      ]);
      await expect(
        workerClient.query('SELECT * FROM iam_app.memberships'),
      ).rejects.toMatchObject({ code: '42501' });
    } finally {
      await workerClient.query('ROLLBACK');
      workerClient.release();
    }
  });

  it.each(['complete', 'fail'] as const)(
    'requires a same-transaction claim for bootstrap %s and rejects terminal events (DIVE-ONB-REQ-044)',
    async (command) => {
      const principal = await authenticateIdentity(provider, 'platform-token');
      for (const suffix of ['first', 'second']) {
        await issueBootstrapInvitation(appPool, principal, {
          destinationEmail: `${suffix}@example.test`,
          idempotencyKey: `claim-boundary-${suffix}`,
          correlationId,
        });
      }
      const events = await adminPool.query<{ id: string }>(
        `SELECT id FROM onboarding_app.tenant_bootstrap_outbox_events ORDER BY created_at, id`,
      );
      const eventId = events.rows[0]?.id;
      const otherEventId = events.rows[1]?.id;
      if (!eventId || !otherEventId)
        throw new Error('Expected two bootstrap events');
      const finish = (client: PoolClient, targetEventId: string) => {
        if (command === 'complete') {
          return completeBootstrapOutboxEvent(client, {
            eventId: targetEventId,
            providerInvitationRef: 'clerk_claim_boundary',
            providerStatus: 'pending',
          });
        }
        return failBootstrapOutboxEvent(client, {
          eventId: targetEventId,
          retryable: false,
          nextAttemptAt: null,
          providerStatus: 'http_400',
        });
      };
      const claimedClient = await workerPool.connect();
      const otherClient = await workerPool.connect();
      try {
        await expect(finish(otherClient, eventId)).rejects.toMatchObject({
          code: '42501',
        });
        await claimedClient.query('BEGIN');
        const claim = await claimBootstrapOutboxEvent(claimedClient);
        expect(claim?.eventId).toBe(eventId);
        await expect(finish(otherClient, eventId)).rejects.toMatchObject({
          code: '42501',
        });
        await claimedClient.query('SAVEPOINT wrong_event');
        await expect(finish(claimedClient, otherEventId)).rejects.toMatchObject(
          { code: '42501' },
        );
        await claimedClient.query('ROLLBACK TO SAVEPOINT wrong_event');
        await finish(claimedClient, eventId);
        await claimedClient.query('COMMIT');
        await expect(finish(claimedClient, eventId)).rejects.toMatchObject({
          code: '42501',
        });
        expect(
          (
            await adminPool.query(
              `SELECT delivery_state, attempt_count FROM onboarding_app.tenant_bootstrap_outbox_events WHERE id = $1`,
              [otherEventId],
            )
          ).rows,
        ).toEqual([{ delivery_state: 'pending', attempt_count: 0 }]);
      } finally {
        await claimedClient.query('ROLLBACK');
        claimedClient.release();
        otherClient.release();
      }
    },
  );

  it('issues atomically, normalizes email, and replays only the same command payload', async () => {
    const principal = await authenticateIdentity(provider, 'platform-token');
    const input = {
      destinationEmail: '  OWNER@Example.Test ',
      reason: 'Pilot onboarding',
      idempotencyKey: 'issue-1',
      correlationId,
    } as const;
    const issued = await issueBootstrapInvitation(appPool, principal, input);
    expect(issued).toMatchObject({
      destinationEmail: 'owner@example.test',
      status: 'issued',
      deliveryStatus: 'pending',
    });
    expect(await issueBootstrapInvitation(appPool, principal, input)).toEqual(
      issued,
    );
    expect(
      await issueBootstrapInvitation(appPool, principal, {
        ...input,
        reason: 'Different reason',
      }),
    ).toEqual({ deniedReason: 'idempotency_conflict' });

    if ('deniedReason' in issued) throw new Error('Expected issued invitation');
    expect(
      await readBootstrapInvitation(appPool, principal, issued.invitationId),
    ).toMatchObject({
      invitationId: issued.invitationId,
      status: 'issued',
      deliveryStatus: 'pending',
    });
    const persisted = await adminPool.query<{
      audit_count: number;
      destination_email: string;
      outbox_count: number;
    }>(
      `SELECT bootstrap_grant.destination_email,
              (SELECT count(*)::int FROM onboarding_app.bootstrap_invitation_audit_records) AS audit_count,
              (SELECT count(*)::int FROM onboarding_app.tenant_bootstrap_outbox_events) AS outbox_count
       FROM onboarding_app.tenant_bootstrap_grants bootstrap_grant
       WHERE bootstrap_grant.id=$1`,
      [issued.invitationId],
    );
    expect(persisted.rows[0]).toEqual({
      audit_count: 1,
      destination_email: 'owner@example.test',
      outbox_count: 1,
    });
  });

  it('stores an absent initial reason as NULL and distinguishes it from a provided reason', async () => {
    const principal = await authenticateIdentity(provider, 'platform-token');
    const input = {
      destinationEmail: 'owner@example.test',
      idempotencyKey: 'issue-without-reason',
      correlationId,
    } as const;
    const issued = await issueBootstrapInvitation(appPool, principal, input);
    expect(issued).toMatchObject({ status: 'issued' });
    expect(await issueBootstrapInvitation(appPool, principal, input)).toEqual(
      issued,
    );
    expect(
      await issueBootstrapInvitation(appPool, principal, {
        ...input,
        reason: 'Provided later',
      }),
    ).toEqual({ deniedReason: 'idempotency_conflict' });

    if ('deniedReason' in issued) throw new Error('Expected issued invitation');
    const persisted = await adminPool.query<{
      audit_reason: string | null;
      issue_reason: string | null;
    }>(
      `SELECT bootstrap_grant.issue_reason,
              (SELECT audit.reason
               FROM onboarding_app.bootstrap_invitation_audit_records audit
               WHERE audit.grant_id = bootstrap_grant.id
                 AND audit.action = 'tenant_bootstrap_invitation.issued') AS audit_reason
       FROM onboarding_app.tenant_bootstrap_grants bootstrap_grant
       WHERE bootstrap_grant.id = $1`,
      [issued.invitationId],
    );
    expect(persisted.rows[0]).toEqual({
      audit_reason: null,
      issue_reason: null,
    });
  });

  it('normalizes a blank initial reason at the SQL command boundary', async () => {
    const principal = await authenticateIdentity(provider, 'platform-token');
    const raw = await appPool.query<{
      outcome: {
        destinationEmail: string;
        invitationId: string;
        status: string;
      };
    }>(
      `SELECT onboarding_app.issue_bootstrap_invitation_command(
        $1, $2, $3, $4, $5, $6, $7::uuid
      ) AS outcome`,
      [
        principal.issuer,
        principal.subject,
        ' RAW@Example.Test ',
        '   ',
        'issue-blank-reason-sql',
        'a'.repeat(64),
        correlationId,
      ],
    );
    const outcome = raw.rows[0]?.outcome;
    expect(outcome).toMatchObject({
      destinationEmail: 'raw@example.test',
      status: 'issued',
    });

    const persisted = await adminPool.query<{
      audit_reason: string | null;
      issue_reason: string | null;
    }>(
      `SELECT bootstrap_grant.issue_reason,
              (SELECT audit.reason
               FROM onboarding_app.bootstrap_invitation_audit_records audit
               WHERE audit.grant_id = bootstrap_grant.id
                 AND audit.action = 'tenant_bootstrap_invitation.issued') AS audit_reason
       FROM onboarding_app.tenant_bootstrap_grants bootstrap_grant
       WHERE bootstrap_grant.id = $1`,
      [outcome?.invitationId],
    );
    expect(persisted.rows[0]).toEqual({
      audit_reason: null,
      issue_reason: null,
    });
  });

  it.each([
    ['reissue', null],
    ['reissue', '   '],
    ['revoke', null],
    ['revoke', '   '],
  ] as const)(
    'rejects %s with reason %s atomically at the SQL boundary (DIVE-ONB-REQ-039)',
    async (command, reason) => {
      const principal = await authenticateIdentity(provider, 'platform-token');
      const issued = await issueBootstrapInvitation(appPool, principal, {
        destinationEmail: 'owner@example.test',
        idempotencyKey: 'mutation-reason-issue',
        correlationId,
      });
      if ('deniedReason' in issued)
        throw new Error('Expected issued invitation');
      const snapshotSql = `SELECT
      (SELECT jsonb_agg(to_jsonb(bootstrap_grant) ORDER BY id) FROM onboarding_app.tenant_bootstrap_grants bootstrap_grant) AS grants,
      (SELECT jsonb_agg(to_jsonb(audit) ORDER BY id) FROM onboarding_app.bootstrap_invitation_audit_records audit) AS audit,
      (SELECT jsonb_agg(to_jsonb(event) ORDER BY id) FROM onboarding_app.tenant_bootstrap_outbox_events event) AS events,
      (SELECT jsonb_agg(to_jsonb(receipt) ORDER BY command) FROM onboarding_app.bootstrap_invitation_command_receipts receipt) AS receipts`;
      const before = await adminPool.query(snapshotSql);
      await expect(
        appPool.query(
          `SELECT onboarding_app.${command}_bootstrap_invitation_command($1, $2, $3::uuid, $4, $5, $6, $7::uuid)`,
          [
            principal.issuer,
            principal.subject,
            issued.invitationId,
            reason,
            'invalid-mutation',
            'b'.repeat(64),
            correlationId,
          ],
        ),
      ).rejects.toMatchObject({
        code: '23514',
        constraint: 'bootstrap_invitation_audit_mutation_reason_required',
      });
      expect((await adminPool.query(snapshotSql)).rows).toEqual(before.rows);
    },
  );

  it('serializes concurrent administrative idempotency to one issued result (DIVE-ONB-REQ-039..040)', async () => {
    const principal = await authenticateIdentity(provider, 'platform-token');
    const input = {
      destinationEmail: 'owner@example.test',
      reason: 'Concurrent issue',
      idempotencyKey: 'concurrent-issue',
      correlationId,
    } as const;

    const [first, second] = await Promise.all([
      issueBootstrapInvitation(appPool, principal, input),
      issueBootstrapInvitation(appPool, principal, input),
    ]);

    expect(first).toEqual(second);
    const counts = await adminPool.query<{
      audits: number;
      grants: number;
      outbox_events: number;
      receipts: number;
    }>(
      `SELECT
        (SELECT count(*)::int FROM onboarding_app.tenant_bootstrap_grants) AS grants,
        (SELECT count(*)::int FROM onboarding_app.tenant_bootstrap_outbox_events) AS outbox_events,
        (SELECT count(*)::int FROM onboarding_app.bootstrap_invitation_audit_records) AS audits,
        (SELECT count(*)::int FROM onboarding_app.bootstrap_invitation_command_receipts) AS receipts`,
    );
    expect(counts.rows[0]).toEqual({
      audits: 1,
      grants: 1,
      outbox_events: 1,
      receipts: 1,
    });
  });

  it('serializes concurrent reissue and revoke commands by namespace (DIVE-ONB-REQ-039..040)', async () => {
    const principal = await authenticateIdentity(provider, 'platform-token');
    const issued = await issueBootstrapInvitation(appPool, principal, {
      destinationEmail: 'owner@example.test',
      reason: 'Initial issue',
      idempotencyKey: 'concurrent-mutations-issue',
      correlationId,
    });
    if ('deniedReason' in issued) throw new Error('Expected issued invitation');
    const reissueInput = {
      invitationId: issued.invitationId,
      reason: 'Concurrent reissue',
      idempotencyKey: 'concurrent-reissue',
      correlationId,
    } as const;

    const [firstReissue, secondReissue] = await Promise.all([
      reissueBootstrapInvitation(appPool, principal, reissueInput),
      reissueBootstrapInvitation(appPool, principal, reissueInput),
    ]);
    expect(firstReissue).toEqual(secondReissue);
    if ('deniedReason' in firstReissue) {
      throw new Error('Expected reissued invitation');
    }

    const revokeInput = {
      invitationId: firstReissue.invitationId,
      reason: 'Concurrent revoke',
      idempotencyKey: 'concurrent-revoke',
      correlationId,
    } as const;
    const [firstRevoke, secondRevoke] = await Promise.all([
      revokeBootstrapInvitation(appPool, principal, revokeInput),
      revokeBootstrapInvitation(appPool, principal, revokeInput),
    ]);
    expect(firstRevoke).toEqual(secondRevoke);

    const counts = await adminPool.query<{
      audits: number;
      grants: number;
      receipts: number;
    }>(
      `SELECT
        (SELECT count(*)::int FROM onboarding_app.tenant_bootstrap_grants) AS grants,
        (SELECT count(*)::int FROM onboarding_app.bootstrap_invitation_audit_records) AS audits,
        (SELECT count(*)::int FROM onboarding_app.bootstrap_invitation_command_receipts) AS receipts`,
    );
    expect(counts.rows[0]).toEqual({
      audits: 3,
      grants: 2,
      receipts: 3,
    });
  });

  it('completes one matching grant atomically and replays only the same payload (DIVE-ONB-REQ-006, DIVE-ONB-REQ-012, DIVE-ONB-REQ-018..021, DIVE-ONB-REQ-041..042, DIVE-ONB-REQ-047)', async () => {
    const invitationId = await issueDeliveredGrant(
      'bootstrap-completion-issue',
    );

    const invitedPrincipal = await authenticateIdentity(
      provider,
      'bootstrap-token',
    );
    const input = {
      operatorDisplayName: 'Océano Azul',
      centerDisplayName: 'Costa Norte',
      timeZone: 'Europe/Madrid',
      locale: 'es' as const,
      correlationId,
    };
    const completed = await completeOwnTenantBootstrap(
      appPool,
      invitedPrincipal,
      input,
    );
    expect(completed).not.toHaveProperty('deniedReason');
    if ('deniedReason' in completed) throw new Error('Expected completion');
    expect(completed.centerKey).toMatch(/^costa-norte(?:-[a-f0-9]{8})?$/);
    expect(
      await completeOwnTenantBootstrap(appPool, invitedPrincipal, input),
    ).toEqual(completed);
    expect(
      await completeOwnTenantBootstrap(appPool, invitedPrincipal, {
        ...input,
        centerDisplayName: 'Different center',
      }),
    ).toEqual({ deniedReason: 'idempotency_conflict' });

    const persisted = await adminPool.query<{
      audit_count: number;
      center_count: number;
      event_count: number;
      grant_status: string;
      membership_count: number;
      tenant_count: number;
    }>(
      `SELECT
        (SELECT count(*)::int FROM onboarding_app.bootstrap_invitation_audit_records
          WHERE action = 'tenant_bootstrap.completed') AS audit_count,
        (SELECT count(*)::int FROM iam_app.centers WHERE tenant_id = $1) AS center_count,
        (SELECT count(*)::int FROM iam_app.outbox_events
          WHERE tenant_id = $1 AND event_type = 'tenant.bootstrap.completed.v1') AS event_count,
        (SELECT status FROM onboarding_app.tenant_bootstrap_grants WHERE id = $2) AS grant_status,
        (SELECT count(*)::int FROM iam_app.memberships
          WHERE tenant_id = $1 AND status = 'active' AND roles = ARRAY['tenant_owner']) AS membership_count,
        (SELECT count(*)::int FROM iam_app.tenants WHERE id = $1) AS tenant_count`,
      [completed.tenantId, invitationId],
    );
    expect(persisted.rows[0]).toEqual({
      audit_count: 1,
      center_count: 1,
      event_count: 1,
      grant_status: 'consumed',
      membership_count: 1,
      tenant_count: 1,
    });
  });

  it('rolls back every bootstrap write when center-key allocation cannot complete (DIVE-ONB-REQ-013, DIVE-ONB-REQ-019, MT-REQ-005..006)', async () => {
    const invitationId = await issueDeliveredGrant('bootstrap-rollback');
    const centerKeyBase = `rollback-${invitationId.slice(0, 8)}`;
    const seedTenantId = 'cccccccc-3333-4333-8333-333333333333';
    const seedCenterId = 'cccccccc-4444-4444-8444-444444444444';
    const seedFallbackCenterId = 'cccccccc-5555-4555-8555-555555555555';
    await adminPool.query(
      `INSERT INTO iam_app.tenants(id, name) VALUES ($1, 'Rollback seed')`,
      [seedTenantId],
    );
    await adminPool.query(
      `INSERT INTO iam_app.centers(id, tenant_id, name, time_zone)
       VALUES ($1, $2, 'Rollback seed center', 'Europe/Madrid'),
              ($3, $2, 'Rollback fallback center', 'Europe/Madrid')`,
      [seedCenterId, seedTenantId, seedFallbackCenterId],
    );
    await adminPool.query(
      `INSERT INTO iam_app.center_entries(center_key, tenant_id, center_id)
       VALUES ($1, $2, $3), ($4, $2, $5)`,
      [
        centerKeyBase,
        seedTenantId,
        seedCenterId,
        `${centerKeyBase}-${invitationId.replaceAll('-', '').slice(0, 8)}`,
        seedFallbackCenterId,
      ],
    );

    const before = await adminPool.query<{
      identities: number;
      memberships: number;
      tenants: number;
    }>(
      `SELECT
        (SELECT count(*)::int FROM iam_app.identities) AS identities,
        (SELECT count(*)::int FROM iam_app.memberships) AS memberships,
        (SELECT count(*)::int FROM iam_app.tenants) AS tenants`,
    );
    const invitedPrincipal = await authenticateIdentity(
      provider,
      'bootstrap-token',
    );

    await expect(
      completeOwnTenantBootstrap(appPool, invitedPrincipal, {
        operatorDisplayName: 'Rollback operation',
        centerDisplayName: `Rollback ${invitationId.slice(0, 8)}`,
        timeZone: 'Europe/Madrid',
        locale: 'en',
        correlationId,
      }),
    ).rejects.toThrow(/duplicate key/);

    const after = await adminPool.query<{
      grant_status: string;
      identities: number;
      memberships: number;
      tenants: number;
    }>(
      `SELECT
        (SELECT status FROM onboarding_app.tenant_bootstrap_grants WHERE id = $1) AS grant_status,
        (SELECT count(*)::int FROM iam_app.identities) AS identities,
        (SELECT count(*)::int FROM iam_app.memberships) AS memberships,
        (SELECT count(*)::int FROM iam_app.tenants) AS tenants`,
      [invitationId],
    );
    expect(after.rows[0]).toEqual({
      grant_status: 'issued',
      identities: before.rows[0]?.identities,
      memberships: before.rows[0]?.memberships,
      tenants: before.rows[0]?.tenants,
    });
  });

  it('rejects terminal bootstrap grants and ordinary IAM invitations without creating tenant state (DIVE-ONB-REQ-009, DIVE-ONB-REQ-041, DIVE-ONB-REQ-050)', async () => {
    const expiredInvitationId = await issueDeliveredGrant('bootstrap-expired');
    await adminPool.query(
      `UPDATE onboarding_app.tenant_bootstrap_grants
       SET expires_at = now() - interval '1 second'
       WHERE id = $1`,
      [expiredInvitationId],
    );

    const revokedInvitationId = await issueDeliveredGrant('bootstrap-revoked');
    await adminPool.query(
      `UPDATE onboarding_app.tenant_bootstrap_grants
       SET status = 'revoked', revoked_at = now()
       WHERE id = $1`,
      [revokedInvitationId],
    );

    const supersededInvitationId = await issueDeliveredGrant(
      'bootstrap-superseded',
    );
    const platformPrincipal = await authenticateIdentity(
      provider,
      'platform-token',
    );
    const reissued = await reissueBootstrapInvitation(
      appPool,
      platformPrincipal,
      {
        invitationId: supersededInvitationId,
        reason: 'Replace for terminal-state test',
        idempotencyKey: 'bootstrap-superseded-reissue',
        correlationId,
      },
    );
    expect(reissued).not.toHaveProperty('deniedReason');

    const ordinaryTenantId = 'dddddddd-5555-4555-8555-555555555555';
    const ordinaryCenterId = 'dddddddd-6666-4666-8666-666666666666';
    const ordinaryMembershipId = 'dddddddd-7777-4777-8777-777777777777';
    const ordinaryInvitationId = 'dddddddd-8888-4888-8888-888888888888';
    await adminPool.query(
      `INSERT INTO iam_app.tenants(id, name) VALUES ($1, 'Ordinary tenant')`,
      [ordinaryTenantId],
    );
    await adminPool.query(
      `INSERT INTO iam_app.centers(id, tenant_id, name, time_zone)
       VALUES ($1, $2, 'Ordinary center', 'Europe/Madrid')`,
      [ordinaryCenterId, ordinaryTenantId],
    );
    await adminPool.query(
      `INSERT INTO iam_app.memberships(id, tenant_id, status, roles, center_ids)
       VALUES ($1, $2, 'pending', ARRAY['center_manager'], ARRAY[$3]::uuid[])`,
      [ordinaryMembershipId, ordinaryTenantId, ordinaryCenterId],
    );
    await adminPool.query(
      `INSERT INTO iam_app.invitations(
         id, tenant_id, membership_id, target_address, credential_hash,
         status, idempotency_key
       ) VALUES ($1, $2, $3, 'owner@example.test', repeat('a', 64), 'pending', 'ordinary-1')`,
      [ordinaryInvitationId, ordinaryTenantId, ordinaryMembershipId],
    );

    const before = await adminPool.query<{
      memberships: number;
      tenants: number;
    }>(
      `SELECT
        (SELECT count(*)::int FROM iam_app.memberships) AS memberships,
        (SELECT count(*)::int FROM iam_app.tenants) AS tenants`,
    );
    const invitedPrincipal = await authenticateIdentity(
      provider,
      'bootstrap-token',
    );
    await expect(
      completeOwnTenantBootstrap(appPool, invitedPrincipal, {
        operatorDisplayName: 'Terminal operation',
        centerDisplayName: 'Terminal center',
        timeZone: 'Europe/Madrid',
        locale: 'en',
        correlationId,
      }),
    ).resolves.toEqual({ deniedReason: 'bootstrap_unavailable' });

    const after = await adminPool.query<{
      memberships: number;
      tenants: number;
    }>(
      `SELECT
        (SELECT count(*)::int FROM iam_app.memberships) AS memberships,
        (SELECT count(*)::int FROM iam_app.tenants) AS tenants`,
    );
    expect(after.rows[0]).toEqual(before.rows[0]);
  });

  it('fails neutrally for zero or multiple matching grants without tenant side effects (DIVE-ONB-REQ-009, DIVE-ONB-REQ-041)', async () => {
    const before = await adminPool.query<{
      memberships: number;
      tenants: number;
    }>(
      `SELECT (SELECT count(*)::int FROM iam_app.tenants) AS tenants,
              (SELECT count(*)::int FROM iam_app.memberships) AS memberships`,
    );
    const invitedPrincipal = await authenticateIdentity(
      provider,
      'bootstrap-token',
    );
    const input = {
      operatorDisplayName: 'Ocean',
      centerDisplayName: 'North',
      timeZone: 'Europe/Madrid',
      locale: 'en' as const,
      correlationId,
    };
    await expect(
      completeOwnTenantBootstrap(appPool, invitedPrincipal, input),
    ).resolves.toEqual({ deniedReason: 'bootstrap_unavailable' });

    await issueDeliveredGrant('multiple-1');
    await issueDeliveredGrant('multiple-2');
    await expect(
      completeOwnTenantBootstrap(appPool, invitedPrincipal, input),
    ).resolves.toEqual({ deniedReason: 'bootstrap_unavailable' });

    const counts = await adminPool.query<{
      memberships: number;
      tenants: number;
    }>(
      `SELECT (SELECT count(*)::int FROM iam_app.tenants) AS tenants,
              (SELECT count(*)::int FROM iam_app.memberships) AS memberships`,
    );
    expect(counts.rows[0]).toEqual(before.rows[0]);
  });

  it('serializes concurrent tabs to one result (DIVE-ONB-REQ-018..019)', async () => {
    const before = await adminPool.query<{
      memberships: number;
      tenants: number;
    }>(
      `SELECT (SELECT count(*)::int FROM iam_app.tenants) AS tenants,
              (SELECT count(*)::int FROM iam_app.memberships) AS memberships`,
    );
    await issueDeliveredGrant('concurrent');
    const invitedPrincipal = await authenticateIdentity(
      provider,
      'bootstrap-token',
    );
    const input = {
      operatorDisplayName: 'Ocean',
      centerDisplayName: 'Concurrent North',
      timeZone: 'Europe/Madrid',
      locale: 'en' as const,
      correlationId,
    };
    const [first, second] = await Promise.all([
      completeOwnTenantBootstrap(appPool, invitedPrincipal, input),
      completeOwnTenantBootstrap(appPool, invitedPrincipal, input),
    ]);
    expect(first).toEqual(second);
    const counts = await adminPool.query<{
      memberships: number;
      tenants: number;
    }>(
      `SELECT (SELECT count(*)::int FROM iam_app.tenants) AS tenants,
              (SELECT count(*)::int FROM iam_app.memberships) AS memberships`,
    );
    expect(counts.rows[0]).toEqual({
      tenants: (before.rows[0]?.tenants ?? 0) + 1,
      memberships: (before.rows[0]?.memberships ?? 0) + 1,
    });
  });

  it('limits the eleventh redemption attempt per identity and session (DIVE-ONB-REQ-008)', async () => {
    const invitedPrincipal = await authenticateIdentity(
      provider,
      'bootstrap-token',
    );
    const input = {
      operatorDisplayName: 'Ocean',
      centerDisplayName: 'North',
      timeZone: 'Europe/Madrid',
      locale: 'en' as const,
      correlationId,
    };
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await expect(
        completeOwnTenantBootstrap(appPool, invitedPrincipal, input),
      ).resolves.toEqual({ deniedReason: 'bootstrap_unavailable' });
    }
    await expect(
      completeOwnTenantBootstrap(appPool, invitedPrincipal, input),
    ).resolves.toMatchObject({
      deniedReason: 'rate_limited',
      retryAfterSeconds: expect.any(Number),
    });
    const state = await adminPool.query<{ attempts: number }>(
      `SELECT cardinality(attempted_at) AS attempts
       FROM onboarding_app.bootstrap_redemption_rate_limits`,
    );
    expect(state.rows[0]?.attempts).toBe(10);
  });

  it('denies authenticated tenant identities without platform capabilities', async () => {
    const principal = await authenticateIdentity(provider, 'tenant-token');
    await expect(
      issueBootstrapInvitation(appPool, principal, {
        destinationEmail: 'owner@example.test',
        reason: 'Unauthorized attempt',
        idempotencyKey: 'denied-1',
        correlationId,
      }),
    ).resolves.toEqual({ deniedReason: 'permission_missing' });
  });

  it('limits every authenticated principal after ten operations per minute', async () => {
    const principal = await authenticateIdentity(provider, 'tenant-token');
    for (let operation = 1; operation <= 10; operation += 1) {
      await expect(
        consumeBootstrapInvitationRateLimit(appPool, principal),
      ).resolves.toBeNull();
    }
    await expect(
      consumeBootstrapInvitationRateLimit(appPool, principal),
    ).resolves.toBeGreaterThan(0);
  });

  it('supersedes before enqueueing revoke/create and supports audited revocation', async () => {
    const principal = await authenticateIdentity(provider, 'platform-token');
    const issued = await issueBootstrapInvitation(appPool, principal, {
      destinationEmail: 'owner@example.test',
      reason: 'Initial issue',
      idempotencyKey: 'issue-1',
      correlationId,
    });
    if ('deniedReason' in issued) throw new Error('Expected issued invitation');

    const reissued = await reissueBootstrapInvitation(appPool, principal, {
      invitationId: issued.invitationId,
      reason: 'Replace invitation',
      idempotencyKey: 'reissue-1',
      correlationId,
    });
    if ('deniedReason' in reissued) {
      throw new Error('Expected reissued invitation');
    }
    const states = await adminPool.query<{ id: string; status: string }>(
      `SELECT id, status FROM onboarding_app.tenant_bootstrap_grants ORDER BY issued_at, id`,
    );
    expect(states.rows).toEqual(
      expect.arrayContaining([
        { id: issued.invitationId, status: 'superseded' },
        { id: reissued.invitationId, status: 'issued' },
      ]),
    );
    const activeCommands = await adminPool.query<{
      command: string;
      grant_id: string;
    }>(
      `SELECT command, grant_id
       FROM onboarding_app.tenant_bootstrap_outbox_events
       WHERE delivery_state IN ('pending', 'retrying')
      ORDER BY created_at,
          CASE command WHEN 'revoke' THEN 0 ELSE 1 END,
          id`,
    );
    expect(activeCommands.rows).toEqual([
      { command: 'revoke', grant_id: issued.invitationId },
      { command: 'create', grant_id: reissued.invitationId },
    ]);

    const revoked = await revokeBootstrapInvitation(appPool, principal, {
      invitationId: reissued.invitationId,
      reason: 'Operator request',
      idempotencyKey: 'revoke-1',
      correlationId,
    });
    expect(revoked).toMatchObject({
      status: 'revoked',
      deliveryStatus: 'pending',
    });
    expect(
      await readBootstrapInvitation(appPool, principal, reissued.invitationId),
    ).toMatchObject({
      status: 'revoked',
      deliveryStatus: 'pending',
    });
  });

  it.each(['retrying', 'dead_letter'] as const)(
    'blocks replacement delivery while revocation is %s (DIVE-ONB-REQ-045)',
    async (deliveryState) => {
      const principal = await authenticateIdentity(provider, 'platform-token');
      const previousId = await issueDeliveredGrant('ordered-delivery');
      const replacement = await reissueBootstrapInvitation(appPool, principal, {
        invitationId: previousId,
        reason: 'Replace invitation',
        idempotencyKey: 'ordered-reissue',
        correlationId,
      });
      if ('deniedReason' in replacement)
        throw new Error('Expected replacement');
      const first = await workerPool.connect();
      const second = await workerPool.connect();
      try {
        await first.query('BEGIN');
        const revocation = await claimBootstrapOutboxEvent(first);
        expect(revocation).toMatchObject({
          command: 'revoke',
          grantId: previousId,
        });
        if (!revocation) throw new Error('Expected revocation');
        await second.query('BEGIN');
        await expect(claimBootstrapOutboxEvent(second)).resolves.toBeNull();
        await second.query('COMMIT');
        await failBootstrapOutboxEvent(first, {
          eventId: revocation.eventId,
          retryable: deliveryState === 'retrying',
          nextAttemptAt: deliveryState === 'retrying' ? 'infinity' : null,
          providerStatus: 'http_429',
        });
        await first.query('COMMIT');
        await second.query('BEGIN');
        await expect(claimBootstrapOutboxEvent(second)).resolves.toBeNull();
        await second.query('COMMIT');
        const independent = await issueBootstrapInvitation(appPool, principal, {
          destinationEmail: 'independent@example.test',
          idempotencyKey: 'independent-delivery',
          correlationId,
        });
        if ('deniedReason' in independent)
          throw new Error('Expected independent grant');
        await second.query('BEGIN');
        const independentClaim = await claimBootstrapOutboxEvent(second);
        expect(independentClaim).toMatchObject({
          command: 'create',
          grantId: independent.invitationId,
        });
        await second.query('ROLLBACK');
      } finally {
        await first.query('ROLLBACK');
        await second.query('ROLLBACK');
        first.release();
        second.release();
      }
    },
  );

  it('does not bypass an ancestor revocation through another reissue (DIVE-ONB-REQ-045)', async () => {
    const principal = await authenticateIdentity(provider, 'platform-token');
    const originalId = await issueDeliveredGrant('ancestor-delivery');
    const replacement = await reissueBootstrapInvitation(appPool, principal, {
      invitationId: originalId,
      reason: 'First replacement',
      idempotencyKey: 'ancestor-reissue-1',
      correlationId,
    });
    if ('deniedReason' in replacement) throw new Error('Expected replacement');
    const client = await workerPool.connect();
    try {
      await client.query('BEGIN');
      const originalRevocation = await claimBootstrapOutboxEvent(client);
      if (!originalRevocation) throw new Error('Expected original revocation');
      await failBootstrapOutboxEvent(client, {
        eventId: originalRevocation.eventId,
        retryable: true,
        nextAttemptAt: 'infinity',
        providerStatus: 'retry_after_out_of_range',
      });
      await client.query('COMMIT');
      await reissueBootstrapInvitation(appPool, principal, {
        invitationId: replacement.invitationId,
        reason: 'Second replacement',
        idempotencyKey: 'ancestor-reissue-2',
        correlationId,
      });
      await client.query('BEGIN');
      const replacementRevocation = await claimBootstrapOutboxEvent(client);
      expect(replacementRevocation).toMatchObject({
        command: 'revoke',
        grantId: replacement.invitationId,
      });
      if (!replacementRevocation)
        throw new Error('Expected replacement revocation');
      await completeBootstrapOutboxEvent(client, {
        eventId: replacementRevocation.eventId,
        providerInvitationRef: null,
        providerStatus: 'not_found',
      });
      await client.query('COMMIT');
      await client.query('BEGIN');
      await expect(claimBootstrapOutboxEvent(client)).resolves.toBeNull();
      await client.query('ROLLBACK');
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });

  it('delivers a replacement only after committed revocation (DIVE-ONB-REQ-045)', async () => {
    const principal = await authenticateIdentity(provider, 'platform-token');
    const previousId = await issueDeliveredGrant('successful-revocation');
    const replacement = await reissueBootstrapInvitation(appPool, principal, {
      invitationId: previousId,
      reason: 'Replace invitation',
      idempotencyKey: 'successful-reissue',
      correlationId,
    });
    if ('deniedReason' in replacement) throw new Error('Expected replacement');
    const client = await workerPool.connect();
    try {
      await client.query('BEGIN');
      const revocation = await claimBootstrapOutboxEvent(client);
      expect(revocation).toMatchObject({
        command: 'revoke',
        grantId: previousId,
      });
      if (!revocation) throw new Error('Expected revocation');
      await completeBootstrapOutboxEvent(client, {
        eventId: revocation.eventId,
        providerInvitationRef: 'clerk_successful-revocation',
        providerStatus: 'revoked',
      });
      await client.query('COMMIT');
      await client.query('BEGIN');
      await expect(claimBootstrapOutboxEvent(client)).resolves.toMatchObject({
        command: 'create',
        grantId: replacement.invitationId,
      });
      await client.query('ROLLBACK');
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });

  it('holds the claim lock across provider work and finalizes exactly one event', async () => {
    const principal = await authenticateIdentity(provider, 'platform-token');
    await issueBootstrapInvitation(appPool, principal, {
      destinationEmail: 'owner@example.test',
      reason: 'Worker delivery',
      idempotencyKey: 'issue-worker',
      correlationId,
    });
    const first = await workerPool.connect();
    const second = await workerPool.connect();
    try {
      await first.query('BEGIN');
      const claim = await claimBootstrapOutboxEvent(first);
      expect(claim).not.toBeNull();
      await second.query('BEGIN');
      await expect(claimBootstrapOutboxEvent(second)).resolves.toBeNull();
      if (!claim) throw new Error('Expected worker claim');
      await completeBootstrapOutboxEvent(first, {
        eventId: claim.eventId,
        providerInvitationRef: 'clerk_invitation_1',
        providerStatus: 'pending',
      });
      await first.query('COMMIT');
      await second.query('COMMIT');
    } finally {
      first.release();
      second.release();
    }
    expect(
      await adminPool
        .query(
          `SELECT delivery_state, attempt_count
         FROM onboarding_app.tenant_bootstrap_outbox_events`,
        )
        .then((result) => result.rows),
    ).toEqual([{ delivery_state: 'succeeded', attempt_count: 1 }]);
  });

  it('pauses unrepresentable Retry-After without replay and recovers an issued grant through audited reissue (DIVE-ONB-REQ-044..045)', async () => {
    const principal = await authenticateIdentity(provider, 'platform-token');
    const issued = await issueBootstrapInvitation(appPool, principal, {
      destinationEmail: 'owner@example.test',
      reason: 'Paused provider delivery',
      idempotencyKey: 'issue-paused-worker',
      correlationId,
    });
    if ('deniedReason' in issued) throw new Error('Expected issued invitation');
    const client = await workerPool.connect();
    try {
      await client.query('BEGIN');
      const claim = await claimBootstrapOutboxEvent(client);
      if (!claim) throw new Error('Expected worker claim');
      await expect(
        failBootstrapOutboxEvent(client, {
          eventId: claim.eventId,
          retryable: true,
          nextAttemptAt: 'infinity',
          providerStatus: 'retry_after_out_of_range',
        }),
      ).resolves.toBe('retrying');
      await client.query('COMMIT');
      await client.query('BEGIN');
      await expect(claimBootstrapOutboxEvent(client)).resolves.toBeNull();
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    const paused = await adminPool.query(
      `SELECT event.delivery_state, event.attempt_count,
              event.next_attempt_at::text AS next_attempt_at,
              bootstrap_grant.delivery_status, bootstrap_grant.provider_status,
              (SELECT count(*)::int
               FROM onboarding_app.bootstrap_invitation_audit_records
               WHERE action='tenant_bootstrap_invitation.delivery_failed') AS failure_count
       FROM onboarding_app.tenant_bootstrap_outbox_events event
       JOIN onboarding_app.tenant_bootstrap_grants bootstrap_grant
         ON bootstrap_grant.id = event.grant_id`,
    );
    expect(paused.rows).toEqual([
      {
        delivery_state: 'retrying',
        attempt_count: 1,
        next_attempt_at: 'infinity',
        delivery_status: 'retrying',
        provider_status: 'retry_after_out_of_range',
        failure_count: 0,
      },
    ]);

    const reissued = await reissueBootstrapInvitation(appPool, principal, {
      invitationId: issued.invitationId,
      reason: 'Reviewed unrepresentable provider delay',
      idempotencyKey: 'reissue-paused-worker',
      correlationId,
    });
    if ('deniedReason' in reissued)
      throw new Error('Expected reissued invitation');
    expect(reissued.invitationId).not.toBe(issued.invitationId);
    const recovered = await adminPool.query(
      `SELECT event.grant_id, event.command, event.delivery_state,
              bootstrap_grant.status,
              (SELECT count(*)::int
               FROM onboarding_app.bootstrap_invitation_audit_records
               WHERE action='tenant_bootstrap_invitation.reissued'
                 AND grant_id=$1) AS reissue_count
       FROM onboarding_app.tenant_bootstrap_outbox_events event
       JOIN onboarding_app.tenant_bootstrap_grants bootstrap_grant
         ON bootstrap_grant.id = event.grant_id
       ORDER BY event.command`,
      [reissued.invitationId],
    );
    expect(recovered.rows).toEqual([
      {
        grant_id: reissued.invitationId,
        command: 'create',
        delivery_state: 'pending',
        status: 'issued',
        reissue_count: 1,
      },
      {
        grant_id: issued.invitationId,
        command: 'revoke',
        delivery_state: 'pending',
        status: 'superseded',
        reissue_count: 1,
      },
    ]);
  });

  it('expires grants before claim and never delivers their pending create command (DIVE-ONB-REQ-043..044)', async () => {
    const principal = await authenticateIdentity(provider, 'platform-token');
    const issued = await issueBootstrapInvitation(appPool, principal, {
      destinationEmail: 'owner@example.test',
      reason: 'Expired delivery',
      idempotencyKey: 'expired-worker',
      correlationId,
    });
    if ('deniedReason' in issued) throw new Error('Expected issued invitation');
    await adminPool.query(
      `UPDATE onboarding_app.tenant_bootstrap_grants
       SET expires_at = '2000-01-01T00:00:00.000Z'
       WHERE id = $1`,
      [issued.invitationId],
    );

    const client = await workerPool.connect();
    try {
      await client.query('BEGIN');
      await expect(claimBootstrapOutboxEvent(client)).resolves.toBeNull();
      await client.query('COMMIT');
    } finally {
      client.release();
    }

    const state = await adminPool.query<{
      active_create_commands: number;
      status: string;
    }>(
      `SELECT bootstrap_grant.status,
        (SELECT count(*)::int
         FROM onboarding_app.tenant_bootstrap_outbox_events event
         WHERE event.grant_id = bootstrap_grant.id
           AND event.command = 'create'
           AND event.delivery_state IN ('pending', 'retrying')) AS active_create_commands
       FROM onboarding_app.tenant_bootstrap_grants bootstrap_grant
       WHERE bootstrap_grant.id = $1`,
      [issued.invitationId],
    );
    expect(state.rows[0]).toEqual({
      active_create_commands: 0,
      status: 'expired',
    });
  });

  it('dead-letters the eighth retryable failure without in-place replay', async () => {
    const principal = await authenticateIdentity(provider, 'platform-token');
    await issueBootstrapInvitation(appPool, principal, {
      destinationEmail: 'owner@example.test',
      reason: 'Worker exhaustion',
      idempotencyKey: 'issue-exhaustion',
      correlationId,
    });
    let state: 'dead_letter' | 'retrying' = 'retrying';
    for (let attempt = 1; attempt <= 8; attempt += 1) {
      const client = await workerPool.connect();
      try {
        await client.query('BEGIN');
        const claim = await claimBootstrapOutboxEvent(client);
        if (!claim) throw new Error(`Expected claim for attempt ${attempt}`);
        state = await failBootstrapOutboxEvent(client, {
          eventId: claim.eventId,
          retryable: true,
          nextAttemptAt: '2000-01-01T00:00:00.000Z',
          providerStatus: 'unavailable',
        });
        await client.query('COMMIT');
      } finally {
        client.release();
      }
    }
    expect(state).toBe('dead_letter');
    const result = await adminPool.query<{
      audit_count: number;
      attempt_count: number;
      delivery_state: string;
    }>(
      `SELECT event.delivery_state, event.attempt_count,
              (SELECT count(*)::int
               FROM onboarding_app.bootstrap_invitation_audit_records audit
               WHERE audit.action='tenant_bootstrap_invitation.delivery_failed') AS audit_count
       FROM onboarding_app.tenant_bootstrap_outbox_events event`,
    );
    expect(result.rows[0]).toEqual({
      audit_count: 1,
      attempt_count: 8,
      delivery_state: 'dead_letter',
    });
  });

  it('recovers a revoked dead-letter without mutating the original event or creating a grant', async () => {
    const principal = await authenticateIdentity(provider, 'platform-token');
    const grantId = await issueDeliveredGrant('revoke-recovery');
    await expect(
      revokeBootstrapInvitation(appPool, principal, {
        invitationId: grantId,
        reason: 'Cancel duplicate invitation',
        idempotencyKey: 'revoke-recovery-command',
        correlationId,
      }),
    ).resolves.toMatchObject({
      invitationId: grantId,
      status: 'revoked',
      deliveryStatus: 'pending',
    });

    for (let attempt = 1; attempt <= 8; attempt += 1) {
      const client = await workerPool.connect();
      try {
        await client.query('BEGIN');
        const event = await claimBootstrapOutboxEvent(client);
        if (!event)
          throw new Error(`Expected revoke claim for attempt ${attempt}`);
        await expect(
          failBootstrapOutboxEvent(client, {
            eventId: event.eventId,
            retryable: true,
            nextAttemptAt: '2000-01-01T00:00:00.000Z',
            providerStatus: 'unavailable',
          }),
        ).resolves.toBe(attempt === 8 ? 'dead_letter' : 'retrying');
        await client.query('COMMIT');
      } finally {
        client.release();
      }
    }

    const recovered = await retryBootstrapInvitationRevoke(appPool, principal, {
      invitationId: grantId,
      reason: '  Reviewed revoke delivery  ',
      idempotencyKey: 'revoke-recovery-retry',
      correlationId,
    });
    expect(recovered).toEqual({
      invitationId: grantId,
      destinationEmail: 'owner@example.test',
      status: 'revoked',
      deliveryStatus: 'pending',
    });

    const persisted = await adminPool.query<{
      grant_count: number;
      dead_letter_count: number;
      pending_revoke_count: number;
      retry_audit_count: number;
      retry_receipt_count: number;
    }>(
      `SELECT
        (SELECT count(*)::int FROM onboarding_app.tenant_bootstrap_grants) AS grant_count,
        (SELECT count(*)::int FROM onboarding_app.tenant_bootstrap_outbox_events
          WHERE grant_id = $1 AND command = 'revoke' AND delivery_state = 'dead_letter') AS dead_letter_count,
        (SELECT count(*)::int FROM onboarding_app.tenant_bootstrap_outbox_events
          WHERE grant_id = $1 AND command = 'revoke' AND delivery_state = 'pending') AS pending_revoke_count,
        (SELECT count(*)::int FROM onboarding_app.bootstrap_invitation_audit_records
          WHERE grant_id = $1 AND action = 'tenant_bootstrap_invitation.revocation_retried') AS retry_audit_count,
        (SELECT count(*)::int FROM onboarding_app.bootstrap_invitation_command_receipts
          WHERE command = 'revoke_retry') AS retry_receipt_count`,
      [grantId],
    );
    expect(persisted.rows[0]).toEqual({
      grant_count: 1,
      dead_letter_count: 1,
      pending_revoke_count: 1,
      retry_audit_count: 1,
      retry_receipt_count: 1,
    });

    await expect(
      retryBootstrapInvitationRevoke(appPool, principal, {
        invitationId: grantId,
        reason: '  Reviewed revoke delivery  ',
        idempotencyKey: 'revoke-recovery-retry',
        correlationId,
      }),
    ).resolves.toEqual(recovered);
    await expect(
      retryBootstrapInvitationRevoke(appPool, principal, {
        invitationId: grantId,
        reason: 'Different reason',
        idempotencyKey: 'revoke-recovery-retry',
        correlationId,
      }),
    ).resolves.toEqual({ deniedReason: 'idempotency_conflict' });
  });

  it('serializes concurrent revoke recovery attempts and permits only one new event', async () => {
    const principal = await authenticateIdentity(provider, 'platform-token');
    const grantId = await issueDeliveredGrant('revoke-recovery-concurrent');
    await revokeBootstrapInvitation(appPool, principal, {
      invitationId: grantId,
      reason: 'Cancel duplicate invitation',
      idempotencyKey: 'revoke-concurrent-command',
      correlationId,
    });
    for (let attempt = 1; attempt <= 8; attempt += 1) {
      const client = await workerPool.connect();
      try {
        await client.query('BEGIN');
        const event = await claimBootstrapOutboxEvent(client);
        if (!event) throw new Error('Expected revoke claim');
        await failBootstrapOutboxEvent(client, {
          eventId: event.eventId,
          retryable: true,
          nextAttemptAt: '2000-01-01T00:00:00.000Z',
          providerStatus: 'unavailable',
        });
        await client.query('COMMIT');
      } finally {
        client.release();
      }
    }

    const results = await Promise.all(
      ['concurrent-1', 'concurrent-2'].map((idempotencyKey) =>
        retryBootstrapInvitationRevoke(appPool, principal, {
          invitationId: grantId,
          reason: 'Concurrent recovery',
          idempotencyKey,
          correlationId,
        }),
      ),
    );
    expect(
      results.filter((result) => !('deniedReason' in result)),
    ).toHaveLength(1);
    expect(results).toEqual(
      expect.arrayContaining([
        { deniedReason: 'resource_missing_or_inaccessible' },
      ]),
    );
    const events = await adminPool.query<{ count: number }>(
      `SELECT count(*)::int AS count
       FROM onboarding_app.tenant_bootstrap_outbox_events
       WHERE grant_id = $1 AND command = 'revoke'`,
      [grantId],
    );
    expect(events.rows[0]?.count).toBe(2);
  });
});
