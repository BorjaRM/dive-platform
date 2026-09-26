import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';
import { spikeAppPassword, spikeMigrationPassword } from './env.js';

const sqlPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../sql/0001_mt_spike_harness.sql',
);

function quoteLiteral(value: string): string {
  return value.replaceAll("'", "''");
}

export async function applyMtSpikeHarness(adminPool: Pool): Promise<void> {
  const appPassword = quoteLiteral(spikeAppPassword());
  const migrationPassword = quoteLiteral(spikeMigrationPassword());

  await adminPool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'dive_migration') THEN
        CREATE ROLE dive_migration LOGIN PASSWORD '${migrationPassword}'
          NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
      END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'dive_app') THEN
        CREATE ROLE dive_app LOGIN PASSWORD '${appPassword}'
          NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
      END IF;
    END
    $$;
  `);

  await adminPool.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
  const databaseName = await adminPool
    .query<{ current_database: string }>('SELECT current_database()')
    .then((result) => result.rows[0]?.current_database);
  if (!databaseName) {
    throw new Error('Could not resolve current_database()');
  }
  await adminPool.query(
    `GRANT CONNECT ON DATABASE "${databaseName.replaceAll('"', '""')}" TO dive_migration, dive_app`,
  );

  const sql = readFileSync(sqlPath, 'utf8');
  await adminPool.query(sql);
}
