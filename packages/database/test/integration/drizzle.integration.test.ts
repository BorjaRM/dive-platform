import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { getTableConfig } from 'drizzle-orm/pg-core';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import * as schema from '../../src/schema.js';
import { notes } from '../../src/schema.js';
import { type TenantUnitOfWork, withTenant } from '../../src/unit-of-work.js';
import {
  centerA1,
  createAdminPool,
  createAppPool,
  setupHarness,
  tenantA,
  tenantB,
  truncateTenantData,
} from './harness.js';

const tables = [
  schema.tenants,
  schema.identities,
  schema.centers,
  schema.notes,
  schema.outboxEvents,
  schema.auditRecords,
  schema.consumerReceipts,
  schema.memberships,
];

const onDeleteCodes: Record<string, string> = {
  cascade: 'c',
  'no action': 'a',
  restrict: 'r',
  'set default': 'd',
  'set null': 'n',
};

describe('MT-SPIKE-001 drizzle', () => {
  let adminPool: Pool;
  let appPool: Pool;

  beforeAll(async () => {
    adminPool = createAdminPool();
    appPool = createAppPool();
    await setupHarness(adminPool);
  });

  beforeEach(async () => {
    await truncateTenantData(adminPool);
  });

  afterAll(async () => {
    await appPool.end();
    await adminPool.end();
  });

  it('keeps Drizzle columns and foreign keys aligned with PostgreSQL (MT-REQ-001, MT-REQ-003)', async () => {
    for (const table of tables) {
      const definition = getTableConfig(table);
      const qualifiedName = `${definition.schema}.${definition.name}`;

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
            not_null: column.notNull,
          }))
          .sort((left, right) => left.name.localeCompare(right.name)),
      );

      const constraints = await adminPool.query<{
        columns: string[];
        foreign_columns: string[];
        on_delete: string;
        target_schema: string;
        target_table: string;
      }>(
        `SELECT
           nsp.nspname AS target_schema,
           rel.relname AS target_table,
           con.confdeltype AS on_delete,
           ARRAY(
             SELECT att.attname::text
             FROM unnest(con.conkey) WITH ORDINALITY AS keys(attnum, position)
             JOIN pg_attribute att
               ON att.attrelid = con.conrelid AND att.attnum = keys.attnum
             ORDER BY keys.position
           ) AS columns,
           ARRAY(
             SELECT att.attname::text
             FROM unnest(con.confkey) WITH ORDINALITY AS keys(attnum, position)
             JOIN pg_attribute att
               ON att.attrelid = con.confrelid AND att.attnum = keys.attnum
             ORDER BY keys.position
           ) AS foreign_columns
         FROM pg_constraint con
         JOIN pg_class rel ON rel.oid = con.confrelid
         JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
         WHERE con.conrelid = $1::regclass
           AND con.contype = 'f'`,
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
            (row) => JSON.stringify(row) === JSON.stringify(expected),
          ),
          `${qualifiedName} missing ${JSON.stringify(expected)}`,
        ).toBe(true);
      }
    }
  });

  it('fails closed for Drizzle queries outside the unit of work (MT-REQ-006)', async () => {
    const db = drizzle(appPool, { schema });
    await expect(db.select().from(notes)).rejects.toThrow();
    await expect(
      db.insert(notes).values({
        id: 'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1',
        tenantId: tenantA,
        centerId: centerA1,
        body: 'outside-uow',
      }),
    ).rejects.toThrow();
  });

  it('keeps parameterized SQL through Drizzle tenant-scoped (MT-REQ-006, MT-REQ-009)', async () => {
    await withTenant(appPool, tenantA, async ({ db }) => {
      await db.insert(notes).values({
        id: 'd2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d2d2',
        tenantId: tenantA,
        centerId: centerA1,
        body: 'via-sql',
      });
      const rows = await db.execute(sql`select tenant_id from mt_spike.notes`);
      expect(rows.rows).toEqual([{ tenant_id: tenantA }]);
    });

    const visibleToB = await withTenant(appPool, tenantB, async ({ db }) => {
      return db.execute(sql`select tenant_id from mt_spike.notes`);
    });
    expect(visibleToB.rows).toEqual([]);
  });

  it('rejects a Drizzle handle escaped after the unit of work (MT-REQ-005, MT-REQ-006)', async () => {
    let escaped: TenantUnitOfWork['db'] | undefined;
    await withTenant(appPool, tenantA, async ({ db }) => {
      escaped = db;
    });
    await expect(escaped?.select().from(notes)).rejects.toThrow();
  });
});
