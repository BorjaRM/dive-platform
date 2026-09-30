import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import {
  assertLocalDatabaseEnvironment,
  resetLocalDatabase,
} from './reset-local-database.mjs';

const environment = {
  NODE_ENV: 'development',
  APP_DATABASE_URL: 'postgres://dive_app:secret@localhost:55432/dive_spike',
  WORKER_DATABASE_URL:
    'postgres://dive_worker:secret@localhost:55432/dive_spike',
  MIGRATION_DATABASE_URL:
    'postgres://dive_migration:secret@localhost:55432/dive_spike',
  SPIKE_ADMIN_DATABASE_URL:
    'postgres://postgres:secret@localhost:55432/dive_spike',
};

test('accepts only the configured local development database', () => {
  assert.doesNotThrow(() => assertLocalDatabaseEnvironment(environment));
  for (const host of ['127.0.0.1', '[::1]']) {
    assert.doesNotThrow(() =>
      assertLocalDatabaseEnvironment({
        ...environment,
        APP_DATABASE_URL: `postgresql://dive_app:secret@${host}:55432/dive_spike`,
      }),
    );
  }
});

for (const mode of ['production', 'test', undefined]) {
  test(`rejects NODE_ENV=${mode}`, () => {
    assert.throws(() =>
      assertLocalDatabaseEnvironment({ ...environment, NODE_ENV: mode }),
    );
  });
}

for (const name of Object.keys(environment).filter((name) =>
  name.endsWith('_URL'),
)) {
  for (const [label, change] of [
    [
      'remote host',
      (url) => {
        url.hostname = 'database.example.test';
      },
    ],
    [
      'different port',
      (url) => {
        url.port = '5432';
      },
    ],
    [
      'another database',
      (url) => {
        url.pathname = '/dive_validation';
      },
    ],
    [
      'administrative database',
      (url) => {
        url.pathname = '/postgres';
      },
    ],
    [
      'wrong role',
      (url) => {
        url.username = 'unexpected';
      },
    ],
    [
      'query override',
      (url) => {
        url.search = '?host=database.example.test';
      },
    ],
    [
      'fragment',
      (url) => {
        url.hash = '#unexpected';
      },
    ],
    [
      'wrong protocol',
      (url) => {
        url.protocol = 'mysql:';
      },
    ],
  ]) {
    test(`${name} rejects ${label} without leaking credentials`, () => {
      const url = new URL(environment[name]);
      change(url);
      assert.throws(
        () =>
          assertLocalDatabaseEnvironment({ ...environment, [name]: url.href }),
        (error) =>
          error.message.includes(name) && !error.message.includes('secret'),
      );
    });
  }
  for (const value of [undefined, 'invalid']) {
    test(`${name} rejects missing or malformed value: ${value}`, () => {
      assert.throws(() =>
        assertLocalDatabaseEnvironment({ ...environment, [name]: value }),
      );
    });
  }
}

test('invalid configuration never prompts or executes commands', async () => {
  await assert.rejects(
    resetLocalDatabase({
      environment: { ...environment, NODE_ENV: 'production' },
      confirm: () => assert.fail('must not prompt'),
      createClient: () => assert.fail('must not connect'),
      run: () => assert.fail('must not run commands'),
    }),
  );
});

test('requires the exact database name before any command', async () => {
  for (const answer of ['', 'yes', 'dive_validation', 'dive_spike ']) {
    await assert.rejects(
      resetLocalDatabase({
        environment,
        confirm: async () => answer,
        createClient: () => assert.fail('must not connect'),
        run: () => assert.fail('must not run commands'),
      }),
      /cancelled/,
    );
  }
});

test('recreates only dive_spike then reuses bootstrap and migrations with local env', async () => {
  const calls = [];
  const queries = [];
  let connectionString;
  let closed = false;
  await resetLocalDatabase({
    environment,
    confirm: async () => 'dive_spike',
    createClient: (config) => {
      connectionString = config.connectionString;
      return {
        connect: async () => {},
        query: async (sql) => queries.push(sql),
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
    'DROP DATABASE IF EXISTS "dive_spike";',
    'CREATE DATABASE "dive_spike";',
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
  for (const call of calls) assert.equal(call[2], environment);
});

test('stops immediately on SQL or child command failure and closes the connection', async () => {
  for (const failAt of [1, 2, 3, 4]) {
    let calls = 0;
    let closed = false;
    const operation = () => {
      calls += 1;
      if (calls === failAt) throw new Error('command failed');
    };
    await assert.rejects(
      resetLocalDatabase({
        environment,
        confirm: async () => 'dive_spike',
        createClient: () => ({
          connect: async () => {},
          query: async () => operation(),
          end: async () => {
            closed = true;
          },
        }),
        run: operation,
      }),
      /command failed/,
    );
    assert.equal(calls, failAt);
    assert.equal(closed, true);
  }
});

test('CLI refuses a non-interactive reset before opening a database connection', () => {
  const result = spawnSync(
    process.execPath,
    [new URL('./reset-local-database.mjs', import.meta.url).pathname],
    { env: { ...process.env, ...environment }, encoding: 'utf8' },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /interactive confirmation/);
});
