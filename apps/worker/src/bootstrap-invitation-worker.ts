import {
  claimBootstrapOutboxEvent,
  completeBootstrapOutboxEvent,
  failBootstrapOutboxEvent,
} from '@dive-center/database';
import {
  BootstrapInvitationProviderError,
  type BootstrapInvitationProviderPort,
  type BootstrapInvitationProviderResult,
} from '@dive-center/identity';
import type { Pool, PoolClient } from 'pg';
import {
  fullJitterDelayMillis,
  retryAfterDelayMillis,
} from './invitation-retry.js';

export {
  fullJitterDelayMillis,
  retryAfterDelayMillis,
} from './invitation-retry.js';

export type BootstrapWorkerResult =
  | 'ambiguous_timeout'
  | 'dead_letter'
  | 'disabled'
  | 'idle'
  | 'retrying'
  | 'succeeded';

type WorkerDependencies = Readonly<{
  now: () => Date;
  random: () => number;
}>;

const defaultDependencies: WorkerDependencies = {
  now: () => new Date(),
  random: Math.random,
};

export function bootstrapInvitationDeliveryEnabled(
  environment: NodeJS.ProcessEnv = process.env,
): boolean {
  return environment.BOOTSTRAP_INVITATION_DELIVERY_ENABLED === 'true';
}

export function assertBootstrapWorkerRollout(
  environment: NodeJS.ProcessEnv = process.env,
): void {
  if (
    bootstrapInvitationDeliveryEnabled(environment) &&
    environment.BOOTSTRAP_INVITATION_WRITES_ENABLED !== 'true'
  ) {
    throw new Error(
      'BOOTSTRAP_INVITATION_DELIVERY_ENABLED requires BOOTSTRAP_INVITATION_WRITES_ENABLED',
    );
  }
}

function isRetryable(error: BootstrapInvitationProviderError): boolean {
  return (
    error.statusCode === null ||
    error.statusCode === 408 ||
    error.statusCode === 429 ||
    (error.statusCode >= 500 && error.statusCode <= 599)
  );
}

function safeProviderStatus(error: BootstrapInvitationProviderError): string {
  if (error.name === 'UnknownProviderStateError') {
    return 'unknown_provider_state';
  }
  if (error.timedOut) return 'request_timeout';
  return error.statusCode === null
    ? 'network_error'
    : `http_${error.statusCode}`;
}

function unknownProviderStateError(): BootstrapInvitationProviderError {
  const error = new BootstrapInvitationProviderError(null, null);
  error.name = 'UnknownProviderStateError';
  return error;
}

async function deliver(
  provider: BootstrapInvitationProviderPort,
  claim: NonNullable<Awaited<ReturnType<typeof claimBootstrapOutboxEvent>>>,
): Promise<BootstrapInvitationProviderResult | null> {
  if (claim.command === 'create') {
    const reconciled = await provider.reconcile({
      destinationEmail: claim.destinationEmail,
      grantRef: claim.grantId,
    });
    if (reconciled) return reconciled;
    return provider.create({
      destinationEmail: claim.destinationEmail,
      grantRef: claim.grantId,
    });
  }

  const reconciled = await provider.reconcile({
    destinationEmail: claim.destinationEmail,
    grantRef: claim.grantId,
  });
  if (!reconciled) return null;
  if (reconciled.status === 'revoked' || reconciled.status === 'not_found') {
    return Object.freeze({
      invitationRef: reconciled.invitationRef,
      status: 'not_found',
    });
  }
  if (reconciled.status !== 'pending') {
    throw unknownProviderStateError();
  }
  return provider.revoke(reconciled.invitationRef);
}

async function rollback(client: PoolClient): Promise<void> {
  await client.query('ROLLBACK').catch(() => undefined);
}

export async function processNextBootstrapInvitation(
  pool: Pool,
  provider: BootstrapInvitationProviderPort,
  environment: NodeJS.ProcessEnv = process.env,
  dependencies: WorkerDependencies = defaultDependencies,
): Promise<BootstrapWorkerResult> {
  assertBootstrapWorkerRollout(environment);
  if (!bootstrapInvitationDeliveryEnabled(environment)) return 'disabled';

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const claim = await claimBootstrapOutboxEvent(client);
    if (!claim) {
      await client.query('COMMIT');
      return 'idle';
    }

    try {
      const delivered = await deliver(provider, claim);
      await completeBootstrapOutboxEvent(client, {
        eventId: claim.eventId,
        providerInvitationRef: delivered?.invitationRef ?? null,
        providerStatus: delivered?.status ?? 'not_found',
      });
      await client.query('COMMIT');
      return 'succeeded';
    } catch (error) {
      if (!(error instanceof BootstrapInvitationProviderError)) throw error;
      const retryable = isRetryable(error);
      const attempt = claim.attemptCount + 1;
      let nextAttemptAt: string | null = null;
      let providerStatus = safeProviderStatus(error);
      if (retryable && attempt < 8) {
        const now = dependencies.now();
        const localDelay = fullJitterDelayMillis(attempt, dependencies.random);
        const providerDelay =
          error.statusCode === 429
            ? retryAfterDelayMillis(error.retryAfter, now)
            : null;
        const retryAt = new Date(
          now.getTime() + Math.max(localDelay, providerDelay ?? localDelay),
        );
        if (!Number.isFinite(retryAt.getTime())) {
          nextAttemptAt = 'infinity';
          providerStatus = 'retry_after_out_of_range';
        } else {
          nextAttemptAt = retryAt.toISOString();
        }
      }
      const state = await failBootstrapOutboxEvent(client, {
        eventId: claim.eventId,
        retryable,
        nextAttemptAt,
        providerStatus,
      });
      await client.query('COMMIT');
      if (error.timedOut) return 'ambiguous_timeout';
      return state;
    }
  } catch (error) {
    await rollback(client);
    throw error;
  } finally {
    client.release();
  }
}
