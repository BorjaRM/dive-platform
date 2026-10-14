import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  appDatabaseUrl,
  migrationDatabaseUrl,
  workerDatabaseUrl,
} from './env.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

const runtimeUrls = [
  ['APP_DATABASE_URL', appDatabaseUrl],
  ['WORKER_DATABASE_URL', workerDatabaseUrl],
  ['MIGRATION_DATABASE_URL', migrationDatabaseUrl],
] as const;

describe('production database destination safety', () => {
  it.each(runtimeUrls)('accepts a private production URL for %s', (_, read) => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv(
      'APP_DATABASE_URL',
      'postgres://dive_app:secret@postgres.internal.example/product',
    );
    vi.stubEnv(
      'WORKER_DATABASE_URL',
      'postgres://dive_worker:secret@postgres.internal.example/product',
    );
    vi.stubEnv(
      'MIGRATION_DATABASE_URL',
      'postgres://dive_migration:secret@postgres.internal.example/product',
    );
    expect(read()).toContain('postgres.internal.example/product');
  });

  for (const [name, read] of runtimeUrls) {
    it.each([
      ['local host', `postgres://role:secret@localhost/product`],
      ['development database', `postgres://role:secret@db.internal/dive_spike`],
      ['test database', `postgres://role:secret@db.internal/dive_test`],
    ])('rejects %s for %s', (_, value) => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv(name, value);
      expect(() => read()).toThrow(
        `${name} must not target a local or test database in production.`,
      );
    });
  }
});
