import {
  type AuthenticatedPrincipal,
  assertAuthenticatedPrincipal,
  type IdentityWebhookEvent,
} from '@dive-center/identity';
import type { Pool } from 'pg';

export type IamOperator = Readonly<{
  identityId: string;
  tenantId: string;
  displayName: string;
}>;

export type TenantContextDenied = Readonly<{
  deniedReason: 'membership_missing_or_inactive' | 'invariant_violation';
}>;

export type TenantContextIssueResult =
  | TenantContextDenied
  | Readonly<{ tenantId: string; issuedAt: string }>;

export type TenantContextResolution = Readonly<{
  identityId: string;
  tenantId: string;
}>;

export async function listIamOperators(
  pool: Pool,
  principal: AuthenticatedPrincipal,
): Promise<readonly IamOperator[]> {
  assertAuthenticatedPrincipal(principal);
  const result = await pool.query<{
    outcome: Readonly<{
      identityId: string | null;
      operators: readonly IamOperator[];
    }>;
  }>(`SELECT iam_app.list_operators_command($1, $2) AS outcome`, [
    principal.issuer,
    principal.subject,
  ]);
  const operators = result.rows[0]?.outcome.operators;
  if (!operators) throw new Error('Operator list command returned no outcome');
  return Object.freeze(
    operators.map((operator) => Object.freeze({ ...operator })),
  );
}

export async function issueIamTenantContext(
  pool: Pool,
  principal: AuthenticatedPrincipal,
  input: Readonly<{
    tenantId: string;
    handleHash: string;
    sessionIdHash: string;
  }>,
): Promise<TenantContextIssueResult> {
  assertAuthenticatedPrincipal(principal);
  const result = await pool.query<{ outcome: TenantContextIssueResult }>(
    `SELECT iam_app.issue_tenant_context_command(
      $1, $2, $3, $4::uuid, $5
    ) AS outcome`,
    [
      principal.issuer,
      principal.subject,
      input.sessionIdHash,
      input.tenantId,
      input.handleHash,
    ],
  );
  const outcome = result.rows[0]?.outcome;
  if (!outcome) throw new Error('Tenant context issue returned no outcome');
  return Object.freeze(outcome);
}

export async function resolveIamTenantContext(
  pool: Pool,
  principal: AuthenticatedPrincipal,
  input: Readonly<{ handleHash: string; sessionIdHash: string }>,
): Promise<TenantContextResolution | null> {
  assertAuthenticatedPrincipal(principal);
  const result = await pool.query<{
    context: TenantContextResolution | null;
  }>(
    `SELECT iam_app.resolve_tenant_context_command(
      $1, $2, $3, $4
    ) AS context`,
    [
      principal.issuer,
      principal.subject,
      input.sessionIdHash,
      input.handleHash,
    ],
  );
  return result.rows[0]?.context ?? null;
}

export async function revokeIamTenantContext(
  pool: Pool,
  principal: AuthenticatedPrincipal,
  input: Readonly<{ handleHash: string; sessionIdHash: string }>,
): Promise<TenantContextDenied | Readonly<{ revoked: true }>> {
  assertAuthenticatedPrincipal(principal);
  const result = await pool.query<{
    outcome: TenantContextDenied | Readonly<{ revoked: true }>;
  }>(
    `SELECT iam_app.revoke_tenant_context_command(
      $1, $2, $3, $4
    ) AS outcome`,
    [
      principal.issuer,
      principal.subject,
      input.sessionIdHash,
      input.handleHash,
    ],
  );
  const outcome = result.rows[0]?.outcome;
  if (!outcome) throw new Error('Tenant context revoke returned no outcome');
  return Object.freeze(outcome);
}

export async function cleanupRevokedIamTenantContexts(
  pool: Pool,
): Promise<Readonly<{ deletedCount: number }>> {
  const result = await pool.query<{ deletedCount: number }>(
    `SELECT iam_app.cleanup_revoked_tenant_contexts_command() AS "deletedCount"`,
  );
  const deletedCount = result.rows[0]?.deletedCount;
  if (deletedCount === undefined) {
    throw new Error('Tenant context cleanup returned no outcome');
  }
  return Object.freeze({ deletedCount });
}

export function sessionIdHashForWebhook(
  event: IdentityWebhookEvent,
  hash: (sessionId: string) => string,
): string | null {
  return event.sessionId ? hash(event.sessionId) : null;
}
