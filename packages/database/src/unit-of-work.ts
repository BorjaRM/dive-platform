import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Pool, PoolClient } from 'pg';
import * as schema from './product-schema.js';
import { rollbackAndReleaseClient } from './transaction-lifecycle.js';

export type TenantUnitOfWork = {
  client: PoolClient;
  db: NodePgDatabase<typeof schema>;
};

/** Sets transaction-local tenant context. Callers that need membership must use `withAuthorizedTenant`. */
export async function withTenant<T>(
  pool: Pick<Pool, 'connect'>,
  tenantId: string,
  fn: (uow: TenantUnitOfWork) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT set_config($1, $2, true)', [
      'app.tenant_id',
      tenantId,
    ]);
    const db = drizzle(client, { schema });
    const result = await fn({ client, db });
    await client.query('COMMIT');
    client.release();
    return result;
  } catch (error) {
    await rollbackAndReleaseClient(client);
    throw error;
  }
}
