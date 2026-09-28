import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as bookingSchema from '../../src/booking-schema.js';
import { bootstrapRoles } from '../../src/bootstrap-roles.js';
import { migrationDatabaseUrl, spikeAdminDatabaseUrl } from '../../src/env.js';
import * as iamSchema from '../../src/iam-schema.js';
import { migrateProduct, productMigrationsFolder } from '../../src/migrate.js';
import { createAdminPool, createAppPool } from './harness.js';

const iamTables = [
  iamSchema.iamTenants,
  iamSchema.iamIdentities,
  iamSchema.iamExternalIdentities,
  iamSchema.iamIdentityWebhookInbox,
  iamSchema.iamCenters,
  iamSchema.iamMemberships,
  iamSchema.iamIdentityTenants,
  iamSchema.iamTenantContexts,
  iamSchema.iamInvitations,
  iamSchema.iamAuditRecords,
  iamSchema.iamOutboxEvents,
];
const bookingTables = [
  bookingSchema.bookingActivities,
  bookingSchema.bookingSlots,
  bookingSchema.bookingChannels,
  bookingSchema.bookingBookings,
  bookingSchema.bookingCapabilityVerifiers,
];

const onDeleteCodes: Record<string, string> = {
  cascade: 'c',
  'no action': 'a',
  restrict: 'r',
  'set default': 'd',
  'set null': 'n',
};

const emptyDatabaseName = 'dive_migrate_empty';

function urlForDatabase(sourceUrl: string, databaseName: string): string {
  const url = new URL(sourceUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

function requireEmptyAdminPool(pool: Pool | undefined): Pool {
  if (!pool) {
    throw new Error('Empty migration database was not initialized');
  }
  return pool;
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

  it('creates product schemas from an empty database without the spike harness', async () => {
    const schemas = await requireEmptyAdminPool(emptyAdminPool).query<{
      nspname: string;
    }>(
      `SELECT nspname FROM pg_namespace WHERE nspname IN ('booking_app', 'iam_app', 'mt_spike') ORDER BY nspname`,
    );
    expect(schemas.rows.map((row) => row.nspname)).toEqual([
      'booking_app',
      'iam_app',
    ]);
  });

  it('is a no-op on a second run', async () => {
    const emptyUrl = urlForDatabase(migrationDatabaseUrl(), emptyDatabaseName);
    const before = await requireEmptyAdminPool(emptyAdminPool).query<{
      count: string;
    }>(`SELECT count(*)::text AS count FROM drizzle.__drizzle_migrations`);
    await migrateProduct(productMigrationsFolder, emptyUrl);
    const after = await requireEmptyAdminPool(emptyAdminPool).query<{
      count: string;
    }>(`SELECT count(*)::text AS count FROM drizzle.__drizzle_migrations`);
    expect(after.rows[0]?.count).toBe(before.rows[0]?.count);
    expect(Number(after.rows[0]?.count)).toBe(1);
  });

  it('restores row_security before a later migration reads a forced-RLS table', async () => {
    const followupDatabaseName = 'dive_migrate_followup';
    const tempFolder = mkdtempSync(join(tmpdir(), 'dive-migrate-followup-'));
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
    const followupTag = `${String(journal.entries.length).padStart(4, '0')}_row_security_probe`;
    const lastWhen = journal.entries.at(-1)?.when ?? 0;
    journal.entries = [
      ...journal.entries,
      {
        idx: journal.entries.length,
        version: journal.entries[0]?.version ?? '7',
        when: lastWhen + 1,
        tag: followupTag,
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
      join(tempFolder, `${followupTag}.sql`),
      `SELECT set_config('app.tenant_id', '11111111-1111-1111-1111-111111111111', true);
--> statement-breakpoint
SELECT id FROM iam_app.tenants;
`,
    );

    const maintenance = new Pool({
      connectionString: spikeAdminDatabaseUrl(),
      max: 1,
    });
    try {
      await maintenance.query(
        `DROP DATABASE IF EXISTS ${followupDatabaseName}`,
      );
      await maintenance.query(`CREATE DATABASE ${followupDatabaseName}`);
      await maintenance.query(
        `GRANT CONNECT, CREATE ON DATABASE ${followupDatabaseName} TO dive_migration`,
      );
      await expect(
        migrateProduct(
          tempFolder,
          urlForDatabase(migrationDatabaseUrl(), followupDatabaseName),
        ),
      ).resolves.toBeUndefined();
    } finally {
      await maintenance.query(
        `DROP DATABASE IF EXISTS ${followupDatabaseName}`,
      );
      await maintenance.end();
      rmSync(tempFolder, { recursive: true, force: true });
    }
  });

  it('keeps Drizzle product columns aligned with PostgreSQL', async () => {
    const migratedPool = requireEmptyAdminPool(emptyAdminPool);
    for (const table of [...iamTables, ...bookingTables]) {
      const definition = getTableConfig(table);
      const qualifiedName = `${definition.schema}.${definition.name}`;
      const actual = await migratedPool.query<{
        name: string;
        not_null: boolean;
      }>(
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

  it('keeps Drizzle check constraints aligned with PostgreSQL', async () => {
    const migratedPool = requireEmptyAdminPool(emptyAdminPool);
    for (const table of [...iamTables, ...bookingTables]) {
      const definition = getTableConfig(table);
      const qualifiedName = `${definition.schema}.${definition.name}`;
      const actual = await migratedPool.query<{ name: string }>(
        `SELECT conname AS name
         FROM pg_constraint
         WHERE conrelid = $1::regclass
           AND contype = 'c'
         ORDER BY conname`,
        [qualifiedName],
      );
      expect(
        actual.rows.map(({ name }) => name),
        qualifiedName,
      ).toEqual(definition.checks.map(({ name }) => name).sort());
    }
  });

  it('keeps structural defaults aligned with PostgreSQL', async () => {
    const confirmationMode = await requireEmptyAdminPool(emptyAdminPool).query<{
      column_default: string | null;
    }>(
      `SELECT column_default
       FROM information_schema.columns
       WHERE table_schema = 'booking_app'
         AND table_name = 'channels'
         AND column_name = 'confirmation_mode'`,
    );
    expect(confirmationMode.rows[0]?.column_default).toBe("'immediate'::text");
  });

  it('keeps booking foreign keys and indexes aligned with Drizzle', async () => {
    const migratedPool = requireEmptyAdminPool(emptyAdminPool);
    for (const table of bookingTables) {
      const definition = getTableConfig(table);
      const qualifiedName = `${definition.schema}.${definition.name}`;
      const constraints = await migratedPool.query<{
        columns: string[];
        foreign_columns: string[];
        on_delete: string;
        target_schema: string;
        target_table: string;
      }>(
        `SELECT
           target_namespace.nspname AS target_schema,
           target_relation.relname AS target_table,
           constraint_definition.confdeltype AS on_delete,
           ARRAY(
             SELECT attribute.attname::text
             FROM unnest(constraint_definition.conkey) WITH ORDINALITY AS keys(attnum, position)
             JOIN pg_attribute attribute
               ON attribute.attrelid = constraint_definition.conrelid
              AND attribute.attnum = keys.attnum
             ORDER BY keys.position
           ) AS columns,
           ARRAY(
             SELECT attribute.attname::text
             FROM unnest(constraint_definition.confkey) WITH ORDINALITY AS keys(attnum, position)
             JOIN pg_attribute attribute
               ON attribute.attrelid = constraint_definition.confrelid
              AND attribute.attnum = keys.attnum
             ORDER BY keys.position
           ) AS foreign_columns
         FROM pg_constraint constraint_definition
         JOIN pg_class target_relation
           ON target_relation.oid = constraint_definition.confrelid
         JOIN pg_namespace target_namespace
           ON target_namespace.oid = target_relation.relnamespace
         WHERE constraint_definition.conrelid = $1::regclass
           AND constraint_definition.contype = 'f'`,
        [qualifiedName],
      );
      expect(constraints.rowCount, qualifiedName).toBe(
        definition.foreignKeys.length,
      );
      for (const foreignKey of definition.foreignKeys) {
        const reference = foreignKey.reference();
        const target = getTableConfig(reference.foreignTable);
        const expected = {
          columns: reference.columns.map((column) => column.name),
          foreign_columns: reference.foreignColumns.map(
            (column) => column.name,
          ),
          on_delete: onDeleteCodes[foreignKey.onDelete ?? 'no action'] ?? 'a',
          target_schema: target.schema,
          target_table: target.name,
        };
        expect(
          constraints.rows.some(
            (constraint) =>
              constraint.target_schema === expected.target_schema &&
              constraint.target_table === expected.target_table &&
              constraint.on_delete === expected.on_delete &&
              constraint.columns.join(',') === expected.columns.join(',') &&
              constraint.foreign_columns.join(',') ===
                expected.foreign_columns.join(','),
          ),
          `${qualifiedName} missing ${JSON.stringify(expected)}`,
        ).toBe(true);
      }

      const indexes = await migratedPool.query<{
        columns: string[];
        name: string;
      }>(
        `SELECT index_relation.relname AS name,
                ARRAY(
                  SELECT attribute.attname::text
                  FROM unnest(index_definition.indkey) WITH ORDINALITY AS keys(attnum, position)
                  JOIN pg_attribute attribute
                    ON attribute.attrelid = index_definition.indrelid
                   AND attribute.attnum = keys.attnum
                  ORDER BY keys.position
                ) AS columns
         FROM pg_index index_definition
         JOIN pg_class index_relation
           ON index_relation.oid = index_definition.indexrelid
         WHERE index_definition.indrelid = $1::regclass
           AND NOT index_definition.indisprimary
           AND NOT EXISTS (
             SELECT 1
             FROM pg_constraint constraint_definition
             WHERE constraint_definition.conindid = index_definition.indexrelid
           )
         ORDER BY index_relation.relname`,
        [qualifiedName],
      );
      const expectedIndexes = definition.indexes
        .map((index) => {
          const name = index.config.name;
          if (!name) {
            throw new Error(`${qualifiedName} has an unnamed index`);
          }
          return {
            name,
            columns: index.config.columns.map((column) => {
              if (!('name' in column)) {
                throw new Error(
                  `${qualifiedName}.${name} uses an unsupported index expression`,
                );
              }
              return column.name;
            }),
          };
        })
        .sort((left, right) => left.name.localeCompare(right.name));
      expect(indexes.rows, qualifiedName).toEqual(expectedIndexes);
    }

    const indexes = await migratedPool.query<{
      name: string;
      definition: string;
    }>(
      `SELECT indexname AS name, indexdef AS definition
       FROM pg_indexes
       WHERE schemaname = 'booking_app'
         AND indexname IN (
           'activities_center_created_id_idx',
           'slots_activity_starts_id_idx'
         )
       ORDER BY indexname`,
    );
    expect(
      indexes.rows.find(
        ({ name }) => name === 'activities_center_created_id_idx',
      )?.definition,
    ).toMatch(
      /activities.*tenant_id, center_id, created_at DESC NULLS LAST, id DESC NULLS LAST/,
    );
    expect(
      indexes.rows.find(({ name }) => name === 'slots_activity_starts_id_idx')
        ?.definition,
    ).toMatch(/slots.*tenant_id, center_id, activity_id, starts_at, id/);
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
    const before = await requireEmptyAdminPool(emptyAdminPool).query<{
      count: string;
    }>(`SELECT count(*)::text AS count FROM drizzle.__drizzle_migrations`);
    await expect(migrateProduct(tempFolder, emptyUrl)).rejects.toThrow();

    const leftover = await requireEmptyAdminPool(emptyAdminPool).query<{
      to_regclass: string | null;
    }>(`SELECT to_regclass('iam_app.should_not_exist')`);
    expect(leftover.rows[0]?.to_regclass).toBeNull();

    const after = await requireEmptyAdminPool(emptyAdminPool).query<{
      count: string;
    }>(`SELECT count(*)::text AS count FROM drizzle.__drizzle_migrations`);
    expect(after.rows[0]?.count).toBe(before.rows[0]?.count);
  });
});
