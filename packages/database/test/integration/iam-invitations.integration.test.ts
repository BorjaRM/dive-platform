import { createHash, randomUUID } from 'node:crypto';
import {
  type AuthenticatedPrincipal,
  authenticateIdentity,
  type IdentityProviderPrincipal,
} from '@dive-center/identity';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { bootstrapRoles } from '../../src/bootstrap-roles.js';
import { resolveIamAccess } from '../../src/iam-authorize.js';
import {
  type InvitationCommandResult,
  issueIamInvitation,
  respondToIamInvitation,
  revokeIamInvitation,
} from '../../src/iam-membership-commands.js';
import { migrateProduct } from '../../src/migrate.js';
import { createAdminPool, createAppPool } from './harness.js';

const tenantA = '11111111-1111-1111-1111-111111111111';
const tenantB = '22222222-2222-2222-2222-222222222222';
const centerA = 'aaaaaaaa-0001-0001-0001-000000000001';
const centerB = 'bbbbbbbb-0002-0002-0002-000000000001';
const ownerIdentity = 'a1111111-1111-1111-1111-111111111111';
const ownerMembership = 'aa111111-1111-1111-1111-111111111111';
const targetAddress = 'invitee@example.test';

const ownerPrincipal = {
  issuer: 'test',
  subject: 'owner-a',
  verifiedAddresses: ['owner-a@example.test'],
} as const;

const inviteePrincipal = {
  issuer: 'test',
  subject: 'invitee',
  verifiedAddresses: [targetAddress],
} as const;

async function trustedPrincipal(
  principal: Omit<IdentityProviderPrincipal, 'assurance' | 'sessionId'> & {
    assurance?: IdentityProviderPrincipal['assurance'];
    sessionId?: string;
  },
): Promise<AuthenticatedPrincipal> {
  return authenticateIdentity(
    {
      authenticate: async () => ({
        ...principal,
        sessionId: principal.sessionId ?? 'provider-session',
        assurance: principal.assurance ?? {
          level: 'single_factor',
          verifiedAt: null,
        },
      }),
    },
    'provider-session',
  );
}

function hashCredential(credential: string): string {
  return createHash('sha256').update(credential, 'utf8').digest('hex');
}

async function waitForLockWait(pool: Pool, processId: number): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const activity = await pool.query<{ wait_event_type: string | null }>(
      `SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1`,
      [processId],
    );
    if (activity.rows[0]?.wait_event_type === 'Lock') return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Backend ${processId} did not wait on a lock`);
}

describe('IAM invitation lifecycle (DIVE-IAM-REQ-005, DIVE-IAM-REQ-017, DIVE-IAM-REQ-024, DIVE-IAM-REQ-025)', () => {
  let adminPool: Pool;
  let appPool: Pool;
  let inviteeAssertion: AuthenticatedPrincipal;

  beforeAll(async () => {
    adminPool = createAdminPool();
    appPool = createAppPool();
    inviteeAssertion = await trustedPrincipal(inviteePrincipal);
    await bootstrapRoles(adminPool);
    await migrateProduct();
  });

  beforeEach(async () => {
    await adminPool.query(
      'TRUNCATE iam_app.invitations, iam_app.outbox_events, iam_app.audit_records, iam_app.memberships, iam_app.centers, iam_app.external_identities, iam_app.identities, iam_app.tenants CASCADE',
    );
    await adminPool.query(
      `INSERT INTO iam_app.tenants(id,name) VALUES ($1,'A'),($2,'B')`,
      [tenantA, tenantB],
    );
    await adminPool.query(
      `INSERT INTO iam_app.centers(id,tenant_id,name)
       VALUES ($1,$2,'A1'),($3,$4,'B1')`,
      [centerA, tenantA, centerB, tenantB],
    );
    await adminPool.query('INSERT INTO iam_app.identities(id) VALUES ($1)', [
      ownerIdentity,
    ]);
    await adminPool.query(
      `INSERT INTO iam_app.external_identities(identity_id,issuer,subject)
       VALUES ($1,'test','owner-a')`,
      [ownerIdentity],
    );
    await adminPool.query(
      `INSERT INTO iam_app.memberships(id,tenant_id,identity_id,status,roles,center_ids)
       VALUES ($1,$2,$3,'active',ARRAY['tenant_owner'],NULL)`,
      [ownerMembership, tenantA, ownerIdentity],
    );
  });

  afterAll(async () => {
    await appPool.end();
    await adminPool.end();
  });

  it('creates one immutable unbound pending membership with seven-day expiry and no pending access', async () => {
    const input = {
      tenantId: tenantA,
      targetAddress,
      roles: ['center_manager'],
      centerIds: [centerA],
      idempotencyKey: 'invite-001',
      correlationId: randomUUID(),
    } as const;
    const issued = await issueIamInvitation(appPool, ownerPrincipal, input);
    expect(issued).toMatchObject({
      created: true,
      deliveryStatus: 'queued',
      status: 'pending',
    });
    if ('deniedReason' in issued || !issued.credential) {
      throw new Error('Expected a newly issued invitation');
    }

    const persisted = await adminPool.query(
      `SELECT invitation.id,
              invitation.status,
              invitation.expires_at - invitation.issued_at AS lifetime,
              membership.identity_id,
              membership.status AS membership_status,
              membership.roles,
              membership.center_ids
       FROM iam_app.invitations AS invitation
       JOIN iam_app.memberships AS membership
         ON membership.tenant_id = invitation.tenant_id
        AND membership.id = invitation.membership_id
       WHERE invitation.tenant_id=$1 AND invitation.id=$2`,
      [tenantA, issued.invitationId],
    );
    expect(persisted.rows[0]).toMatchObject({
      identity_id: null,
      status: 'pending',
      membership_status: 'pending',
      roles: ['center_manager'],
      center_ids: [centerA],
    });
    expect(persisted.rows[0]?.lifetime.days).toBe(7);

    await expect(
      resolveIamAccess(appPool, inviteePrincipal, tenantA),
    ).rejects.toThrow('Access denied');
    await expect(
      adminPool.query(
        `UPDATE iam_app.memberships SET roles=ARRAY['tenant_admin']
         WHERE tenant_id=$1 AND id=$2`,
        [tenantA, issued.membershipId],
      ),
    ).rejects.toThrow('Pending membership proposal is immutable');
    await expect(
      adminPool.query(
        `UPDATE iam_app.memberships SET center_ids=ARRAY[]::uuid[]
         WHERE tenant_id=$1 AND id=$2`,
        [tenantA, issued.membershipId],
      ),
    ).rejects.toThrow('Pending membership proposal is immutable');

    const evidence = await adminPool.query(
      `SELECT audit.action, audit.result, outbox.payload
       FROM iam_app.audit_records AS audit
       JOIN iam_app.outbox_events AS outbox
         ON outbox.tenant_id=audit.tenant_id
        AND outbox.correlation_id=audit.correlation_id
       WHERE audit.tenant_id=$1 AND audit.resource_id=$2`,
      [tenantA, issued.invitationId],
    );
    expect(evidence.rows).toEqual([
      {
        action: 'membership.invite',
        result: 'success',
        payload: {
          invitationId: issued.invitationId,
          membershipId: issued.membershipId,
        },
      },
    ]);
    expect(JSON.stringify(evidence.rows)).not.toContain(targetAddress);
    expect(JSON.stringify(evidence.rows)).not.toContain(issued.credential);
  });

  it('returns the existing result for sequential and concurrent idempotent retries', async () => {
    const input = {
      tenantId: tenantA,
      targetAddress,
      roles: ['center_manager'],
      centerIds: [centerA],
      idempotencyKey: 'invite-idempotent',
      correlationId: randomUUID(),
    } as const;
    const [first, second] = await Promise.all([
      issueIamInvitation(appPool, ownerPrincipal, input),
      issueIamInvitation(appPool, ownerPrincipal, {
        ...input,
        correlationId: randomUUID(),
      }),
    ]);
    const createdResults = [first, second].filter(
      (result) => 'created' in result && result.created,
    );
    const retryResults = [first, second].filter(
      (result) => 'created' in result && !result.created,
    );
    expect(createdResults).toHaveLength(1);
    expect(retryResults).toHaveLength(1);
    expect(createdResults[0]).toMatchObject({
      credential: expect.any(String),
      deliveryStatus: 'queued',
    });
    expect(retryResults[0]).not.toHaveProperty('credential');
    expect(first).toMatchObject({
      invitationId: second.invitationId,
      membershipId: second.membershipId,
      status: 'pending',
    });

    const retry = await issueIamInvitation(appPool, ownerPrincipal, {
      ...input,
      correlationId: randomUUID(),
    });
    expect(retry).toMatchObject({
      invitationId: first.invitationId,
      membershipId: first.membershipId,
      status: 'pending',
      deliveryStatus: 'queued',
      created: false,
    });
    expect(retry).not.toHaveProperty('credential');
    const count = await adminPool.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM iam_app.invitations WHERE tenant_id=$1`,
      [tenantA],
    );
    expect(count.rows[0]?.count).toBe(1);

    await expect(
      issueIamInvitation(appPool, ownerPrincipal, {
        ...input,
        roles: ['tenant_admin'],
        correlationId: randomUUID(),
      }),
    ).resolves.toEqual({ deniedReason: 'invariant_violation' });
  });

  it('commits a non-disclosing denied audit before the center-scope trigger', async () => {
    const correlationId = randomUUID();
    await expect(
      issueIamInvitation(appPool, ownerPrincipal, {
        tenantId: tenantA,
        targetAddress,
        roles: ['center_manager'],
        centerIds: [centerB],
        idempotencyKey: 'invite-foreign-center',
        correlationId,
      }),
    ).resolves.toEqual({
      deniedReason: 'resource_missing_or_inaccessible',
    });

    const proof = await adminPool.query(
      `SELECT audit.result, audit.reason,
              (SELECT count(*)::int FROM iam_app.invitations WHERE tenant_id=$1) AS invitation_count,
              (SELECT count(*)::int FROM iam_app.memberships WHERE tenant_id=$1 AND status='pending') AS pending_count
       FROM iam_app.audit_records AS audit
       WHERE audit.tenant_id=$1 AND audit.correlation_id=$2`,
      [tenantA, correlationId],
    );
    expect(proof.rows).toEqual([
      {
        invitation_count: 0,
        pending_count: 0,
        reason: 'resource_missing_or_inaccessible',
        result: 'denied',
      },
    ]);
    expect(JSON.stringify(proof.rows)).not.toContain(centerB);
  });

  it('binds only the authenticated intended principal and denies wrong tenant, address, conflict, and replay without disclosure', async () => {
    const issued = await issueIamInvitation(appPool, ownerPrincipal, {
      tenantId: tenantA,
      targetAddress,
      roles: ['center_manager'],
      centerIds: [centerA],
      idempotencyKey: 'invite-accept',
      correlationId: randomUUID(),
    });
    if ('deniedReason' in issued || !issued.credential) {
      throw new Error('Expected a newly issued invitation');
    }

    const invalidCredentialResult = {
      deniedReason: 'credential_invalid_or_expired',
    };
    await expect(
      respondToIamInvitation(appPool, inviteeAssertion, {
        tenantId: tenantB,
        credential: issued.credential,
        decision: 'accepted',
        correlationId: randomUUID(),
      }),
    ).resolves.toEqual(invalidCredentialResult);
    await expect(
      respondToIamInvitation(
        appPool,
        await trustedPrincipal({
          ...inviteePrincipal,
          verifiedAddresses: [],
        }),
        {
          tenantId: tenantA,
          credential: issued.credential,
          decision: 'accepted',
          correlationId: randomUUID(),
        },
      ),
    ).resolves.toEqual(invalidCredentialResult);
    await expect(
      respondToIamInvitation(
        appPool,
        await trustedPrincipal({
          ...inviteePrincipal,
          verifiedAddresses: ['wrong@example.test'],
        }),
        {
          tenantId: tenantA,
          credential: issued.credential,
          decision: 'accepted',
          correlationId: randomUUID(),
        },
      ),
    ).resolves.toEqual(invalidCredentialResult);

    await expect(
      respondToIamInvitation(appPool, inviteeAssertion, {
        tenantId: tenantA,
        credential: issued.credential,
        decision: 'accepted',
        correlationId: randomUUID(),
      }),
    ).resolves.toMatchObject({
      invitationId: issued.invitationId,
      membershipId: issued.membershipId,
      status: 'accepted',
    });
    await expect(
      resolveIamAccess(appPool, inviteePrincipal, tenantA),
    ).resolves.toMatchObject({
      membershipId: issued.membershipId,
      roles: ['center_manager'],
      centerIds: [centerA],
    });
    const replayCorrelationId = randomUUID();
    await expect(
      respondToIamInvitation(appPool, inviteeAssertion, {
        tenantId: tenantA,
        credential: issued.credential,
        decision: 'accepted',
        correlationId: replayCorrelationId,
      }),
    ).resolves.toEqual({ deniedReason: 'duplicate_or_replayed' });
    const replayAudit = await adminPool.query(
      `SELECT action, result, reason
       FROM iam_app.audit_records
       WHERE tenant_id=$1 AND correlation_id=$2`,
      [tenantA, replayCorrelationId],
    );
    expect(replayAudit.rows).toEqual([
      {
        action: 'membership.invite',
        result: 'denied',
        reason: 'duplicate_or_replayed',
      },
    ]);
    await expect(
      adminPool.query(
        `UPDATE iam_app.invitations SET status='revoked'
         WHERE tenant_id=$1 AND id=$2`,
        [tenantA, issued.invitationId],
      ),
    ).rejects.toThrow('Invalid invitation transition');
  });

  it('serializes concurrent acceptance so only one request binds the principal', async () => {
    const concurrentAddress = 'concurrent-accept@example.test';
    const issued = await issueIamInvitation(appPool, ownerPrincipal, {
      tenantId: tenantA,
      targetAddress: concurrentAddress,
      roles: ['center_manager'],
      centerIds: [centerA],
      idempotencyKey: 'invite-concurrent-accept',
      correlationId: randomUUID(),
    });
    if ('deniedReason' in issued || !issued.credential) {
      throw new Error('Expected a newly issued invitation');
    }
    const principal = await trustedPrincipal({
      issuer: 'test',
      subject: 'concurrent-accept',
      verifiedAddresses: [concurrentAddress],
    });

    const results = await Promise.all(
      [randomUUID(), randomUUID()].map((correlationId) =>
        respondToIamInvitation(appPool, principal, {
          tenantId: tenantA,
          credential: issued.credential as string,
          decision: 'accepted',
          correlationId,
        }),
      ),
    );
    expect(
      results
        .map((result) =>
          'deniedReason' in result ? result.deniedReason : result.status,
        )
        .sort(),
    ).toEqual(['accepted', 'duplicate_or_replayed']);

    const proof = await adminPool.query(
      `SELECT invitation.status, membership.status AS membership_status,
              (SELECT count(*)::int FROM iam_app.audit_records AS audit
               WHERE audit.tenant_id=invitation.tenant_id
                 AND audit.resource_id=invitation.id) AS audit_count,
              (SELECT count(*)::int FROM iam_app.outbox_events AS outbox
               WHERE outbox.tenant_id=invitation.tenant_id
                 AND outbox.idempotency_key='invitation.accepted:' || invitation.id::text) AS outbox_count
       FROM iam_app.invitations AS invitation
       JOIN iam_app.memberships AS membership
         ON membership.tenant_id=invitation.tenant_id
        AND membership.id=invitation.membership_id
       WHERE invitation.tenant_id=$1 AND invitation.id=$2`,
      [tenantA, issued.invitationId],
    );
    expect(proof.rows[0]).toMatchObject({
      audit_count: 3,
      membership_status: 'active',
      outbox_count: 1,
      status: 'accepted',
    });
  });

  it.each(['acceptance', 'reissue'] as const)(
    'serializes acceptance racing deliberate reissue when %s reaches the invitation lock first',
    async (firstOperation) => {
      const suffix =
        firstOperation === 'acceptance' ? 'accept-first' : 'reissue-first';
      const raceAddress = `${suffix}@example.test`;
      const original = await issueIamInvitation(appPool, ownerPrincipal, {
        tenantId: tenantA,
        targetAddress: raceAddress,
        roles: ['center_manager'],
        centerIds: [centerA],
        idempotencyKey: `invite-race-original-${suffix}`,
        correlationId: randomUUID(),
      });
      if ('deniedReason' in original || !original.credential) {
        throw new Error('Expected a newly issued invitation');
      }

      const acceptanceCorrelationId = randomUUID();
      const reissueCorrelationId = randomUUID();
      const replacementInvitationId = randomUUID();
      const replacementMembershipId = randomUUID();
      const replacementCredential = `${suffix}-replacement-credential`;
      const acceptanceClient = await appPool.connect();
      const reissueClient = await appPool.connect();
      const blockerClient = await adminPool.connect();
      let acceptanceInTransaction = false;
      let reissueInTransaction = false;
      let blockerInTransaction = false;

      try {
        await acceptanceClient.query('BEGIN');
        acceptanceInTransaction = true;
        await reissueClient.query('BEGIN');
        reissueInTransaction = true;
        await blockerClient.query('BEGIN');
        blockerInTransaction = true;
        await blockerClient.query(
          `SELECT id FROM iam_app.invitations
           WHERE tenant_id=$1 AND id=$2 FOR UPDATE`,
          [tenantA, original.invitationId],
        );

        const acceptanceProcess = await acceptanceClient.query<{ pid: number }>(
          `SELECT pg_backend_pid()::int AS pid`,
        );
        const reissueProcess = await reissueClient.query<{ pid: number }>(
          `SELECT pg_backend_pid()::int AS pid`,
        );
        const runAcceptance = () =>
          acceptanceClient.query<{ outcome: InvitationCommandResult }>(
            `SELECT iam_app.respond_invitation_command(
              $1, $2, $3::text[], $4::uuid, $5, 'accepted', $6::uuid, $7::uuid
            ) AS outcome`,
            [
              'test',
              suffix,
              [raceAddress],
              tenantA,
              hashCredential(original.credential as string),
              randomUUID(),
              acceptanceCorrelationId,
            ],
          );
        const runReissue = () =>
          reissueClient.query<{ outcome: InvitationCommandResult }>(
            `SELECT iam_app.issue_invitation_command(
              $1, $2, $3::uuid, $4::uuid, $5::uuid, $6, $7::text[], $8::uuid[],
              $9, $10, $11::uuid, $12::uuid
            ) AS outcome`,
            [
              ownerPrincipal.issuer,
              ownerPrincipal.subject,
              tenantA,
              replacementInvitationId,
              replacementMembershipId,
              raceAddress,
              ['center_manager'],
              [centerA],
              hashCredential(replacementCredential),
              `invite-race-reissue-${suffix}`,
              original.invitationId,
              reissueCorrelationId,
            ],
          );

        let acceptancePromise: ReturnType<typeof runAcceptance>;
        let reissuePromise: ReturnType<typeof runReissue>;
        if (firstOperation === 'acceptance') {
          acceptancePromise = runAcceptance();
          await waitForLockWait(
            adminPool,
            acceptanceProcess.rows[0]?.pid as number,
          );
          reissuePromise = runReissue();
          await waitForLockWait(
            adminPool,
            reissueProcess.rows[0]?.pid as number,
          );
        } else {
          reissuePromise = runReissue();
          await waitForLockWait(
            adminPool,
            reissueProcess.rows[0]?.pid as number,
          );
          acceptancePromise = runAcceptance();
          await waitForLockWait(
            adminPool,
            acceptanceProcess.rows[0]?.pid as number,
          );
        }

        await blockerClient.query('COMMIT');
        blockerInTransaction = false;
        if (firstOperation === 'acceptance') {
          await acceptancePromise;
          await acceptanceClient.query('COMMIT');
          acceptanceInTransaction = false;
          await reissuePromise;
          await reissueClient.query('COMMIT');
          reissueInTransaction = false;
        } else {
          await reissuePromise;
          await reissueClient.query('COMMIT');
          reissueInTransaction = false;
          await acceptancePromise;
          await acceptanceClient.query('COMMIT');
          acceptanceInTransaction = false;
        }

        const acceptanceOutcome = (await acceptancePromise).rows[0]?.outcome;
        const reissueOutcome = (await reissuePromise).rows[0]?.outcome;
        if (firstOperation === 'acceptance') {
          expect(acceptanceOutcome).toMatchObject({
            invitationId: original.invitationId,
            membershipId: original.membershipId,
            status: 'accepted',
          });
          expect(reissueOutcome).toEqual({
            deniedReason: 'resource_missing_or_inaccessible',
          });
        } else {
          expect(reissueOutcome).toMatchObject({
            created: true,
            invitationId: replacementInvitationId,
            membershipId: replacementMembershipId,
            status: 'pending',
          });
          expect(acceptanceOutcome).toEqual({
            deniedReason: 'duplicate_or_replayed',
          });
        }
      } finally {
        if (blockerInTransaction) await blockerClient.query('ROLLBACK');
        if (acceptanceInTransaction) await acceptanceClient.query('ROLLBACK');
        if (reissueInTransaction) await reissueClient.query('ROLLBACK');
        blockerClient.release();
        acceptanceClient.release();
        reissueClient.release();
      }

      const state = await adminPool.query(
        `SELECT invitation.id, invitation.status,
                membership.id AS membership_id,
                membership.identity_id,
                membership.status AS membership_status,
                membership.roles, membership.center_ids
         FROM iam_app.invitations AS invitation
         JOIN iam_app.memberships AS membership
           ON membership.tenant_id=invitation.tenant_id
          AND membership.id=invitation.membership_id
         WHERE invitation.tenant_id=$1
           AND invitation.id = ANY($2::uuid[])
         ORDER BY invitation.id`,
        [tenantA, [original.invitationId, replacementInvitationId]],
      );
      const audit = await adminPool.query(
        `SELECT correlation_id, resource_id, result, reason
         FROM iam_app.audit_records
         WHERE tenant_id=$1 AND correlation_id = ANY($2::uuid[])
         ORDER BY correlation_id`,
        [tenantA, [acceptanceCorrelationId, reissueCorrelationId]],
      );
      const outbox = await adminPool.query(
        `SELECT correlation_id, event_type, payload
         FROM iam_app.outbox_events
         WHERE tenant_id=$1 AND correlation_id = ANY($2::uuid[])
         ORDER BY event_type`,
        [tenantA, [acceptanceCorrelationId, reissueCorrelationId]],
      );

      expect(audit.rows).toHaveLength(2);
      expect(
        audit.rows.filter((record) => record.result === 'success'),
      ).toHaveLength(1);
      expect(
        audit.rows.filter((record) => record.result === 'denied'),
      ).toHaveLength(1);
      if (firstOperation === 'acceptance') {
        expect(audit.rows).toEqual(
          expect.arrayContaining([
            {
              correlation_id: acceptanceCorrelationId,
              resource_id: original.invitationId,
              result: 'success',
              reason: null,
            },
            {
              correlation_id: reissueCorrelationId,
              resource_id: replacementInvitationId,
              result: 'denied',
              reason: 'resource_missing_or_inaccessible',
            },
          ]),
        );
        expect(state.rows).toEqual([
          expect.objectContaining({
            id: original.invitationId,
            identity_id: expect.any(String),
            membership_id: original.membershipId,
            membership_status: 'active',
            roles: ['center_manager'],
            center_ids: [centerA],
            status: 'accepted',
          }),
        ]);
        expect(outbox.rows).toEqual([
          {
            correlation_id: acceptanceCorrelationId,
            event_type: 'iam.invitation.accepted.v1',
            payload: {
              invitationId: original.invitationId,
              membershipId: original.membershipId,
            },
          },
        ]);
      } else {
        expect(audit.rows).toEqual(
          expect.arrayContaining([
            {
              correlation_id: acceptanceCorrelationId,
              resource_id: original.invitationId,
              result: 'denied',
              reason: 'duplicate_or_replayed',
            },
            {
              correlation_id: reissueCorrelationId,
              resource_id: replacementInvitationId,
              result: 'success',
              reason: null,
            },
          ]),
        );
        expect(state.rows).toEqual(
          expect.arrayContaining([
            {
              id: original.invitationId,
              identity_id: null,
              membership_id: original.membershipId,
              membership_status: 'disabled',
              roles: ['center_manager'],
              center_ids: [centerA],
              status: 'revoked',
            },
            {
              id: replacementInvitationId,
              identity_id: null,
              membership_id: replacementMembershipId,
              membership_status: 'pending',
              roles: ['center_manager'],
              center_ids: [centerA],
              status: 'pending',
            },
          ]),
        );
        expect(outbox.rows).toEqual([
          {
            correlation_id: reissueCorrelationId,
            event_type: 'iam.invitation.issued.v1',
            payload: {
              invitationId: replacementInvitationId,
              membershipId: replacementMembershipId,
            },
          },
          {
            correlation_id: reissueCorrelationId,
            event_type: 'iam.invitation.revoked.v1',
            payload: {
              invitationId: original.invitationId,
              membershipId: original.membershipId,
            },
          },
        ]);
        await expect(
          resolveIamAccess(
            appPool,
            {
              issuer: 'test',
              subject: suffix,
              verifiedAddresses: [raceAddress],
            },
            tenantA,
          ),
        ).rejects.toThrow('Access denied');
      }
    },
  );

  it('serializes concurrent deliberate reissue and creates one replacement', async () => {
    const original = await issueIamInvitation(appPool, ownerPrincipal, {
      tenantId: tenantA,
      targetAddress: 'concurrent-reissue@example.test',
      roles: ['center_manager'],
      centerIds: [centerA],
      idempotencyKey: 'invite-concurrent-reissue-original',
      correlationId: randomUUID(),
    });
    if ('deniedReason' in original || !original.credential) {
      throw new Error('Expected a newly issued invitation');
    }
    const correlationIds = [randomUUID(), randomUUID()];
    const results = await Promise.all(
      correlationIds.map((correlationId, index) =>
        issueIamInvitation(appPool, ownerPrincipal, {
          tenantId: tenantA,
          targetAddress: 'concurrent-reissue@example.test',
          roles: ['center_manager'],
          centerIds: [centerA],
          idempotencyKey: `invite-concurrent-reissue-${index}`,
          reissueInvitationId: original.invitationId,
          correlationId,
        }),
      ),
    );
    const replacements = results.filter(
      (result) => 'created' in result && result.created,
    );
    expect(replacements).toHaveLength(1);
    expect(replacements[0]).toMatchObject({
      credential: expect.any(String),
      deliveryStatus: 'queued',
      status: 'pending',
    });
    expect(results).toContainEqual({
      deniedReason: 'resource_missing_or_inaccessible',
    });

    const state = await adminPool.query(
      `SELECT invitation.status, membership.status AS membership_status
       FROM iam_app.invitations AS invitation
       JOIN iam_app.memberships AS membership
         ON membership.tenant_id=invitation.tenant_id
        AND membership.id=invitation.membership_id
       WHERE invitation.tenant_id=$1
       ORDER BY invitation.status`,
      [tenantA],
    );
    expect(state.rows).toEqual([
      { membership_status: 'pending', status: 'pending' },
      { membership_status: 'disabled', status: 'revoked' },
    ]);
  });

  it('rejects untrusted and malformed principal assertions before binding', async () => {
    const issued = await issueIamInvitation(appPool, ownerPrincipal, {
      tenantId: tenantA,
      targetAddress,
      roles: ['center_manager'],
      centerIds: [centerA],
      idempotencyKey: 'invite-untrusted-principal',
      correlationId: randomUUID(),
    });
    if ('deniedReason' in issued || !issued.credential) {
      throw new Error('Expected a newly issued invitation');
    }

    await expect(
      respondToIamInvitation(
        appPool,
        inviteePrincipal as AuthenticatedPrincipal,
        {
          tenantId: tenantA,
          credential: issued.credential,
          decision: 'accepted',
          correlationId: randomUUID(),
        },
      ),
    ).rejects.toThrow('Untrusted identity assertion');

    const malformed = await appPool.query<{ outcome: unknown }>(
      `SELECT iam_app.respond_invitation_command(
        '', 'forged', ARRAY[$1]::text[], $2::uuid, $3, 'accepted', $4::uuid, $5::uuid
      ) AS outcome`,
      [
        targetAddress,
        tenantA,
        hashCredential(issued.credential),
        randomUUID(),
        randomUUID(),
      ],
    );
    expect(malformed.rows[0]?.outcome).toEqual({
      deniedReason: 'authentication_missing_or_invalid',
    });
    await expect(
      adminPool.query(
        `INSERT INTO iam_app.external_identities(identity_id,issuer,subject)
         VALUES ($1,'forged','   ')`,
        [ownerIdentity],
      ),
    ).rejects.toThrow('external_identities_subject_normalized');

    const state = await adminPool.query(
      `SELECT invitation.status, membership.identity_id, membership.status AS membership_status
       FROM iam_app.invitations AS invitation
       JOIN iam_app.memberships AS membership
         ON membership.tenant_id=invitation.tenant_id
        AND membership.id=invitation.membership_id
       WHERE invitation.tenant_id=$1 AND invitation.id=$2`,
      [tenantA, issued.invitationId],
    );
    expect(state.rows[0]).toEqual({
      identity_id: null,
      membership_status: 'pending',
      status: 'pending',
    });
  });

  it('returns and audits a non-disclosing conflict for an existing tenant membership', async () => {
    const existingIdentity = 'cccccccc-1111-1111-1111-111111111111';
    const existingMembership = 'cccccccc-2222-2222-2222-222222222222';
    const existingPrincipal = {
      issuer: 'test',
      subject: 'existing-invitee',
      verifiedAddresses: [targetAddress],
    } as const;
    await adminPool.query(`INSERT INTO iam_app.identities(id) VALUES ($1)`, [
      existingIdentity,
    ]);
    await adminPool.query(
      `INSERT INTO iam_app.external_identities(identity_id,issuer,subject)
       VALUES ($1,$2,$3)`,
      [existingIdentity, existingPrincipal.issuer, existingPrincipal.subject],
    );
    await adminPool.query(
      `INSERT INTO iam_app.memberships(id,tenant_id,identity_id,status,roles,center_ids)
       VALUES ($1,$2,$3,'active',ARRAY['center_manager'],ARRAY[$4::uuid])`,
      [existingMembership, tenantA, existingIdentity, centerA],
    );
    const issued = await issueIamInvitation(appPool, ownerPrincipal, {
      tenantId: tenantA,
      targetAddress,
      roles: ['center_manager'],
      centerIds: [centerA],
      idempotencyKey: 'invite-existing-membership',
      correlationId: randomUUID(),
    });
    if ('deniedReason' in issued || !issued.credential) {
      throw new Error('Expected a newly issued invitation');
    }

    const conflictCorrelationId = randomUUID();
    await expect(
      respondToIamInvitation(
        appPool,
        await trustedPrincipal(existingPrincipal),
        {
          tenantId: tenantA,
          credential: issued.credential,
          decision: 'accepted',
          correlationId: conflictCorrelationId,
        },
      ),
    ).resolves.toEqual({ deniedReason: 'invariant_violation' });

    const conflictState = await adminPool.query(
      `SELECT invitation.status, membership.identity_id, membership.status AS membership_status
       FROM iam_app.invitations AS invitation
       JOIN iam_app.memberships AS membership
         ON membership.tenant_id=invitation.tenant_id
        AND membership.id=invitation.membership_id
       WHERE invitation.tenant_id=$1 AND invitation.id=$2`,
      [tenantA, issued.invitationId],
    );
    expect(conflictState.rows[0]).toEqual({
      identity_id: null,
      membership_status: 'pending',
      status: 'pending',
    });
    const conflictEvidence = await adminPool.query(
      `SELECT audit.result, audit.reason,
              (SELECT count(*)::int FROM iam_app.outbox_events
               WHERE tenant_id=$1 AND correlation_id=$2) AS outbox_count
       FROM iam_app.audit_records AS audit
       WHERE audit.tenant_id=$1 AND audit.correlation_id=$2`,
      [tenantA, conflictCorrelationId],
    );
    expect(conflictEvidence.rows).toEqual([
      {
        outbox_count: 0,
        reason: 'invariant_violation',
        result: 'denied',
      },
    ]);
  });

  it('supports reject, revoke, reissue, and expiry as terminal transitions', async () => {
    const rejectedCorrelationId = randomUUID();
    const rejected = await issueIamInvitation(appPool, ownerPrincipal, {
      tenantId: tenantA,
      targetAddress: 'reject@example.test',
      roles: ['center_manager'],
      centerIds: [centerA],
      idempotencyKey: 'invite-reject',
      correlationId: randomUUID(),
    });
    if ('deniedReason' in rejected || !rejected.credential) {
      throw new Error('Expected a rejectable invitation');
    }
    await expect(
      respondToIamInvitation(
        appPool,
        await trustedPrincipal({
          issuer: 'test',
          subject: 'rejectee',
          verifiedAddresses: ['reject@example.test'],
        }),
        {
          tenantId: tenantA,
          credential: rejected.credential,
          decision: 'rejected',
          correlationId: rejectedCorrelationId,
        },
      ),
    ).resolves.toMatchObject({ status: 'rejected' });
    const rejectedReplayCorrelationId = randomUUID();
    await expect(
      respondToIamInvitation(
        appPool,
        await trustedPrincipal({
          issuer: 'test',
          subject: 'rejectee',
          verifiedAddresses: ['reject@example.test'],
        }),
        {
          tenantId: tenantA,
          credential: rejected.credential,
          decision: 'accepted',
          correlationId: rejectedReplayCorrelationId,
        },
      ),
    ).resolves.toEqual({ deniedReason: 'duplicate_or_replayed' });

    const original = await issueIamInvitation(appPool, ownerPrincipal, {
      tenantId: tenantA,
      targetAddress: 'reissue@example.test',
      roles: ['center_manager'],
      centerIds: [centerA],
      idempotencyKey: 'invite-original',
      correlationId: randomUUID(),
    });
    if ('deniedReason' in original || !original.credential) {
      throw new Error('Expected invitation');
    }
    const reissueCorrelationId = randomUUID();
    const reissued = await issueIamInvitation(appPool, ownerPrincipal, {
      tenantId: tenantA,
      targetAddress: 'reissue@example.test',
      roles: ['center_manager'],
      centerIds: [centerA],
      idempotencyKey: 'invite-reissued',
      reissueInvitationId: original.invitationId,
      correlationId: reissueCorrelationId,
    });
    expect(reissued).toMatchObject({
      created: true,
      deliveryStatus: 'queued',
      status: 'pending',
    });
    if ('deniedReason' in reissued || !reissued.credential) {
      throw new Error('Expected invitation');
    }
    expect(reissued.credential).not.toBe(original.credential);
    const reissueRetry = await issueIamInvitation(appPool, ownerPrincipal, {
      tenantId: tenantA,
      targetAddress: 'reissue@example.test',
      roles: ['center_manager'],
      centerIds: [centerA],
      idempotencyKey: 'invite-reissued',
      reissueInvitationId: original.invitationId,
      correlationId: randomUUID(),
    });
    expect(reissueRetry).toMatchObject({
      created: false,
      deliveryStatus: 'queued',
      invitationId: reissued.invitationId,
      membershipId: reissued.membershipId,
      status: 'pending',
    });
    expect(reissueRetry).not.toHaveProperty('credential');
    const reissueState = await adminPool.query(
      `SELECT invitation.id, invitation.status, membership.status AS membership_status
       FROM iam_app.invitations AS invitation
       JOIN iam_app.memberships AS membership
         ON membership.tenant_id=invitation.tenant_id
        AND membership.id=invitation.membership_id
       WHERE invitation.tenant_id=$1 ORDER BY invitation.issued_at, invitation.id`,
      [tenantA],
    );
    expect(reissueState.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: original.invitationId,
          status: 'revoked',
          membership_status: 'disabled',
        }),
        expect.objectContaining({
          id: reissued.invitationId,
          status: 'pending',
          membership_status: 'pending',
        }),
      ]),
    );

    const revokeCorrelationId = randomUUID();
    await expect(
      revokeIamInvitation(appPool, ownerPrincipal, {
        tenantId: tenantA,
        invitationId: reissued.invitationId,
        correlationId: revokeCorrelationId,
      }),
    ).resolves.toMatchObject({ status: 'revoked' });
    await expect(
      revokeIamInvitation(appPool, ownerPrincipal, {
        tenantId: tenantA,
        invitationId: reissued.invitationId,
        correlationId: randomUUID(),
      }),
    ).resolves.toEqual({ deniedReason: 'duplicate_or_replayed' });

    const expiredCredential = 'expired-credential';
    const expiredMembership = 'eeeeeeee-1111-1111-1111-111111111111';
    const expiredInvitation = 'eeeeeeee-2222-2222-2222-222222222222';
    await adminPool.query(
      `INSERT INTO iam_app.memberships(id,tenant_id,status,roles,center_ids)
       VALUES ($1,$2,'pending',ARRAY['center_manager'],ARRAY[$3::uuid])`,
      [expiredMembership, tenantA, centerA],
    );
    await adminPool.query(
      `INSERT INTO iam_app.invitations(
         id,tenant_id,membership_id,target_address,credential_hash,status,
         idempotency_key,issued_at,expires_at
       ) VALUES ($1,$2,$3,$4,$5,'pending','invite-expired',now()-interval '8 days',now()-interval '1 day')`,
      [
        expiredInvitation,
        tenantA,
        expiredMembership,
        targetAddress,
        hashCredential(expiredCredential),
      ],
    );
    const expiryCorrelationId = randomUUID();
    await expect(
      respondToIamInvitation(appPool, inviteeAssertion, {
        tenantId: tenantA,
        credential: expiredCredential,
        decision: 'accepted',
        correlationId: expiryCorrelationId,
      }),
    ).resolves.toEqual({ deniedReason: 'credential_invalid_or_expired' });
    const expiredState = await adminPool.query(
      `SELECT invitation.status, membership.status AS membership_status
       FROM iam_app.invitations AS invitation
       JOIN iam_app.memberships AS membership
         ON membership.tenant_id=invitation.tenant_id
        AND membership.id=invitation.membership_id
       WHERE invitation.tenant_id=$1 AND invitation.id=$2`,
      [tenantA, expiredInvitation],
    );
    expect(expiredState.rows[0]).toEqual({
      status: 'expired',
      membership_status: 'disabled',
    });
    for (const invitationId of [
      rejected.invitationId,
      original.invitationId,
      reissued.invitationId,
      expiredInvitation,
    ]) {
      await expect(
        adminPool.query(
          `UPDATE iam_app.invitations SET status='accepted'
           WHERE tenant_id=$1 AND id=$2`,
          [tenantA, invitationId],
        ),
      ).rejects.toThrow('Invalid invitation transition');
    }

    const terminalAudit = await adminPool.query(
      `SELECT correlation_id, action, result, reason
       FROM iam_app.audit_records
       WHERE tenant_id=$1 AND correlation_id=ANY($2::uuid[])`,
      [
        tenantA,
        [
          rejectedCorrelationId,
          rejectedReplayCorrelationId,
          reissueCorrelationId,
          revokeCorrelationId,
          expiryCorrelationId,
        ],
      ],
    );
    expect(terminalAudit.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          correlation_id: rejectedCorrelationId,
          action: 'membership.disable',
          result: 'success',
          reason: null,
        }),
        expect.objectContaining({
          correlation_id: rejectedReplayCorrelationId,
          action: 'membership.invite',
          result: 'denied',
          reason: 'duplicate_or_replayed',
        }),
        expect.objectContaining({
          correlation_id: reissueCorrelationId,
          action: 'membership.invite',
          result: 'success',
          reason: null,
        }),
        expect.objectContaining({
          correlation_id: revokeCorrelationId,
          action: 'membership.disable',
          result: 'success',
          reason: null,
        }),
        expect.objectContaining({
          correlation_id: expiryCorrelationId,
          action: 'membership.invite',
          result: 'denied',
          reason: 'credential_invalid_or_expired',
        }),
      ]),
    );
    const terminalOutbox = await adminPool.query(
      `SELECT correlation_id, event_type
       FROM iam_app.outbox_events
       WHERE tenant_id=$1 AND correlation_id=ANY($2::uuid[])`,
      [
        tenantA,
        [
          rejectedCorrelationId,
          reissueCorrelationId,
          revokeCorrelationId,
          expiryCorrelationId,
        ],
      ],
    );
    expect(terminalOutbox.rows).toEqual(
      expect.arrayContaining([
        {
          correlation_id: rejectedCorrelationId,
          event_type: 'iam.invitation.rejected.v1',
        },
        {
          correlation_id: reissueCorrelationId,
          event_type: 'iam.invitation.revoked.v1',
        },
        {
          correlation_id: reissueCorrelationId,
          event_type: 'iam.invitation.issued.v1',
        },
        {
          correlation_id: revokeCorrelationId,
          event_type: 'iam.invitation.revoked.v1',
        },
        {
          correlation_id: expiryCorrelationId,
          event_type: 'iam.invitation.expired.v1',
        },
      ]),
    );
  });

  it('rolls back invitation acceptance, identity binding, audit, and membership when outbox fails', async () => {
    const issued = await issueIamInvitation(appPool, ownerPrincipal, {
      tenantId: tenantA,
      targetAddress: 'atomic-accept@example.test',
      roles: ['center_manager'],
      centerIds: [centerA],
      idempotencyKey: 'invite-atomic-accept',
      correlationId: randomUUID(),
    });
    if ('deniedReason' in issued || !issued.credential) {
      throw new Error('Expected a newly issued invitation');
    }
    await adminPool.query(
      `INSERT INTO iam_app.outbox_events(
         id,tenant_id,event_type,payload,correlation_id,idempotency_key
       ) VALUES ($1,$2,'seed','{}'::jsonb,$3,$4)`,
      [
        'dddddddd-1111-1111-1111-111111111111',
        tenantA,
        randomUUID(),
        `invitation.accepted:${issued.invitationId}`,
      ],
    );
    const acceptanceCorrelationId = randomUUID();
    await expect(
      respondToIamInvitation(
        appPool,
        await trustedPrincipal({
          issuer: 'test',
          subject: 'atomic-accept',
          verifiedAddresses: ['atomic-accept@example.test'],
        }),
        {
          tenantId: tenantA,
          credential: issued.credential,
          decision: 'accepted',
          correlationId: acceptanceCorrelationId,
        },
      ),
    ).rejects.toThrow();

    const rollbackState = await adminPool.query(
      `SELECT invitation.status, membership.identity_id, membership.status AS membership_status,
              (SELECT count(*)::int FROM iam_app.external_identities
               WHERE issuer='test' AND subject='atomic-accept') AS identity_count,
              (SELECT count(*)::int FROM iam_app.audit_records
               WHERE correlation_id=$3) AS audit_count
       FROM iam_app.invitations AS invitation
       JOIN iam_app.memberships AS membership
         ON membership.tenant_id=invitation.tenant_id
        AND membership.id=invitation.membership_id
       WHERE invitation.tenant_id=$1 AND invitation.id=$2`,
      [tenantA, issued.invitationId, acceptanceCorrelationId],
    );
    expect(rollbackState.rows[0]).toEqual({
      audit_count: 0,
      identity_count: 0,
      identity_id: null,
      membership_status: 'pending',
      status: 'pending',
    });
  });

  it('rolls back the revoked pair and new pair when reissue outbox insertion fails', async () => {
    const original = await issueIamInvitation(appPool, ownerPrincipal, {
      tenantId: tenantA,
      targetAddress: 'atomic-reissue@example.test',
      roles: ['center_manager'],
      centerIds: [centerA],
      idempotencyKey: 'invite-atomic-reissue-original',
      correlationId: randomUUID(),
    });
    if ('deniedReason' in original) {
      throw new Error('Expected a newly issued invitation');
    }
    const newInvitationId = 'eeeeeeee-3333-3333-3333-333333333333';
    const newMembershipId = 'eeeeeeee-4444-4444-4444-444444444444';
    await adminPool.query(
      `INSERT INTO iam_app.outbox_events(
         id,tenant_id,event_type,payload,correlation_id,idempotency_key
       ) VALUES ($1,$2,'seed','{}'::jsonb,$3,$4)`,
      [
        'eeeeeeee-5555-5555-5555-555555555555',
        tenantA,
        randomUUID(),
        `invitation.issued:${newInvitationId}`,
      ],
    );
    const reissueCorrelationId = randomUUID();
    await expect(
      appPool.query(
        `SELECT iam_app.issue_invitation_command(
          $1,$2,$3::uuid,$4::uuid,$5::uuid,$6,$7::text[],$8::uuid[],
          $9,$10,$11::uuid,$12::uuid
        )`,
        [
          ownerPrincipal.issuer,
          ownerPrincipal.subject,
          tenantA,
          newInvitationId,
          newMembershipId,
          'atomic-reissue@example.test',
          ['center_manager'],
          [centerA],
          hashCredential('atomic-reissue-credential'),
          'invite-atomic-reissue-new',
          original.invitationId,
          reissueCorrelationId,
        ],
      ),
    ).rejects.toThrow();

    const originalState = await adminPool.query(
      `SELECT invitation.status, membership.status AS membership_status,
              (SELECT count(*)::int FROM iam_app.invitations WHERE id=$3) AS new_invitation_count,
              (SELECT count(*)::int FROM iam_app.memberships WHERE id=$4) AS new_membership_count,
              (SELECT count(*)::int FROM iam_app.audit_records WHERE correlation_id=$5) AS audit_count,
              (SELECT count(*)::int FROM iam_app.outbox_events
               WHERE correlation_id=$5 AND event_type='iam.invitation.revoked.v1') AS revoke_event_count
       FROM iam_app.invitations AS invitation
       JOIN iam_app.memberships AS membership
         ON membership.tenant_id=invitation.tenant_id
        AND membership.id=invitation.membership_id
       WHERE invitation.tenant_id=$1 AND invitation.id=$2`,
      [
        tenantA,
        original.invitationId,
        newInvitationId,
        newMembershipId,
        reissueCorrelationId,
      ],
    );
    expect(originalState.rows[0]).toEqual({
      audit_count: 0,
      membership_status: 'pending',
      new_invitation_count: 0,
      new_membership_count: 0,
      revoke_event_count: 0,
      status: 'pending',
    });
  });

  it('rejects external collaborator assignments and rolls back invitation, audit, and membership when outbox fails', async () => {
    await expect(
      issueIamInvitation(appPool, ownerPrincipal, {
        tenantId: tenantA,
        targetAddress,
        roles: ['tenant_admin', 'external_collaborator'],
        centerIds: [],
        idempotencyKey: 'invite-external',
        correlationId: randomUUID(),
      }),
    ).resolves.toEqual({ deniedReason: 'invariant_violation' });
    await expect(
      adminPool.query(
        `INSERT INTO iam_app.memberships(id,tenant_id,identity_id,status,roles)
         VALUES ('ffffffff-1111-1111-1111-111111111111',$1,$2,'active',ARRAY['external_collaborator'])`,
        [tenantA, ownerIdentity],
      ),
    ).rejects.toThrow('External collaborator assignments are disabled');

    const invitationId = 'ffffffff-2222-2222-2222-222222222222';
    const membershipId = 'ffffffff-3333-3333-3333-333333333333';
    await adminPool.query(
      `INSERT INTO iam_app.outbox_events(
         id,tenant_id,event_type,payload,correlation_id,idempotency_key
       ) VALUES ($1,$2,'seed','{}'::jsonb,$3,$4)`,
      [
        'ffffffff-4444-4444-4444-444444444444',
        tenantA,
        randomUUID(),
        `invitation.issued:${invitationId}`,
      ],
    );
    await expect(
      appPool.query(
        `SELECT iam_app.issue_invitation_command(
          $1,$2,$3::uuid,$4::uuid,$5::uuid,$6,$7::text[],$8::uuid[],
          $9,$10,NULL,$11::uuid
        )`,
        [
          ownerPrincipal.issuer,
          ownerPrincipal.subject,
          tenantA,
          invitationId,
          membershipId,
          targetAddress,
          ['center_manager'],
          [centerA],
          hashCredential('atomic-credential'),
          'invite-atomic',
          randomUUID(),
        ],
      ),
    ).rejects.toThrow();
    const rollback = await adminPool.query<{ count: number }>(
      `SELECT
        (SELECT count(*) FROM iam_app.invitations WHERE id=$1)::int
        + (SELECT count(*) FROM iam_app.memberships WHERE id=$2)::int
        + (SELECT count(*) FROM iam_app.audit_records WHERE resource_id=$1)::int
        AS count`,
      [invitationId, membershipId],
    );
    expect(rollback.rows[0]?.count).toBe(0);
  });
});
