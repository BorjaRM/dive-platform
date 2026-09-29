import type { Pool } from 'pg';
import {
  spikeAppPassword,
  spikeMigrationPassword,
  spikePlatformAdminPassword,
  spikeWorkerPassword,
} from './env.js';

function quoteLiteral(value: string): string {
  return value.replaceAll("'", "''");
}

function quoteIdent(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

/**
 * Environment bootstrap (admin/superuser). Creates restricted database roles.
 * Not a product migration and not used at API runtime.
 */
export async function bootstrapRoles(adminPool: Pool): Promise<void> {
  const appPassword = quoteLiteral(spikeAppPassword());
  const migrationPassword = quoteLiteral(spikeMigrationPassword());
  const platformAdminPassword = quoteLiteral(spikePlatformAdminPassword());
  const workerPassword = quoteLiteral(spikeWorkerPassword());

  const client = await adminPool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtextextended('dive:bootstrap-roles', 0))`,
    );
    await client.query(`
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
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'dive_worker') THEN
        CREATE ROLE dive_worker LOGIN PASSWORD '${workerPassword}'
          NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
      END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'dive_platform_admin') THEN
        CREATE ROLE dive_platform_admin LOGIN PASSWORD '${platformAdminPassword}'
          NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
      END IF;
      ALTER ROLE dive_migration
        WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
      ALTER ROLE dive_app
        WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
      ALTER ROLE dive_worker
        WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
      ALTER ROLE dive_platform_admin
        WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
    END
    $$;
  `);

    await client.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
    const databaseName = await client
      .query<{ current_database: string }>('SELECT current_database()')
      .then((result) => result.rows[0]?.current_database);
    if (!databaseName) {
      throw new Error('Could not resolve current_database()');
    }
    const databaseIdent = quoteIdent(databaseName);
    await client.query(
      `GRANT CONNECT, CREATE ON DATABASE ${databaseIdent} TO dive_migration`,
    );
    await client.query(
      `GRANT CONNECT ON DATABASE ${databaseIdent} TO dive_app`,
    );
    await client.query(
      `GRANT CONNECT ON DATABASE ${databaseIdent} TO dive_worker, dive_platform_admin`,
    );
    await client.query(
      `REVOKE CREATE ON DATABASE ${databaseIdent} FROM dive_app, dive_worker, dive_platform_admin`,
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
