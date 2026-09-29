import type { PoolConfig } from 'pg';

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing ${name}. Configure the database URLs documented in .env.example.`,
    );
  }
  return value;
}

function requiredPositiveIntegerEnv(name: string): number {
  const value = requiredEnv(name);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive safe integer.`);
  }
  return parsed;
}

export function appDatabaseUrl(): string {
  return requiredEnv('APP_DATABASE_URL');
}

function runtimePoolConfig(): Omit<PoolConfig, 'connectionString'> {
  return {
    max: requiredPositiveIntegerEnv('APP_DATABASE_POOL_MAX'),
    connectionTimeoutMillis: requiredPositiveIntegerEnv(
      'APP_DATABASE_CONNECTION_TIMEOUT_MS',
    ),
    statement_timeout: requiredPositiveIntegerEnv(
      'APP_DATABASE_STATEMENT_TIMEOUT_MS',
    ),
    lock_timeout: requiredPositiveIntegerEnv('APP_DATABASE_LOCK_TIMEOUT_MS'),
    idle_in_transaction_session_timeout: requiredPositiveIntegerEnv(
      'APP_DATABASE_IDLE_IN_TRANSACTION_SESSION_TIMEOUT_MS',
    ),
  };
}

export function appDatabasePoolConfig(): PoolConfig {
  return {
    ...runtimePoolConfig(),
    connectionString: appDatabaseUrl(),
  };
}

export function workerDatabaseUrl(): string {
  return requiredEnv('WORKER_DATABASE_URL');
}

export function workerDatabasePoolConfig(): PoolConfig {
  return {
    ...runtimePoolConfig(),
    connectionString: workerDatabaseUrl(),
  };
}

export function migrationDatabaseUrl(): string {
  return requiredEnv('MIGRATION_DATABASE_URL');
}

export function spikeAdminDatabaseUrl(): string {
  return requiredEnv('SPIKE_ADMIN_DATABASE_URL');
}

export function spikeAppDatabaseUrl(): string {
  return requiredEnv('SPIKE_APP_DATABASE_URL');
}

export function spikeWorkerDatabaseUrl(): string {
  return requiredEnv('SPIKE_WORKER_DATABASE_URL');
}

export function spikePlatformAdminDatabaseUrl(): string {
  return requiredEnv('SPIKE_PLATFORM_ADMIN_DATABASE_URL');
}

export function spikeAppPassword(): string {
  return process.env.SPIKE_APP_PASSWORD ?? 'dive_app';
}

export function spikeMigrationPassword(): string {
  return process.env.SPIKE_MIGRATION_PASSWORD ?? 'dive_migration';
}

export function spikeWorkerPassword(): string {
  return process.env.SPIKE_WORKER_PASSWORD ?? 'dive_worker';
}

export function spikePlatformAdminPassword(): string {
  return process.env.SPIKE_PLATFORM_ADMIN_PASSWORD ?? 'dive_platform_admin';
}
