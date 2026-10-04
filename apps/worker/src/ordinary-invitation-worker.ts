import {
  claimOrdinaryInvitationOutboxEvent,
  completeOrdinaryInvitationOutboxEvent,
  failOrdinaryInvitationOutboxEvent,
} from '@dive-center/database';
import {
  OrdinaryInvitationProviderError,
  type OrdinaryInvitationProviderPort,
  type OrdinaryInvitationProviderResult,
} from '@dive-center/identity';
import type { Pool, PoolClient } from 'pg';
import {
  fullJitterDelayMillis,
  retryAfterDelayMillis,
} from './invitation-retry.js';

export type OrdinaryWorkerResult =
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

export function ordinaryInvitationDeliveryEnabled(
  environment: NodeJS.ProcessEnv = process.env,
): boolean {
  return environment.ORDINARY_INVITATION_DELIVERY_ENABLED === 'true';
}

export function assertOrdinaryWorkerRollout(
  environment: NodeJS.ProcessEnv = process.env,
): void {
  if (
    ordinaryInvitationDeliveryEnabled(environment) &&
    environment.ORDINARY_INVITATION_WRITES_ENABLED !== 'true'
  ) {
    throw new Error(
      'ORDINARY_INVITATION_DELIVERY_ENABLED requires ORDINARY_INVITATION_WRITES_ENABLED',
    );
  }
}

function isRetryable(error: OrdinaryInvitationProviderError): boolean {
  return (
    error.statusCode === null ||
    error.statusCode === 408 ||
    error.statusCode === 429 ||
    (error.statusCode >= 500 && error.statusCode <= 599)
  );
}

function safeProviderStatus(error: OrdinaryInvitationProviderError): string {
  if (
    error.name === 'AmbiguousProviderStateError' ||
    error.name === 'UnknownProviderStateError'
  ) {
    return 'unknown_provider_state';
  }
  if (error.timedOut) return 'request_timeout';
  return error.statusCode === null
    ? 'network_error'
    : `http_${error.statusCode}`;
}

function unknownProviderStateError(): OrdinaryInvitationProviderError {
  const error = new OrdinaryInvitationProviderError(null, null);
  error.name = 'UnknownProviderStateError';
  return error;
}

type KnownOrdinaryInvitationProviderStatus =
  | 'accepted'
  | 'expired'
  | 'not_found'
  | 'pending'
  | 'revoked';

type KnownOrdinaryInvitationProviderResult = Readonly<{
  invitationRef: string;
  status: KnownOrdinaryInvitationProviderStatus;
}>;

function isKnownProviderStatus(
  status: string,
): status is KnownOrdinaryInvitationProviderStatus {
  return ['accepted', 'expired', 'not_found', 'pending', 'revoked'].includes(
    status,
  );
}

function assertKnownProviderStatus(
  result: OrdinaryInvitationProviderResult,
): KnownOrdinaryInvitationProviderResult {
  if (!isKnownProviderStatus(result.status)) {
    throw unknownProviderStateError();
  }
  return Object.freeze({
    invitationRef: result.invitationRef,
    status: result.status,
  });
}

async function deliver(
  provider: OrdinaryInvitationProviderPort,
  claim: NonNullable<
    Awaited<ReturnType<typeof claimOrdinaryInvitationOutboxEvent>>
  >,
): Promise<OrdinaryInvitationProviderResult | null> {
  if (claim.command === 'create') {
    if (claim.invitationStatus !== 'pending') return null;
    const reconciled = await provider.reconcile({
      targetAddress: claim.targetAddress,
      invitationAttemptId: claim.invitationAttemptId,
    });
    if (reconciled?.status === 'not_found') {
      if (claim.providerInvitationRef) {
        throw unknownProviderStateError();
      }
      return assertKnownProviderStatus(
        await provider.create({
          targetAddress: claim.targetAddress,
          invitationAttemptId: claim.invitationAttemptId,
        }),
      );
    }
    if (!reconciled && claim.providerInvitationRef) {
      throw unknownProviderStateError();
    }
    return assertKnownProviderStatus(
      reconciled ??
        (await provider.create({
          targetAddress: claim.targetAddress,
          invitationAttemptId: claim.invitationAttemptId,
        })),
    );
  }
  if (!claim.providerInvitationRef) return null;
  const reconciled = await provider.reconcile({
    targetAddress: claim.targetAddress,
    invitationAttemptId: claim.invitationAttemptId,
  });
  const knownReconciled = reconciled
    ? assertKnownProviderStatus(reconciled)
    : null;
  if (knownReconciled) {
    if (knownReconciled.invitationRef !== claim.providerInvitationRef) {
      throw unknownProviderStateError();
    }
    if (
      knownReconciled.status === 'revoked' ||
      knownReconciled.status === 'expired' ||
      knownReconciled.status === 'not_found'
    ) {
      return knownReconciled;
    }
    if (knownReconciled.status !== 'pending') {
      throw unknownProviderStateError();
    }
  }
  const revoked = assertKnownProviderStatus(
    await provider.revoke(claim.providerInvitationRef),
  );
  if (
    revoked.status !== 'revoked' &&
    revoked.status !== 'expired' &&
    revoked.status !== 'not_found'
  ) {
    throw unknownProviderStateError();
  }
  return revoked;
}

async function rollback(client: PoolClient): Promise<void> {
  await client.query('ROLLBACK').catch(() => undefined);
}

export async function processNextOrdinaryInvitation(
  pool: Pool,
  provider: OrdinaryInvitationProviderPort,
  environment: NodeJS.ProcessEnv = process.env,
  dependencies: WorkerDependencies = defaultDependencies,
): Promise<OrdinaryWorkerResult> {
  assertOrdinaryWorkerRollout(environment);
  if (!ordinaryInvitationDeliveryEnabled(environment)) return 'disabled';

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const claim = await claimOrdinaryInvitationOutboxEvent(client);
    if (!claim) {
      await client.query('COMMIT');
      return 'idle';
    }

    try {
      const delivered = await deliver(provider, claim);
      await completeOrdinaryInvitationOutboxEvent(client, {
        claim,
        providerInvitationRef: delivered?.invitationRef ?? null,
        providerStatus: delivered?.status ?? 'not_needed',
      });
      await client.query('COMMIT');
      return 'succeeded';
    } catch (error) {
      if (!(error instanceof OrdinaryInvitationProviderError)) throw error;
      const retryable = isRetryable(error);
      const attempt = claim.attemptCount;
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
      const state = await failOrdinaryInvitationOutboxEvent(client, {
        claim,
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
