function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing ${name}. Start infra/docker/postgres and export SPIKE_* URLs from .env.example.`,
    );
  }
  return value;
}

export function spikeAdminDatabaseUrl(): string {
  return requiredEnv('SPIKE_ADMIN_DATABASE_URL');
}

export function spikeAppDatabaseUrl(): string {
  return requiredEnv('SPIKE_APP_DATABASE_URL');
}

export function spikeAppPassword(): string {
  return process.env.SPIKE_APP_PASSWORD ?? 'dive_app';
}

export function spikeMigrationPassword(): string {
  return process.env.SPIKE_MIGRATION_PASSWORD ?? 'dive_migration';
}
