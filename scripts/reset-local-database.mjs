import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const databaseRequire = createRequire(
  new URL('../packages/database/package.json', import.meta.url),
);
const databaseName = 'dive_spike';
const databaseRoles = {
  APP_DATABASE_URL: 'dive_app',
  WORKER_DATABASE_URL: 'dive_worker',
  MIGRATION_DATABASE_URL: 'dive_migration',
  SPIKE_ADMIN_DATABASE_URL: 'postgres',
};

export function assertLocalDatabaseEnvironment(environment) {
  if (environment.NODE_ENV !== 'development') {
    throw new Error('Local reset requires NODE_ENV=development.');
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
      url.port !== '55432' ||
      url.pathname !== `/${databaseName}` ||
      url.username !== role ||
      url.search ||
      url.hash
    ) {
      throw new Error(
        `${name} must target ${databaseName} on loopback port 55432 as ${role}, without query parameters or fragments.`,
      );
    }
  }
}

async function confirmReset() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error(
      'Local reset requires interactive confirmation in a terminal.',
    );
  }

  const prompt = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    return await prompt.question(
      `This deletes ALL data in ${databaseName}. Stop the app first. Type ${databaseName} to continue: `,
    );
  } finally {
    prompt.close();
  }
}

function runCommand(command, args, environment) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    env: environment,
    stdio: 'inherit',
  });
  if (result.error || result.status !== 0) {
    throw new Error(`${command} failed; local reset stopped.`);
  }
}

export async function resetLocalDatabase({
  environment = process.env,
  confirm = confirmReset,
  createClient = (config) => new (databaseRequire('pg').Client)(config),
  run = runCommand,
} = {}) {
  assertLocalDatabaseEnvironment(environment);
  if ((await confirm()) !== databaseName) {
    throw new Error('Local reset cancelled. No changes were made.');
  }

  const adminUrl = new URL(environment.SPIKE_ADMIN_DATABASE_URL);
  adminUrl.pathname = '/postgres';
  const client = createClient({ connectionString: adminUrl.href });
  try {
    await client.connect();
    await client.query(`DROP DATABASE IF EXISTS "${databaseName}";`);
    await client.query(`CREATE DATABASE "${databaseName}";`);
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
      throw new Error('Local reset does not accept command-line options.');
    }
    await resetLocalDatabase();
    console.log(
      'Local database recreated and migrations applied. No seed data loaded.',
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
