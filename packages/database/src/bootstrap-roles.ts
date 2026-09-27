import type { Pool } from 'pg';
import { spikeAppPassword, spikeMigrationPassword } from './env.js';

function quoteLiteral(value: string): string {
  return value.replaceAll("'", "''");
}

function quoteIdent(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

/**
 * Environment bootstrap (admin/superuser). Creates `dive_migration` and `dive_app`.
 * Not a product migration and not used at API runtime.
 */
export async function bootstrapRoles(adminPool: Pool): Promise<void> {
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
      ALTER ROLE dive_migration
        WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
      ALTER ROLE dive_app
        WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
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
  const databaseIdent = quoteIdent(databaseName);
  await adminPool.query(
    `GRANT CONNECT, CREATE ON DATABASE ${databaseIdent} TO dive_migration`,
  );
  await adminPool.query(
    `GRANT CONNECT ON DATABASE ${databaseIdent} TO dive_app`,
  );
  await adminPool.query(
    `REVOKE CREATE ON DATABASE ${databaseIdent} FROM dive_app`,
  );
}
