import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { domainToASCII } from 'node:url';
import type { IamDenialReason } from '@dive-center/contracts';
import {
  type AuthenticatedPrincipal,
  assertAuthenticatedPrincipal,
} from '@dive-center/identity';
import type { Pool } from 'pg';

export function canonicalInvitationAddress(value: string): string {
  const normalized = value.trim().normalize('NFKC');
  if (normalized.split('@').length !== 2) {
    throw new Error('Invalid invitation address');
  }
  const [localPart = '', domainPart = ''] = normalized.split('@');
  const containsControlCharacter = [...normalized].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || codePoint === 0x7f;
  });
  if (!localPart || !domainPart || containsControlCharacter) {
    throw new Error('Invalid invitation address');
  }
  const asciiDomain = domainToASCII(domainPart);
  if (!asciiDomain) throw new Error('Invalid invitation address');
  return `${localPart.toLowerCase()}@${asciiDomain.toLowerCase()}`;
}

type Principal = Readonly<{
  issuer: string;
  subject: string;
  verifiedAddresses: readonly string[];
}>;

type Denied = Readonly<{ deniedReason: IamDenialReason }>;

export type InvitationCommandResult =
  | Denied
  | Readonly<{
      invitationId: string;
      membershipId: string;
      invitationAttemptId?: string;
      status: 'pending' | 'accepted' | 'rejected' | 'revoked' | 'expired';
      deliveryStatus?: 'pending' | 'retrying' | 'succeeded' | 'dead_letter';
      expiresAt?: string;
      created?: boolean;
      credential?: string;
    }>;

export type MembershipCommandResult = Denied | Readonly<{ status: 'disabled' }>;

function credentialHash(credential: string): string {
  return createHash('sha256').update(credential, 'utf8').digest('hex');
}

export async function issueIamInvitation(
  pool: Pool,
  principal: Principal,
  input: Readonly<{
    tenantId: string;
    targetAddress: string;
    roles: readonly string[];
    centerIds: readonly string[];
    idempotencyKey: string;
    correlationId: string;
    reissueInvitationId?: string;
  }>,
): Promise<InvitationCommandResult> {
  const credential = randomBytes(32).toString('base64url');
  const targetAddressCanonical = canonicalInvitationAddress(
    input.targetAddress,
  );
  const invitationAttemptId = randomUUID();
  const result = await pool.query<{ outcome: InvitationCommandResult }>(
    `SELECT iam_app.issue_invitation_command(
      $1, $2, $3::uuid, $4::uuid, $5::uuid, $6, $7, $8::text[], $9::uuid[],
      $10, $11, $12, $13::uuid, $14::uuid
    ) AS outcome`,
    [
      principal.issuer,
      principal.subject,
      input.tenantId,
      randomUUID(),
      randomUUID(),
      input.targetAddress,
      targetAddressCanonical,
      input.roles,
      input.centerIds,
      credentialHash(credential),
      invitationAttemptId,
      input.idempotencyKey,
      input.reissueInvitationId ?? null,
      input.correlationId,
    ],
  );
  const outcome = result.rows[0]?.outcome;
  if (!outcome) throw new Error('Invitation command returned no outcome');
  return 'created' in outcome && outcome.created
    ? Object.freeze({ ...outcome, credential })
    : Object.freeze(outcome);
}

export async function issueIamMembershipInvitation(
  pool: Pool,
  principal: Principal,
  input: Readonly<{
    tenantId: string;
    targetAddress: string;
    roles: readonly string[];
    centerIds: readonly string[];
    idempotencyKey: string;
    correlationId: string;
    reissueInvitationId?: string;
  }>,
): Promise<InvitationCommandResult> {
  const credential = randomBytes(32).toString('base64url');
  const targetAddressCanonical = canonicalInvitationAddress(
    input.targetAddress,
  );
  const invitationAttemptId = randomUUID();
  const result = await pool.query<{ outcome: InvitationCommandResult }>(
    `SELECT iam_app.issue_membership_invitation_command(
      $1, $2, $3::uuid, $4::uuid, $5::uuid, $6, $7, $8::text[], $9::uuid[],
      $10, $11, $12, $13::uuid, $14::uuid
    ) AS outcome`,
    [
      principal.issuer,
      principal.subject,
      input.tenantId,
      randomUUID(),
      randomUUID(),
      input.targetAddress,
      targetAddressCanonical,
      input.roles,
      input.centerIds,
      credentialHash(credential),
      invitationAttemptId,
      input.idempotencyKey,
      input.reissueInvitationId ?? null,
      input.correlationId,
    ],
  );
  const outcome = result.rows[0]?.outcome;
  if (!outcome) throw new Error('Membership invitation returned no outcome');
  return 'created' in outcome && outcome.created
    ? Object.freeze({ ...outcome, credential })
    : Object.freeze(outcome);
}

export async function respondToIamInvitation(
  pool: Pool,
  principal: AuthenticatedPrincipal,
  input: Readonly<{
    tenantId: string;
    credential: string;
    decision: 'accepted' | 'rejected';
    correlationId: string;
  }>,
): Promise<InvitationCommandResult> {
  assertAuthenticatedPrincipal(principal);
  if (principal.verifiedAddresses.length === 0) {
    return Object.freeze({
      deniedReason: 'credential_invalid_or_expired' as const,
    });
  }
  const result = await pool.query<{ outcome: InvitationCommandResult }>(
    `SELECT iam_app.respond_invitation_command(
      $1, $2, $3::text[], $4::uuid, $5, $6, $7::uuid, $8::uuid
    ) AS outcome`,
    [
      principal.issuer,
      principal.subject,
      principal.verifiedAddresses,
      input.tenantId,
      credentialHash(input.credential),
      input.decision,
      randomUUID(),
      input.correlationId,
    ],
  );
  const outcome = result.rows[0]?.outcome;
  if (!outcome) throw new Error('Invitation response returned no outcome');
  return Object.freeze(outcome);
}

export async function revokeIamInvitation(
  pool: Pool,
  principal: Principal,
  input: Readonly<{
    tenantId: string;
    invitationId: string;
    correlationId: string;
    allowOwnerInvitation?: boolean;
  }>,
): Promise<InvitationCommandResult> {
  const command =
    input.allowOwnerInvitation === true
      ? 'revoke_owner_invitation_command'
      : 'revoke_membership_invitation_command';
  const result = await pool.query<{ outcome: InvitationCommandResult }>(
    `SELECT iam_app.${command}(
      $1, $2, $3::uuid, $4::uuid, $5::uuid
    ) AS outcome`,
    [
      principal.issuer,
      principal.subject,
      input.tenantId,
      input.invitationId,
      input.correlationId,
    ],
  );
  const outcome = result.rows[0]?.outcome;
  if (!outcome) throw new Error('Invitation revoke returned no outcome');
  return Object.freeze(outcome);
}

export async function disableIamMembership(
  pool: Pool,
  principal: Principal,
  input: Readonly<{
    tenantId: string;
    membershipId: string;
    correlationId: string;
  }>,
): Promise<MembershipCommandResult> {
  const result = await pool.query<{ outcome: MembershipCommandResult }>(
    `SELECT iam_app.disable_membership_command(
      $1, $2, $3::uuid, $4::uuid, $5::uuid
    ) AS outcome`,
    [
      principal.issuer,
      principal.subject,
      input.tenantId,
      input.membershipId,
      input.correlationId,
    ],
  );
  const outcome = result.rows[0]?.outcome;
  if (!outcome) throw new Error('Membership disable returned no outcome');
  return Object.freeze(outcome);
}
