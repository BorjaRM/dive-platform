import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootstrapRoles } from '../../src/bootstrap-roles.js';
import { migrationDatabaseUrl, spikeAdminDatabaseUrl } from '../../src/env.js';
import * as iamSchema from '../../src/iam-schema.js';
import { migrateProduct, productMigrationsFolder } from '../../src/migrate.js';
import { createAdminPool, createAppPool } from './harness.js';

const iamTables = [
  iamSchema.iamTenants,
  iamSchema.iamIdentities,
  iamSchema.iamExternalIdentities,
  iamSchema.iamCenters,
  iamSchema.iamMemberships,
  iamSchema.iamAuditRecords,
  iamSchema.iamOutboxEvents,
];

const emptyDatabaseName = 'dive_migrate_empty';

function urlForDatabase(sourceUrl: string, databaseName: string): string {
  const url = new URL(sourceUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

describe('product migrations', () => {
  let adminPool: Pool;
  let appPool: Pool;
  let emptyAdminPool: Pool | undefined;

  beforeAll(async () => {
    adminPool = createAdminPool();
    appPool = createAppPool();
    await bootstrapRoles(adminPool);
    await migrateProduct();

    const maintenance = new Pool({
      connectionString: spikeAdminDatabaseUrl(),
      max: 1,
    });
    try {
      await maintenance.query(`DROP DATABASE IF EXISTS ${emptyDatabaseName}`);
      await maintenance.query(`CREATE DATABASE ${emptyDatabaseName}`);
    } finally {
      await maintenance.end();
    }

    await adminPool.query(
      `GRANT CONNECT, CREATE ON DATABASE ${emptyDatabaseName} TO dive_migration`,
    );
    emptyAdminPool = new Pool({
      connectionString: urlForDatabase(
        spikeAdminDatabaseUrl(),
        emptyDatabaseName,
      ),
      max: 1,
    });
    await migrateProduct(
      productMigrationsFolder,
      urlForDatabase(migrationDatabaseUrl(), emptyDatabaseName),
    );
  });

  afterAll(async () => {
    await emptyAdminPool?.end();
    await appPool.end();
    await adminPool.end();
    const maintenance = new Pool({
      connectionString: spikeAdminDatabaseUrl(),
      max: 1,
    });
    try {
      await maintenance.query(`DROP DATABASE IF EXISTS ${emptyDatabaseName}`);
    } finally {
      await maintenance.end();
    }
  });

  it('creates iam_app from an empty database without the spike harness', async () => {
    const schemas = await emptyAdminPool.query<{ nspname: string }>(
      `SELECT nspname FROM pg_namespace WHERE nspname IN ('iam_app', 'mt_spike') ORDER BY nspname`,
    );
    expect(schemas.rows.map((row) => row.nspname)).toEqual(['iam_app']);
  });

  it('is a no-op on a second run', async () => {
    const emptyUrl = urlForDatabase(migrationDatabaseUrl(), emptyDatabaseName);
    const before = await emptyAdminPool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM drizzle.__drizzle_migrations`,
    );
    await migrateProduct(productMigrationsFolder, emptyUrl);
    const after = await emptyAdminPool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM drizzle.__drizzle_migrations`,
    );
    expect(after.rows[0]?.count).toBe(before.rows[0]?.count);
    expect(Number(after.rows[0]?.count)).toBeGreaterThan(0);
  });

  it('keeps Drizzle product columns aligned with PostgreSQL', async () => {
    for (const table of iamTables) {
      const definition = getTableConfig(table);
      const qualifiedName = `iam_app.${definition.name}`;
      const actual = await adminPool.query<{ name: string; not_null: boolean }>(
        `SELECT attname AS name, attnotnull AS not_null
         FROM pg_attribute
         WHERE attrelid = $1::regclass
           AND attnum > 0
           AND NOT attisdropped
         ORDER BY attname`,
        [qualifiedName],
      );
      expect(actual.rows, qualifiedName).toEqual(
        definition.columns
          .map((column) => ({
            name: column.name,
            not_null: Boolean(column.notNull),
          }))
          .sort((left, right) => left.name.localeCompare(right.name)),
      );
    }
  });

  it('runs as dive_migration and leaves dive_app without DDL', async () => {
    const owner = await adminPool.query<{ tableowner: string }>(
      `SELECT tableowner FROM pg_tables WHERE schemaname = 'iam_app' AND tablename = 'tenants'`,
    );
    expect(owner.rows[0]?.tableowner).toBe('dive_migration');

    await expect(
      appPool.query('CREATE TABLE iam_app.app_should_not_create (id int)'),
    ).rejects.toThrow();
    await expect(
      appPool.query('ALTER TABLE iam_app.tenants DISABLE ROW LEVEL SECURITY'),
    ).rejects.toThrow();
  });

  it('rolls back a failing migration file atomically', async () => {
    const tempFolder = mkdtempSync(join(tmpdir(), 'dive-migrate-'));
    const metaDir = join(tempFolder, 'meta');
    mkdirSync(metaDir, { recursive: true });
    const journal = JSON.parse(
      readFileSync(join(productMigrationsFolder, 'meta/_journal.json'), 'utf8'),
    ) as {
      version: string;
      dialect: string;
      entries: Array<{
        idx: number;
        version: string;
        when: number;
        tag: string;
        breakpoints: boolean;
      }>;
    };
    const failingTag = '0001_failing_migration';
    const lastWhen = journal.entries.at(-1)?.when ?? 0;
    journal.entries = [
      ...journal.entries,
      {
        idx: journal.entries.length,
        version: journal.entries[0]?.version ?? '7',
        when: lastWhen + 1,
        tag: failingTag,
        breakpoints: true,
      },
    ];
    writeFileSync(
      join(metaDir, '_journal.json'),
      `${JSON.stringify(journal, null, 2)}\n`,
    );
    for (const entry of journal.entries.slice(0, -1)) {
      writeFileSync(
        join(tempFolder, `${entry.tag}.sql`),
        readFileSync(join(productMigrationsFolder, `${entry.tag}.sql`), 'utf8'),
      );
    }
    writeFileSync(
      join(tempFolder, `${failingTag}.sql`),
      `CREATE TABLE "iam_app"."should_not_exist" ("id" integer);
--> statement-breakpoint
DO $$ BEGIN RAISE EXCEPTION 'intentional migration failure'; END $$;
`,
    );

    const emptyUrl = urlForDatabase(migrationDatabaseUrl(), emptyDatabaseName);
    const before = await emptyAdminPool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM drizzle.__drizzle_migrations`,
    );
    await expect(migrateProduct(tempFolder, emptyUrl)).rejects.toThrow();

    const leftover = await emptyAdminPool.query<{ to_regclass: string | null }>(
      `SELECT to_regclass('iam_app.should_not_exist')`,
    );
    expect(leftover.rows[0]?.to_regclass).toBeNull();

    const after = await emptyAdminPool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM drizzle.__drizzle_migrations`,
    );
    expect(after.rows[0]?.count).toBe(before.rows[0]?.count);
  });
});
