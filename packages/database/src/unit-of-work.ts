import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Pool, PoolClient } from 'pg';
import * as schema from './schema.js';

export type TenantUnitOfWork = {
  client: PoolClient;
  db: NodePgDatabase<typeof schema>;
};

export async function withTenant<T>(
  pool: Pool,
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
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Connection may already be aborted.
    }
    throw error;
  } finally {
    client.release();
  }
}
