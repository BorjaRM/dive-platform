import {
  assertRuntimeDatabaseRole,
  workerDatabasePoolConfig,
} from '@dive-center/database';
import { ClerkBootstrapInvitationAdapter } from '@dive-center/identity';
import { Pool } from 'pg';
import {
  assertBootstrapWorkerRollout,
  bootstrapInvitationDeliveryEnabled,
  processNextBootstrapInvitation,
} from './bootstrap-invitation-worker.js';

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function positiveIntegerEnvironment(name: string): number {
  const value = Number(requiredEnvironment(name));
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`Invalid ${name}`);
  }
  return value;
}

async function assertWorkerRole(pool: Pool): Promise<void> {
  await assertRuntimeDatabaseRole(pool);
  const result = await pool.query<{ current_user: string }>(
    'SELECT current_user',
  );
  if (result.rows[0]?.current_user !== 'dive_worker') {
    throw new Error('Worker database connection must use dive_worker');
  }
}

async function bootstrap(): Promise<void> {
  assertBootstrapWorkerRollout(process.env);
  if (!bootstrapInvitationDeliveryEnabled(process.env)) return;

  const pool = new Pool(workerDatabasePoolConfig());
  try {
    await assertWorkerRole(pool);
    const provider = new ClerkBootstrapInvitationAdapter({
      secretKey: requiredEnvironment('CLERK_SECRET_KEY'),
      redirectUrl: requiredEnvironment('BOOTSTRAP_INVITATION_REDIRECT_URL'),
      requestTimeoutMillis: positiveIntegerEnvironment(
        'CLERK_REQUEST_TIMEOUT_MS',
      ),
    });
    while (true) {
      const result = await processNextBootstrapInvitation(
        pool,
        provider,
        process.env,
      );
      if (result === 'ambiguous_timeout') {
        throw new Error('Bootstrap invitation provider request timed out');
      }
      if (result === 'idle' || result === 'disabled') break;
    }
  } finally {
    await pool.end();
  }
}

void bootstrap().catch(() => {
  console.error('Bootstrap invitation worker failed');
  process.exit(1);
});
