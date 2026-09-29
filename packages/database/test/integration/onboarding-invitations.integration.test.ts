import {
  authenticateIdentity,
  DeterministicIdentityProvider,
} from '@dive-center/identity';
import { Pool } from 'pg';
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
  revokeBootstrapInvitation,
  setBootstrapPlatformCapability,
} from '../../src/onboarding-commands.js';
import { createAdminPool } from './harness.js';

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
    await expect(
      workerPool.query('SELECT * FROM iam_app.memberships'),
    ).rejects.toThrow(/permission denied/);
  });

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

    expect(
      await revokeBootstrapInvitation(appPool, principal, {
        invitationId: reissued.invitationId,
        reason: 'Operator request',
        idempotencyKey: 'revoke-1',
        correlationId,
      }),
    ).toMatchObject({ status: 'revoked' });
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
});
