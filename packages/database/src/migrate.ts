import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Client } from 'pg';
import { migrationDatabaseUrl } from './env.js';

export const productMigrationsFolder = join(
  dirname(fileURLToPath(import.meta.url)),
  '../drizzle',
);

/**
 * Applies versioned product migrations as `dive_migration`.
 * Runtime (`dive_app`) must not call this.
 */
export async function migrateProduct(
  folder = productMigrationsFolder,
  connectionString = migrationDatabaseUrl(),
): Promise<void> {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const db = drizzle(client);
    await migrate(db, { migrationsFolder: folder });
  } finally {
    await client.end();
  }
}
