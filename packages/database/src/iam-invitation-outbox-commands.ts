import type { PoolClient } from 'pg';

export type OrdinaryInvitationOutboxClaim = Readonly<{
  eventId: string;
  tenantId: string;
  invitationId: string;
  command: 'create' | 'revoke';
  targetAddress: string;
  invitationAttemptId: string;
  providerInvitationRef: string | null;
  invitationStatus: 'pending' | 'accepted' | 'rejected' | 'revoked' | 'expired';
  attemptCount: number;
  correlationId: string;
}>;

export async function claimOrdinaryInvitationOutboxEvent(
  client: PoolClient,
): Promise<OrdinaryInvitationOutboxClaim | null> {
  const result = await client.query<OrdinaryInvitationOutboxClaim>(
    `SELECT claim.event_id AS "eventId", claim.tenant_id AS "tenantId",
          claim.invitation_id AS "invitationId", claim.command,
          claim.target_address AS "targetAddress",
          claim.invitation_attempt_id AS "invitationAttemptId",
          claim.provider_invitation_ref AS "providerInvitationRef",
          claim.invitation_status AS "invitationStatus",
          claim.attempt_count AS "attemptCount",
          claim.correlation_id AS "correlationId"
         FROM iam_app.claim_invitation_outbox_event() AS claim`,
  );
  const claim = result.rows[0];
  return claim ? Object.freeze(claim) : null;
}

export async function completeOrdinaryInvitationOutboxEvent(
  client: PoolClient,
  input: Readonly<{
    claim: OrdinaryInvitationOutboxClaim;
    providerInvitationRef: string | null;
    providerStatus: string;
  }>,
): Promise<void> {
  await client.query(
    `SELECT iam_app.complete_invitation_outbox_event(
      $1::uuid, $2::uuid, $3, $4
    )`,
    [
      input.claim.tenantId,
      input.claim.eventId,
      input.providerInvitationRef,
      input.providerStatus,
    ],
  );
}

export async function failOrdinaryInvitationOutboxEvent(
  client: PoolClient,
  input: Readonly<{
    claim: OrdinaryInvitationOutboxClaim;
    retryable: boolean;
    nextAttemptAt: string | null;
    providerStatus: string;
  }>,
): Promise<'dead_letter' | 'retrying'> {
  const result = await client.query<{ state: 'dead_letter' | 'retrying' }>(
    `SELECT iam_app.fail_invitation_outbox_event(
      $1::uuid, $2::uuid, $3, $4::timestamptz, $5
    ) AS state`,
    [
      input.claim.tenantId,
      input.claim.eventId,
      input.retryable,
      input.nextAttemptAt,
      input.providerStatus,
    ],
  );
  const state = result.rows[0]?.state;
  if (!state) throw new Error('Invitation outbox failure returned no state');
  return state;
}
