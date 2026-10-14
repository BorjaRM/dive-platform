import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const databaseRequire = createRequire(
  new URL('../packages/database/package.json', import.meta.url),
);
export const testDatabaseName = 'dive_test';
const localDatabasePort = '55432';
const databaseRoles = {
  APP_DATABASE_URL: 'dive_app',
  WORKER_DATABASE_URL: 'dive_worker',
  MIGRATION_DATABASE_URL: 'dive_migration',
  SPIKE_ADMIN_DATABASE_URL: 'postgres',
  SPIKE_APP_DATABASE_URL: 'dive_app',
  SPIKE_WORKER_DATABASE_URL: 'dive_worker',
  SPIKE_PLATFORM_ADMIN_DATABASE_URL: 'dive_platform_admin',
};

function quoteIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

export function assertTestDatabaseEnvironment(environment) {
  if (environment.NODE_ENV !== 'development') {
    throw new Error('Test database preparation requires NODE_ENV=development.');
  }

  for (const [name, role] of Object.entries(databaseRoles)) {
    let url;
    try {
      url = new URL(environment[name]);
    } catch {
      throw new Error(`${name} must be a valid local PostgreSQL URL.`);
    }

    if (
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
      url.port !== localDatabasePort ||
      url.pathname !== `/${testDatabaseName}` ||
      url.username !== role ||
      url.search ||
      url.hash
    ) {
      throw new Error(
        `${name} must target ${testDatabaseName} on loopback port ${localDatabasePort} as ${role}, without query parameters or fragments.`,
      );
    }
  }
}

function runCommand(command, args, environment) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    env: environment,
    stdio: 'inherit',
  });
  if (result.error || result.status !== 0) {
    throw new Error(`${command} failed; test database preparation stopped.`);
  }
}

export async function prepareTestDatabase({
  environment = process.env,
  createClient = (config) => new (databaseRequire('pg').Client)(config),
  run = runCommand,
} = {}) {
  assertTestDatabaseEnvironment(environment);

  const adminUrl = new URL(environment.SPIKE_ADMIN_DATABASE_URL);
  adminUrl.pathname = '/postgres';
  const client = createClient({ connectionString: adminUrl.href });
  try {
    await client.connect();
    const result = await client.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [testDatabaseName],
    );
    if (result.rows.length === 0)
      await client.query(
        `CREATE DATABASE ${quoteIdentifier(testDatabaseName)};`,
      );
  } finally {
    await client.end();
  }

  run(process.execPath, ['--run', 'db:bootstrap'], environment);
  run(process.execPath, ['--run', 'db:migrate'], environment);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    if (process.argv.length !== 2) {
      throw new Error(
        'Test database preparation does not accept command-line options.',
      );
    }
    await prepareTestDatabase();
    console.log('Test database prepared. No test data loaded.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
