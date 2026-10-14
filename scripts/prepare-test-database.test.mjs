import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertTestDatabaseIsolation } from './assert-test-database.mjs';
import {
  assertTestDatabaseEnvironment,
  prepareTestDatabase,
} from './prepare-test-database.mjs';

const environment = {
  NODE_ENV: 'development',
  SPIKE_ADMIN_DATABASE_URL:
    'postgres://postgres:secret@localhost:55432/dive_test',
  SPIKE_APP_DATABASE_URL:
    'postgres://dive_app:secret@localhost:55432/dive_test',
  SPIKE_WORKER_DATABASE_URL:
    'postgres://dive_worker:secret@localhost:55432/dive_test',
  SPIKE_PLATFORM_ADMIN_DATABASE_URL:
    'postgres://dive_platform_admin:secret@localhost:55432/dive_test',
  MIGRATION_DATABASE_URL:
    'postgres://dive_migration:secret@localhost:55432/dive_test',
  APP_DATABASE_URL: 'postgres://dive_app:secret@localhost:55432/dive_test',
  WORKER_DATABASE_URL:
    'postgres://dive_worker:secret@localhost:55432/dive_test',
};

test('accepts only the configured local test database', () => {
  assert.doesNotThrow(() => assertTestDatabaseEnvironment(environment));
  assert.doesNotThrow(() =>
    assertTestDatabaseEnvironment({
      ...environment,
      SPIKE_ADMIN_DATABASE_URL:
        'postgresql://postgres:secret@127.0.0.1:55432/dive_test',
    }),
  );
});

for (const [name, value] of [
  [
    'SPIKE_APP_DATABASE_URL',
    'postgres://dive_app:secret@localhost:55432/dive_spike',
  ],
  [
    'MIGRATION_DATABASE_URL',
    'postgres://dive_migration:secret@database.test:55432/dive_test',
  ],
]) {
  test(`rejects unsafe ${name} configuration`, () => {
    assert.throws(
      () => assertTestDatabaseEnvironment({ ...environment, [name]: value }),
      new RegExp(name),
    );
  });
}

test('refuses the local development database for integration tests', () => {
  assert.doesNotThrow(() => assertTestDatabaseIsolation(environment));
  assert.throws(
    () =>
      assertTestDatabaseIsolation({
        ...environment,
        APP_DATABASE_URL:
          'postgres://dive_app:secret@localhost:55432/dive_spike',
      }),
    /APP_DATABASE_URL/,
  );
});

test('creates a missing test database and applies bootstrap and migrations', async () => {
  const queries = [];
  const calls = [];
  let connectionString;
  let closed = false;
  await prepareTestDatabase({
    environment,
    createClient: (config) => {
      connectionString = config.connectionString;
      return {
        connect: async () => {},
        query: async (sql, params) => {
          queries.push([sql, params]);
          return { rows: [] };
        },
        end: async () => {
          closed = true;
        },
      };
    },
    run: (...args) => calls.push(args),
  });
  assert.equal(
    connectionString,
    'postgres://postgres:secret@localhost:55432/postgres',
  );
  assert.deepEqual(queries, [
    ['SELECT 1 FROM pg_database WHERE datname = $1', ['dive_test']],
    ['CREATE DATABASE "dive_test";', undefined],
  ]);
  assert.equal(closed, true);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].slice(0, 2), [
    process.execPath,
    ['--run', 'db:bootstrap'],
  ]);
  assert.deepEqual(calls[1].slice(0, 2), [
    process.execPath,
    ['--run', 'db:migrate'],
  ]);
});

test('does not recreate an existing test database', async () => {
  const queries = [];
  await prepareTestDatabase({
    environment,
    createClient: () => ({
      connect: async () => {},
      query: async (sql, params) => {
        queries.push([sql, params]);
        return { rows: [{ '?column?': 1 }] };
      },
      end: async () => {},
    }),
    run: () => {},
  });
  assert.deepEqual(queries, [
    ['SELECT 1 FROM pg_database WHERE datname = $1', ['dive_test']],
  ]);
});
