import {
  assertRuntimeDatabaseRole,
  workerDatabasePoolConfig,
} from '@dive-center/database';
import {
  ClerkBootstrapInvitationAdapter,
  ClerkOrdinaryInvitationAdapter,
} from '@dive-center/identity';
import { Pool } from 'pg';
import {
  assertBootstrapWorkerRollout,
  bootstrapInvitationDeliveryEnabled,
  processNextBootstrapInvitation,
} from './bootstrap-invitation-worker.js';
import {
  assertOrdinaryWorkerRollout,
  ordinaryInvitationDeliveryEnabled,
  processNextOrdinaryInvitation,
} from './ordinary-invitation-worker.js';

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
  assertOrdinaryWorkerRollout(process.env);
  const bootstrapEnabled = bootstrapInvitationDeliveryEnabled(process.env);
  const ordinaryEnabled = ordinaryInvitationDeliveryEnabled(process.env);
  if (!bootstrapEnabled) {
    console.info('Bootstrap invitation delivery is disabled');
  }
  if (!bootstrapEnabled && !ordinaryEnabled) return;

  const pool = new Pool(workerDatabasePoolConfig());
  try {
    await assertWorkerRole(pool);
    const bootstrapProvider = bootstrapEnabled
      ? new ClerkBootstrapInvitationAdapter({
          allowInsecureLocalRedirect: process.env.NODE_ENV !== 'production',
          authenticationOrigin: requiredEnvironment('AUTHENTICATION_ORIGIN'),
          secretKey: requiredEnvironment('CLERK_SECRET_KEY'),
          redirectUrl: requiredEnvironment('BOOTSTRAP_INVITATION_REDIRECT_URL'),
          requestTimeoutMillis: positiveIntegerEnvironment(
            'CLERK_REQUEST_TIMEOUT_MS',
          ),
        })
      : null;
    const ordinaryProvider = ordinaryEnabled
      ? new ClerkOrdinaryInvitationAdapter({
          allowInsecureLocalRedirect: process.env.NODE_ENV !== 'production',
          authenticationOrigin: requiredEnvironment('AUTHENTICATION_ORIGIN'),
          secretKey: requiredEnvironment('CLERK_SECRET_KEY'),
          redirectUrl: requiredEnvironment('ORDINARY_INVITATION_REDIRECT_URL'),
          requestTimeoutMillis: positiveIntegerEnvironment(
            'CLERK_REQUEST_TIMEOUT_MS',
          ),
        })
      : null;
    let bootstrapIdle = !bootstrapEnabled;
    let ordinaryIdle = !ordinaryEnabled;
    while (!bootstrapIdle || !ordinaryIdle) {
      if (!bootstrapIdle && bootstrapProvider) {
        const result = await processNextBootstrapInvitation(
          pool,
          bootstrapProvider,
          process.env,
        );
        if (result === 'idle') {
          console.info('No eligible bootstrap invitation events remain');
          bootstrapIdle = true;
        } else {
          console.info(`Bootstrap invitation operation: ${result}`);
        }
        if (result === 'ambiguous_timeout') {
          throw new Error('Bootstrap invitation provider request timed out');
        }
      }
      if (!ordinaryIdle && ordinaryProvider) {
        const result = await processNextOrdinaryInvitation(
          pool,
          ordinaryProvider,
          process.env,
        );
        if (result === 'idle') {
          console.info('No eligible ordinary invitation events remain');
          ordinaryIdle = true;
        } else {
          console.info(`Ordinary invitation operation: ${result}`);
        }
        if (result === 'ambiguous_timeout') {
          throw new Error('Ordinary invitation provider request timed out');
        }
      }
    }
  } finally {
    await pool.end();
  }
}

void bootstrap().catch(() => {
  console.error(
    bootstrapInvitationDeliveryEnabled(process.env)
      ? 'Bootstrap invitation worker failed'
      : 'Invitation delivery worker failed',
  );
  process.exit(1);
});
