import type { PoolClient } from 'pg';

export async function rollbackAndReleaseClient(
  client: PoolClient,
): Promise<void> {
  try {
    await client.query('ROLLBACK');
    client.release();
  } catch {
    client.release(true);
  }
}
