import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { appDatabasePoolConfig } from '../../src/env.js';
import { centerA1, createAdminPool, setupHarness, tenantA } from './harness.js';

describe('REL-01 PostgreSQL operability', () => {
  let adminPool: Pool;
  let configuredPool: Pool;

  beforeAll(async () => {
    adminPool = createAdminPool();
    configuredPool = new Pool(appDatabasePoolConfig());
    await setupHarness(adminPool);
  });

  afterAll(async () => {
    await configuredPool.end();
    await adminPool.end();
  });

  it('applies the configured runtime limits to PostgreSQL', async () => {
    const config = appDatabasePoolConfig();
    const result = await configuredPool.query<{
      name: string;
      setting: string;
    }>(
      `SELECT name, setting
       FROM pg_settings
       WHERE name = ANY($1::text[])`,
      [
        [
          'statement_timeout',
          'lock_timeout',
          'idle_in_transaction_session_timeout',
        ],
      ],
    );
    const settings = new Map(
      result.rows.map(({ name, setting }) => [name, Number(setting)]),
    );

    expect(config.max).toBeGreaterThan(0);
    expect(settings.get('statement_timeout')).toBe(config.statement_timeout);
    expect(settings.get('lock_timeout')).toBe(config.lock_timeout);
    expect(settings.get('idle_in_transaction_session_timeout')).toBe(
      config.idle_in_transaction_session_timeout,
    );
  });

  it('cancels a statement that exceeds statement_timeout', async () => {
    const timeoutPool = new Pool({
      ...appDatabasePoolConfig(),
      max: 1,
      statement_timeout: 50,
      lock_timeout: 50,
      idle_in_transaction_session_timeout: 50,
    });

    try {
      await expect(
        timeoutPool.query('SELECT pg_sleep(0.2)'),
      ).rejects.toMatchObject({
        code: '57014',
      });
    } finally {
      await timeoutPool.end();
    }
  });

  it('bounds checkout wait when the pool is saturated', async () => {
    const saturatedPool = new Pool({
      ...appDatabasePoolConfig(),
      max: 1,
      connectionTimeoutMillis: 50,
    });
    const heldClient = await saturatedPool.connect();

    try {
      await expect(saturatedPool.connect()).rejects.toThrow();
    } finally {
      heldClient.release();
      await saturatedPool.end();
    }
  });

  it('cancels lock contention and releases the blocked transaction', async () => {
    const lockPool = new Pool({
      ...appDatabasePoolConfig(),
      max: 1,
      statement_timeout: 1_000,
      lock_timeout: 50,
      idle_in_transaction_session_timeout: 1_000,
    });
    const lockOwner = await adminPool.connect();
    const blockedClient = await lockPool.connect();

    try {
      await lockOwner.query('BEGIN');
      await lockOwner.query(
        'SELECT id FROM mt_spike.centers WHERE id = $1 FOR UPDATE',
        [centerA1],
      );

      await blockedClient.query('BEGIN');
      await blockedClient.query(
        `SELECT set_config('app.tenant_id', $1, true)`,
        [tenantA],
      );
      await expect(
        blockedClient.query(
          'SELECT id FROM mt_spike.centers WHERE id = $1 FOR UPDATE',
          [centerA1],
        ),
      ).rejects.toMatchObject({ code: '55P03' });
      await blockedClient.query('ROLLBACK');
    } finally {
      await lockOwner.query('ROLLBACK').catch(() => undefined);
      blockedClient.release();
      lockOwner.release();
      await lockPool.end();
    }
  });

  it('terminates an idle transaction before the client is reused', async () => {
    const timeoutPool = new Pool({
      ...appDatabasePoolConfig(),
      max: 1,
      statement_timeout: 1_000,
      lock_timeout: 1_000,
      idle_in_transaction_session_timeout: 50,
    });
    const client = await timeoutPool.connect();
    client.on('error', () => undefined);

    try {
      await client.query('BEGIN');
      await new Promise((resolve) => setTimeout(resolve, 100));
      await expect(client.query('SELECT 1')).rejects.toThrow();
    } finally {
      client.release(true);
      await timeoutPool.end();
    }
  });
});
