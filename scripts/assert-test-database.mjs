const databaseVariables = [
  'SPIKE_ADMIN_DATABASE_URL',
  'SPIKE_APP_DATABASE_URL',
  'SPIKE_WORKER_DATABASE_URL',
  'SPIKE_PLATFORM_ADMIN_DATABASE_URL',
  'MIGRATION_DATABASE_URL',
  'APP_DATABASE_URL',
  'WORKER_DATABASE_URL',
];

export function assertTestDatabaseIsolation(environment = process.env) {
  const unsafeVariables = databaseVariables.filter((name) => {
    const value = environment[name];
    if (!value) return false;
    try {
      const url = new URL(value);
      return (
        ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) &&
        url.port === '55432' &&
        url.pathname === '/dive_spike'
      );
    } catch {
      return false;
    }
  });

  if (unsafeVariables.length > 0) {
    throw new Error(
      `Integration and E2E tests refuse the local development database dive_spike. Unsafe variables: ${unsafeVariables.join(', ')}. Use .env.test.example or a disposable test database.`,
    );
  }
}
