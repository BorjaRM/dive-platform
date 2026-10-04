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
import * as onboardingSchema from '../../src/onboarding-schema.js';
import {
  centerA1,
  createAdminPool,
  createAppPool,
  tenantA,
} from './harness.js';

const iamTables = [
  iamSchema.iamTenants,
  iamSchema.iamIdentities,
  iamSchema.iamExternalIdentities,
  iamSchema.iamIdentityWebhookInbox,
  iamSchema.iamCenters,
  iamSchema.iamCenterEntries,
  iamSchema.iamMemberships,
  iamSchema.iamIdentityTenants,
  iamSchema.iamTenantContexts,
  iamSchema.iamInvitations,
  iamSchema.iamAuditRecords,
  iamSchema.iamOutboxEvents,
];
const bookingTables = [
  bookingSchema.bookingCatalogSettings,
  bookingSchema.bookingActivities,
  bookingSchema.bookingSlots,
  bookingSchema.bookingChannels,
  bookingSchema.bookingBookings,
  bookingSchema.bookingCapabilityVerifiers,
];
const onboardingTables = [
  onboardingSchema.onboardingPlatformPrincipals,
  onboardingSchema.onboardingPlatformCapabilities,
  onboardingSchema.onboardingBootstrapRateLimits,
  onboardingSchema.onboardingBootstrapGrants,
  onboardingSchema.onboardingCommandReceipts,
  onboardingSchema.onboardingAuditRecords,
  onboardingSchema.onboardingOutboxEvents,
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
      `SELECT nspname FROM pg_namespace WHERE nspname IN ('booking_app', 'iam_app', 'mt_spike', 'onboarding_app') ORDER BY nspname`,
    );
    expect(schemas.rows.map((row) => row.nspname)).toEqual([
      'booking_app',
      'iam_app',
      'onboarding_app',
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
    const migrationJournal = JSON.parse(
      readFileSync(join(productMigrationsFolder, 'meta/_journal.json'), 'utf8'),
    ) as { entries: unknown[] };
    expect(after.rows[0]?.count).toBe(before.rows[0]?.count);
    expect(Number(after.rows[0]?.count)).toBe(migrationJournal.entries.length);
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

  it('rejects nonempty catalog upgrades atomically instead of inventing a base language (DIVE-BOOK-REQ-009, 051)', async () => {
    const databaseName = 'dive_migrate_catalog_nonempty';
    const tempFolder = mkdtempSync(join(tmpdir(), 'dive-migrate-catalog-'));
    const journal = JSON.parse(
      readFileSync(join(productMigrationsFolder, 'meta/_journal.json'), 'utf8'),
    ) as {
      entries: Array<{ tag: string }>;
    };
    const catalogMigrationIndex = journal.entries.findIndex(
      (entry) => entry.tag === '0007_center_catalog_language',
    );
    if (catalogMigrationIndex < 0) {
      throw new Error('Missing catalog language migration');
    }
    journal.entries = journal.entries.slice(0, catalogMigrationIndex);
    mkdirSync(join(tempFolder, 'meta'));
    writeFileSync(
      join(tempFolder, 'meta/_journal.json'),
      JSON.stringify(journal),
    );
    for (const entry of journal.entries) {
      writeFileSync(
        join(tempFolder, `${entry.tag}.sql`),
        readFileSync(join(productMigrationsFolder, `${entry.tag}.sql`), 'utf8'),
      );
    }
    const maintenance = new Pool({
      connectionString: spikeAdminDatabaseUrl(),
      max: 1,
    });
    let priorAdmin: Pool | undefined;
    try {
      await maintenance.query(`DROP DATABASE IF EXISTS ${databaseName}`);
      await maintenance.query(`CREATE DATABASE ${databaseName}`);
      await maintenance.query(
        `GRANT CONNECT, CREATE ON DATABASE ${databaseName} TO dive_migration`,
      );
      const migrationUrl = urlForDatabase(migrationDatabaseUrl(), databaseName);
      await migrateProduct(tempFolder, migrationUrl);
      priorAdmin = new Pool({
        connectionString: urlForDatabase(spikeAdminDatabaseUrl(), databaseName),
        max: 1,
      });
      await priorAdmin.query(
        `INSERT INTO iam_app.tenants(id, name) VALUES ($1, 'Existing operator')`,
        [tenantA],
      );
      await priorAdmin.query(
        `INSERT INTO iam_app.centers(id, tenant_id, name) VALUES ($1, $2, 'Existing center')`,
        [centerA1, tenantA],
      );
      await priorAdmin.query(
        `INSERT INTO booking_app.activities(id, tenant_id, center_id, name, status) VALUES (gen_random_uuid(), $1, $2, '{"es":"Existing activity"}'::jsonb, 'Draft')`,
        [tenantA, centerA1],
      );
      await expect(
        migrateProduct(productMigrationsFolder, migrationUrl),
      ).rejects.toThrow(/ADD COLUMN "base_locale"/);
      const preserved = await priorAdmin.query(
        'SELECT name FROM booking_app.activities',
      );
      expect(preserved.rows).toEqual([{ name: { es: 'Existing activity' } }]);
      const configuration = await priorAdmin.query(
        `SELECT to_regclass('booking_app.catalog_settings') AS relation`,
      );
      expect(configuration.rows).toEqual([{ relation: null }]);
      const columns = await priorAdmin.query(
        `SELECT column_name FROM information_schema.columns WHERE table_schema='booking_app' AND table_name='activities' AND column_name='base_locale'`,
      );
      expect(columns.rows).toEqual([]);
      const migrations = await priorAdmin.query(
        'SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations',
      );
      expect(migrations.rows).toEqual([{ count: journal.entries.length }]);
    } finally {
      await priorAdmin?.end();
      await maintenance.query(`DROP DATABASE IF EXISTS ${databaseName}`);
      await maintenance.end();
      rmSync(tempFolder, { recursive: true, force: true });
    }
  });

  it.each([false, true])(
    'upgrades legacy bootstrap receipts without rewriting audits (invalid reason: %s; DIVE-ONB-REQ-039..040)',
    async (invalidReason) => {
      const databaseName = `dive_migrate_bootstrap_${invalidReason ? 'invalid' : 'valid'}`;
      const tempFolder = mkdtempSync(join(tmpdir(), 'dive-migrate-bootstrap-'));
      const journal = JSON.parse(
        readFileSync(
          join(productMigrationsFolder, 'meta/_journal.json'),
          'utf8',
        ),
      ) as { entries: Array<{ tag: string }> };
      const reasonMigrationIndex = journal.entries.findIndex(
        (entry) => entry.tag === '0012_small_kabuki',
      );
      if (reasonMigrationIndex < 0)
        throw new Error('Missing bootstrap reason migration');
      journal.entries = journal.entries.slice(0, reasonMigrationIndex);
      mkdirSync(join(tempFolder, 'meta'));
      writeFileSync(
        join(tempFolder, 'meta/_journal.json'),
        JSON.stringify(journal),
      );
      for (const entry of journal.entries) {
        writeFileSync(
          join(tempFolder, `${entry.tag}.sql`),
          readFileSync(
            join(productMigrationsFolder, `${entry.tag}.sql`),
            'utf8',
          ),
        );
      }
      const maintenance = new Pool({
        connectionString: spikeAdminDatabaseUrl(),
        max: 1,
      });
      let priorAdmin: Pool | undefined;
      try {
        await maintenance.query(`DROP DATABASE IF EXISTS ${databaseName}`);
        await maintenance.query(`CREATE DATABASE ${databaseName}`);
        await maintenance.query(
          `GRANT CONNECT, CREATE ON DATABASE ${databaseName} TO dive_migration`,
        );
        const migrationUrl = urlForDatabase(
          migrationDatabaseUrl(),
          databaseName,
        );
        await migrateProduct(tempFolder, migrationUrl);
        priorAdmin = new Pool({
          connectionString: urlForDatabase(
            spikeAdminDatabaseUrl(),
            databaseName,
          ),
          max: 1,
        });
        for (const capability of ['issue', 'reissue']) {
          await priorAdmin.query(
            `SELECT onboarding_app.set_platform_capability($1, $2, $3, true)`,
            [
              'https://identity.example.test',
              'platform-operator',
              `bootstrap_invitation.${capability}`,
            ],
          );
        }
        const issueParameters = [
          'https://identity.example.test',
          'platform-operator',
          'owner@example.test',
          'Original reason',
          'legacy-issue',
          'a'.repeat(64),
          tenantA,
        ];
        const issueSql = `SELECT onboarding_app.issue_bootstrap_invitation_command(
          $1, $2, $3, $4, $5, $6, $7::uuid
        ) AS outcome`;
        const issued = await priorAdmin.query<{
          outcome: { invitationId: string };
        }>(issueSql, issueParameters);
        await priorAdmin.query(
          `SELECT onboarding_app.reissue_bootstrap_invitation_command(
            $1, $2, $3::uuid, $4, $5, $6, $7::uuid
          )`,
          [
            issueParameters[0],
            issueParameters[1],
            issued.rows[0]?.outcome.invitationId,
            invalidReason ? '' : 'Replacement reason',
            'legacy-reissue',
            'b'.repeat(64),
            tenantA,
          ],
        );
        const auditSql = `SELECT id, action, reason FROM onboarding_app.bootstrap_invitation_audit_records ORDER BY id`;
        const originalAudits = await priorAdmin.query(auditSql);
        if (invalidReason) {
          await expect(
            migrateProduct(productMigrationsFolder, migrationUrl),
          ).rejects.toThrow(/VALIDATE CONSTRAINT/);
          const receipts = await priorAdmin.query(
            `SELECT result FROM onboarding_app.bootstrap_invitation_command_receipts`,
          );
          for (const receipt of receipts.rows)
            expect(receipt.result).not.toHaveProperty('destinationEmail');
        } else {
          await migrateProduct(productMigrationsFolder, migrationUrl);
          const receipts = await priorAdmin.query(
            `SELECT result FROM onboarding_app.bootstrap_invitation_command_receipts`,
          );
          expect(receipts.rows).toHaveLength(2);
          for (const receipt of receipts.rows)
            expect(receipt.result.destinationEmail).toBe('owner@example.test');
          const replay = await priorAdmin.query(issueSql, issueParameters);
          expect(replay.rows[0]?.outcome).toEqual({
            ...issued.rows[0]?.outcome,
            destinationEmail: 'owner@example.test',
          });
          const constraints =
            await priorAdmin.query(`SELECT convalidated FROM pg_constraint
            WHERE conname='bootstrap_invitation_audit_mutation_reason_required'
              AND conrelid='onboarding_app.bootstrap_invitation_audit_records'::regclass`);
          expect(constraints.rows).toEqual([{ convalidated: true }]);
        }
        expect((await priorAdmin.query(auditSql)).rows).toEqual(
          originalAudits.rows,
        );
      } finally {
        await priorAdmin?.end();
        await maintenance.query(`DROP DATABASE IF EXISTS ${databaseName}`);
        await maintenance.end();
        rmSync(tempFolder, { recursive: true, force: true });
      }
    },
  );

  it('upgrades existing activities with revision 1 and preserves data on schema rollback (DIVE-BOOK-REQ-078)', async () => {
    const databaseName = 'dive_migrate_activity_revision';
    const tempFolder = mkdtempSync(join(tmpdir(), 'dive-migrate-revision-'));
    const journal = JSON.parse(
      readFileSync(join(productMigrationsFolder, 'meta/_journal.json'), 'utf8'),
    ) as { entries: Array<{ tag: string }> };
    const revisionIndex = journal.entries.findIndex(
      ({ tag }) => tag === '0009_activity_revision',
    );
    if (revisionIndex < 0)
      throw new Error('Missing activity revision migration');
    journal.entries = journal.entries.slice(0, revisionIndex);
    mkdirSync(join(tempFolder, 'meta'));
    writeFileSync(
      join(tempFolder, 'meta/_journal.json'),
      JSON.stringify(journal),
    );
    for (const entry of journal.entries) {
      writeFileSync(
        join(tempFolder, `${entry.tag}.sql`),
        readFileSync(join(productMigrationsFolder, `${entry.tag}.sql`), 'utf8'),
      );
    }
    const maintenance = new Pool({
      connectionString: spikeAdminDatabaseUrl(),
      max: 1,
    });
    let priorAdmin: Pool | undefined;
    try {
      await maintenance.query(`DROP DATABASE IF EXISTS ${databaseName}`);
      await maintenance.query(`CREATE DATABASE ${databaseName}`);
      await maintenance.query(
        `GRANT CONNECT, CREATE ON DATABASE ${databaseName} TO dive_migration`,
      );
      const migrationUrl = urlForDatabase(migrationDatabaseUrl(), databaseName);
      await migrateProduct(tempFolder, migrationUrl);
      priorAdmin = new Pool({
        connectionString: urlForDatabase(spikeAdminDatabaseUrl(), databaseName),
        max: 1,
      });
      await priorAdmin.query(
        `INSERT INTO iam_app.tenants(id,name) VALUES ($1,'Existing')`,
        [tenantA],
      );
      await priorAdmin.query(
        `INSERT INTO iam_app.centers(id,tenant_id,name) VALUES ($1,$2,'Existing')`,
        [centerA1, tenantA],
      );
      await priorAdmin.query(
        `INSERT INTO booking_app.activities(id,tenant_id,center_id,base_locale,name,description,default_capacity,status) VALUES (gen_random_uuid(),$1,$2,'es','{"es":"Original","en":"Existing"}','{"en":"Description"}',5,'Disabled')`,
        [tenantA, centerA1],
      );
      const before = (
        await priorAdmin.query('SELECT * FROM booking_app.activities')
      ).rows;
      await migrateProduct(productMigrationsFolder, migrationUrl);
      const upgraded = (
        await priorAdmin.query('SELECT * FROM booking_app.activities')
      ).rows;
      expect(upgraded).toEqual(
        before.map((activity) => ({ ...activity, revision: '1' })),
      );
      const column = await priorAdmin.query(
        `SELECT data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='booking_app' AND table_name='activities' AND column_name='revision'`,
      );
      expect(column.rows).toEqual([
        { data_type: 'bigint', is_nullable: 'NO', column_default: '1' },
      ]);
      await priorAdmin.query('BEGIN');
      await priorAdmin.query(
        'ALTER TABLE booking_app.activities DROP COLUMN revision',
      );
      expect(
        (await priorAdmin.query('SELECT * FROM booking_app.activities')).rows,
      ).toEqual(before);
      await priorAdmin.query('ROLLBACK');
      expect(
        (await priorAdmin.query('SELECT * FROM booking_app.activities')).rows,
      ).toEqual(upgraded);
    } finally {
      await priorAdmin?.end();
      await maintenance.query(`DROP DATABASE IF EXISTS ${databaseName}`);
      await maintenance.end();
      rmSync(tempFolder, { recursive: true, force: true });
    }
  });

  it('persists catalog languages without database defaults (DIVE-BOOK-REQ-009, 051)', async () => {
    const columns = await requireEmptyAdminPool(emptyAdminPool).query(
      `SELECT table_name, column_name, column_default, is_nullable FROM information_schema.columns WHERE table_schema='booking_app' AND (table_name='activities' AND column_name='base_locale' OR table_name='catalog_settings' AND column_name='default_activity_locale') ORDER BY table_name`,
    );
    expect(columns.rows).toEqual([
      {
        table_name: 'activities',
        column_name: 'base_locale',
        column_default: null,
        is_nullable: 'NO',
      },
      {
        table_name: 'catalog_settings',
        column_name: 'default_activity_locale',
        column_default: null,
        is_nullable: 'NO',
      },
    ]);
  });

  it('keeps Drizzle product columns aligned with PostgreSQL', async () => {
    const migratedPool = requireEmptyAdminPool(emptyAdminPool);
    for (const table of [...iamTables, ...bookingTables, ...onboardingTables]) {
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
    for (const table of [...iamTables, ...bookingTables, ...onboardingTables]) {
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
