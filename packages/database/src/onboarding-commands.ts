import { createHash } from 'node:crypto';
import {
  type AuthenticatedPrincipal,
  assertAuthenticatedPrincipal,
} from '@dive-center/identity';
import type { Pool, PoolClient } from 'pg';

export type BootstrapInvitationDenied = Readonly<{
  deniedReason:
    | 'idempotency_conflict'
    | 'permission_missing'
    | 'rate_limited'
    | 'resource_missing_or_inaccessible';
}>;

export type BootstrapInvitationState = Readonly<{
  invitationId: string;
  destinationEmail: string;
  status: 'consumed' | 'expired' | 'issued' | 'revoked' | 'superseded';
  deliveryStatus: 'dead_letter' | 'pending' | 'retrying' | 'succeeded';
  issuedAt?: string;
  expiresAt?: string;
}>;

export type BootstrapInvitationResult =
  | BootstrapInvitationDenied
  | BootstrapInvitationState;

export type BootstrapOutboxClaim = Readonly<{
  eventId: string;
  grantId: string;
  command: 'create' | 'revoke';
  destinationEmail: string;
  providerInvitationRef: string | null;
  attemptCount: number;
  correlationId: string;
}>;

export type TenantBootstrapCompletion = Readonly<{
  tenantId: string;
  centerId: string;
  membershipId: string;
  centerKey: string;
}>;

export type TenantBootstrapCompletionDenied = Readonly<{
  deniedReason:
    | 'bootstrap_unavailable'
    | 'idempotency_conflict'
    | 'rate_limited'
    | 'validation_error';
  retryAfterSeconds?: number;
}>;

export type TenantBootstrapCompletionResult =
  | TenantBootstrapCompletion
  | TenantBootstrapCompletionDenied;

function fingerprint(value: Readonly<Record<string, string | null>>): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export async function completeOwnTenantBootstrap(
  pool: Pool,
  principal: AuthenticatedPrincipal,
  input: Readonly<{
    operatorDisplayName: string;
    centerDisplayName: string;
    timeZone: string;
    locale: 'en' | 'es';
    correlationId: string;
  }>,
): Promise<TenantBootstrapCompletionResult> {
  assertAuthenticatedPrincipal(principal);
  const operatorDisplayName = input.operatorDisplayName.trim().normalize('NFC');
  const centerDisplayName = input.centerDisplayName.trim().normalize('NFC');
  const timeZone = input.timeZone.trim();
  const verifiedAddresses = principal.verifiedAddresses.map((address) =>
    address.trim().toLowerCase(),
  );
  const completionFingerprint = fingerprint({
    centerDisplayName,
    locale: input.locale,
    operatorDisplayName,
    timeZone,
  });
  const sessionIdHash = createHash('sha256')
    .update(principal.sessionId)
    .digest('hex');
  const result = await pool.query<{ outcome: TenantBootstrapCompletionResult }>(
    `SELECT onboarding_app.complete_own_tenant_bootstrap_command(
      $1, $2, $3, $4::text[], $5, $6, $7, $8, $9, $10::uuid
    ) AS outcome`,
    [
      principal.issuer,
      principal.subject,
      sessionIdHash,
      verifiedAddresses,
      operatorDisplayName,
      centerDisplayName,
      timeZone,
      input.locale,
      completionFingerprint,
      input.correlationId,
    ],
  );
  const outcome = result.rows[0]?.outcome;
  if (!outcome) throw new Error('Tenant bootstrap command returned no outcome');
  return Object.freeze(outcome);
}

function requireOutcome(
  row: Readonly<{ outcome: BootstrapInvitationResult }> | undefined,
): BootstrapInvitationResult {
  if (!row) throw new Error('Bootstrap invitation command returned no outcome');
  return Object.freeze(row.outcome);
}

export async function setBootstrapPlatformCapability(
  pool: Pool,
  input: Readonly<{
    issuer: string;
    subject: string;
    capability:
      | 'bootstrap_invitation.issue'
      | 'bootstrap_invitation.read'
      | 'bootstrap_invitation.reissue'
      | 'bootstrap_invitation.revoke';
    enabled: boolean;
  }>,
): Promise<string> {
  const result = await pool.query<{ principal_id: string }>(
    `SELECT onboarding_app.set_platform_capability($1, $2, $3, $4) AS principal_id`,
    [input.issuer, input.subject, input.capability, input.enabled],
  );
  const principalId = result.rows[0]?.principal_id;
  if (!principalId) throw new Error('Capability command returned no principal');
  return principalId;
}

export async function consumeBootstrapInvitationRateLimit(
  pool: Pool,
  principal: AuthenticatedPrincipal,
): Promise<number | null> {
  assertAuthenticatedPrincipal(principal);
  const result = await pool.query<{ retry_after_seconds: number | null }>(
    `SELECT onboarding_app.consume_bootstrap_invitation_rate_limit($1, $2)
      AS retry_after_seconds`,
    [principal.issuer, principal.subject],
  );
  return result.rows[0]?.retry_after_seconds ?? null;
}

export async function issueBootstrapInvitation(
  pool: Pool,
  principal: AuthenticatedPrincipal,
  input: Readonly<{
    destinationEmail: string;
    reason?: string;
    idempotencyKey: string;
    correlationId: string;
  }>,
): Promise<BootstrapInvitationResult> {
  assertAuthenticatedPrincipal(principal);
  const destinationEmail = input.destinationEmail.trim().toLowerCase();
  const reason = input.reason?.trim() || null;
  const result = await pool.query<{ outcome: BootstrapInvitationResult }>(
    `SELECT onboarding_app.issue_bootstrap_invitation_command(
      $1, $2, $3, $4, $5, $6, $7::uuid
    ) AS outcome`,
    [
      principal.issuer,
      principal.subject,
      destinationEmail,
      reason,
      input.idempotencyKey,
      fingerprint({ destinationEmail, reason }),
      input.correlationId,
    ],
  );
  return requireOutcome(result.rows[0]);
}

export async function readBootstrapInvitation(
  pool: Pool,
  principal: AuthenticatedPrincipal,
  invitationId: string,
): Promise<BootstrapInvitationResult> {
  assertAuthenticatedPrincipal(principal);
  const result = await pool.query<{ outcome: BootstrapInvitationResult }>(
    `SELECT onboarding_app.read_bootstrap_invitation_command(
      $1, $2, $3::uuid
    ) AS outcome`,
    [principal.issuer, principal.subject, invitationId],
  );
  return requireOutcome(result.rows[0]);
}

async function mutateBootstrapInvitation(
  pool: Pool,
  principal: AuthenticatedPrincipal,
  command: 'reissue' | 'revoke',
  input: Readonly<{
    invitationId: string;
    reason: string;
    idempotencyKey: string;
    correlationId: string;
  }>,
): Promise<BootstrapInvitationResult> {
  assertAuthenticatedPrincipal(principal);
  const reason = input.reason.trim();
  const result = await pool.query<{ outcome: BootstrapInvitationResult }>(
    `SELECT onboarding_app.${command}_bootstrap_invitation_command(
      $1, $2, $3::uuid, $4, $5, $6, $7::uuid
    ) AS outcome`,
    [
      principal.issuer,
      principal.subject,
      input.invitationId,
      reason,
      input.idempotencyKey,
      fingerprint({ invitationId: input.invitationId, reason }),
      input.correlationId,
    ],
  );
  return requireOutcome(result.rows[0]);
}

export function reissueBootstrapInvitation(
  pool: Pool,
  principal: AuthenticatedPrincipal,
  input: Readonly<{
    invitationId: string;
    reason: string;
    idempotencyKey: string;
    correlationId: string;
  }>,
): Promise<BootstrapInvitationResult> {
  return mutateBootstrapInvitation(pool, principal, 'reissue', input);
}

export function revokeBootstrapInvitation(
  pool: Pool,
  principal: AuthenticatedPrincipal,
  input: Readonly<{
    invitationId: string;
    reason: string;
    idempotencyKey: string;
    correlationId: string;
  }>,
): Promise<BootstrapInvitationResult> {
  return mutateBootstrapInvitation(pool, principal, 'revoke', input);
}

export async function claimBootstrapOutboxEvent(
  client: PoolClient,
): Promise<BootstrapOutboxClaim | null> {
  const result = await client.query<BootstrapOutboxClaim>(
    `SELECT event_id AS "eventId", grant_id AS "grantId", command,
            destination_email AS "destinationEmail",
            provider_invitation_ref AS "providerInvitationRef",
            attempt_count AS "attemptCount", correlation_id AS "correlationId"
     FROM onboarding_app.claim_bootstrap_outbox_event()`,
  );
  const claim = result.rows[0];
  return claim ? Object.freeze(claim) : null;
}

export async function completeBootstrapOutboxEvent(
  client: PoolClient,
  input: Readonly<{
    eventId: string;
    providerInvitationRef: string | null;
    providerStatus: string;
  }>,
): Promise<void> {
  await client.query(
    `SELECT onboarding_app.complete_bootstrap_outbox_event(
      $1::uuid, $2, $3
    )`,
    [input.eventId, input.providerInvitationRef, input.providerStatus],
  );
}

export async function failBootstrapOutboxEvent(
  client: PoolClient,
  input: Readonly<{
    eventId: string;
    retryable: boolean;
    nextAttemptAt: string | null;
    providerStatus: string;
  }>,
): Promise<'dead_letter' | 'retrying'> {
  const result = await client.query<{ state: 'dead_letter' | 'retrying' }>(
    `SELECT onboarding_app.fail_bootstrap_outbox_event(
      $1::uuid, $2, $3::timestamptz, $4
    ) AS state`,
    [input.eventId, input.retryable, input.nextAttemptAt, input.providerStatus],
  );
  const state = result.rows[0]?.state;
  if (!state) throw new Error('Outbox failure command returned no state');
  return state;
}
