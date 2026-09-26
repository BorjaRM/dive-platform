import type { Pool } from 'pg';
import { type TenantUnitOfWork, withTenant } from './unit-of-work.js';

export type IamAccessContext = Readonly<{
  issuer: string;
  subject: string;
  identityId: string;
  membershipId: string;
  tenantId: string;
  roles: readonly string[];
  centerIds: readonly string[] | null;
}>;

type ResolvedAccess = {
  identityId: string;
  membershipId: string;
  tenantId: string;
  roles: string[];
  centerIds: string[] | null;
};

export async function resolveIamAccess(
  pool: Pool,
  principal: Readonly<{ issuer: string; subject: string }>,
  requestedTenantId: string,
): Promise<IamAccessContext> {
  if (!principal.issuer || !principal.subject || !requestedTenantId)
    throw new Error('Access denied');
  const result = await pool.query<{ access: ResolvedAccess | null }>(
    'SELECT iam_app.resolve_access($1, $2, $3::uuid) AS access',
    [principal.issuer, principal.subject, requestedTenantId],
  );
  const access = result.rows[0]?.access;
  if (!access) throw new Error('Access denied');
  return Object.freeze({
    ...access,
    issuer: principal.issuer,
    subject: principal.subject,
    roles: Object.freeze([...access.roles]),
    centerIds: access.centerIds ? Object.freeze([...access.centerIds]) : null,
  });
}

export async function withIamAuthorizedTenant<T>(
  pool: Pool,
  context: IamAccessContext,
  fn: (uow: TenantUnitOfWork, current: IamAccessContext) => Promise<T>,
): Promise<T> {
  const current = await resolveIamAccess(pool, context, context.tenantId);
  if (
    current.identityId !== context.identityId ||
    current.membershipId !== context.membershipId
  ) {
    throw new Error('Access denied');
  }
  return withTenant(pool, current.tenantId, (uow) => fn(uow, current));
}
