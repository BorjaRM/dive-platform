import type { Pool } from 'pg';
import { type TenantUnitOfWork, withTenant } from './unit-of-work.js';

export type AuthorizedTenantContext = {
  identityId: string;
  permissions: string[];
  tenantId: string;
};

export async function authorize(
  pool: Pool,
  identityId: string,
  requestedTenantId: string,
): Promise<AuthorizedTenantContext> {
  if (!identityId || !requestedTenantId) {
    throw new Error('Access denied');
  }

  const result = await pool.query<{ permissions: string[] | null }>(
    'SELECT mt_spike.membership_permissions($1, $2) AS permissions',
    [identityId, requestedTenantId],
  );
  const permissions = result.rows[0]?.permissions;
  if (!permissions || permissions.length === 0) {
    throw new Error('Access denied');
  }

  return {
    identityId,
    permissions,
    tenantId: requestedTenantId,
  };
}

export async function withAuthorizedTenant<T>(
  pool: Pool,
  context: AuthorizedTenantContext,
  fn: (uow: TenantUnitOfWork) => Promise<T>,
): Promise<T> {
  if (!context?.identityId || !context.tenantId) {
    throw new Error('Access denied');
  }
  const authorized = await authorize(
    pool,
    context.identityId,
    context.tenantId,
  );
  return withTenant(pool, authorized.tenantId, fn);
}
