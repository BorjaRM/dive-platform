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

export function fullJitterDelayMillis(
  attempt: number,
  random: () => number = Math.random,
): number {
  if (!Number.isSafeInteger(attempt) || attempt < 1 || attempt > 8) {
    throw new Error('Invalid bootstrap delivery attempt');
  }
  const ceiling = Math.min(5_000 * 2 ** (attempt - 1), 15 * 60_000);
  const sample = random();
  if (sample < 0 || sample >= 1) throw new Error('Invalid random sample');
  return Math.floor(sample * (ceiling + 1));
}

export function retryAfterDelayMillis(
  value: string | null,
  now: Date,
): number | null {
  if (value === null) return null;
  const normalized = value.trim();
  if (/^\d+$/.test(normalized)) {
    const seconds = Number(normalized);
    return Number.isSafeInteger(seconds) ? seconds * 1_000 : null;
  }
  const timestamp = Date.parse(normalized);
  const delay = timestamp - now.getTime();
  return Number.isFinite(timestamp) && delay > 0 ? delay : null;
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
  if (error.timedOut) return 'request_timeout';
  return error.statusCode === null
    ? 'network_error'
    : `http_${error.statusCode}`;
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

  let invitationRef = claim.providerInvitationRef;
  if (!invitationRef) {
    const reconciled = await provider.reconcile({
      destinationEmail: claim.destinationEmail,
      grantRef: claim.grantId,
    });
    if (!reconciled) return null;
    invitationRef = reconciled.invitationRef;
  }
  return provider.revoke(invitationRef);
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
      if (retryable && attempt < 8) {
        const now = dependencies.now();
        const localDelay = fullJitterDelayMillis(attempt, dependencies.random);
        const providerDelay =
          error.statusCode === 429
            ? retryAfterDelayMillis(error.retryAfter, now)
            : null;
        nextAttemptAt = new Date(
          now.getTime() + Math.max(localDelay, providerDelay ?? localDelay),
        ).toISOString();
      }
      const state = await failBootstrapOutboxEvent(client, {
        eventId: claim.eventId,
        retryable,
        nextAttemptAt,
        providerStatus: safeProviderStatus(error),
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
