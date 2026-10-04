import {
  claimOrdinaryInvitationOutboxEvent,
  completeOrdinaryInvitationOutboxEvent,
  failOrdinaryInvitationOutboxEvent,
} from '@dive-center/database';
import {
  OrdinaryInvitationProviderError,
  type OrdinaryInvitationProviderPort,
} from '@dive-center/identity';
import type { Pool, PoolClient } from 'pg';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assertOrdinaryWorkerRollout,
  processNextOrdinaryInvitation,
} from './ordinary-invitation-worker.js';

vi.mock('@dive-center/database', () => ({
  claimOrdinaryInvitationOutboxEvent: vi.fn(),
  completeOrdinaryInvitationOutboxEvent: vi.fn(),
  failOrdinaryInvitationOutboxEvent: vi.fn(),
}));

const enabledEnvironment = {
  ORDINARY_INVITATION_DELIVERY_ENABLED: 'true',
  ORDINARY_INVITATION_WRITES_ENABLED: 'true',
};
const claim = {
  eventId: 'event-1',
  tenantId: 'tenant-1',
  invitationId: 'invitation-1',
  command: 'create' as const,
  targetAddress: 'invitee@example.test',
  invitationAttemptId: 'attempt-1',
  providerInvitationRef: null,
  invitationStatus: 'pending' as const,
  attemptCount: 1,
  correlationId: 'correlation-1',
};

function harness() {
  const client = {
    query: vi.fn().mockResolvedValue({ rows: [] }),
    release: vi.fn(),
  } as unknown as PoolClient;
  const pool = {
    connect: vi.fn().mockResolvedValue(client),
  } as unknown as Pool;
  const provider: OrdinaryInvitationProviderPort = {
    create: vi.fn(),
    reconcile: vi.fn(),
    revoke: vi.fn(),
  };
  return { client, pool, provider };
}

describe('ordinary invitation worker (DIVE-IAM-REQ-017)', () => {
  beforeEach(() => vi.resetAllMocks());

  it('does not connect while delivery is disabled', async () => {
    const { pool, provider } = harness();
    await expect(
      processNextOrdinaryInvitation(pool, provider, {
        ORDINARY_INVITATION_DELIVERY_ENABLED: 'false',
      }),
    ).resolves.toBe('disabled');
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it('requires the ordinary writes flag before enabling delivery', () => {
    expect(() =>
      assertOrdinaryWorkerRollout({
        ORDINARY_INVITATION_DELIVERY_ENABLED: 'true',
        ORDINARY_INVITATION_WRITES_ENABLED: 'false',
      }),
    ).toThrow(/requires ORDINARY_INVITATION_WRITES_ENABLED/);
  });

  it('reconciles an existing Clerk invitation before creating a duplicate', async () => {
    const { client, pool, provider } = harness();
    vi.mocked(claimOrdinaryInvitationOutboxEvent).mockResolvedValue(claim);
    vi.mocked(provider.reconcile).mockResolvedValue({
      invitationRef: 'clerk-invitation-1',
      status: 'pending',
    });

    await expect(
      processNextOrdinaryInvitation(pool, provider, enabledEnvironment),
    ).resolves.toBe('succeeded');
    expect(provider.reconcile).toHaveBeenCalledWith({
      targetAddress: claim.targetAddress,
      invitationAttemptId: claim.invitationAttemptId,
    });
    expect(provider.create).not.toHaveBeenCalled();
    expect(completeOrdinaryInvitationOutboxEvent).toHaveBeenCalledWith(client, {
      claim,
      providerInvitationRef: 'clerk-invitation-1',
      providerStatus: 'pending',
    });
    expect(client.query).toHaveBeenLastCalledWith('COMMIT');
  });

  it.each(['accepted', 'revoked', 'expired'] as const)(
    'does not create a duplicate when reconciliation returns %s',
    async (status) => {
      const { client, pool, provider } = harness();
      vi.mocked(claimOrdinaryInvitationOutboxEvent).mockResolvedValue(claim);
      vi.mocked(provider.reconcile).mockResolvedValue({
        invitationRef: 'clerk-invitation-terminal',
        status,
      });

      await expect(
        processNextOrdinaryInvitation(pool, provider, enabledEnvironment),
      ).resolves.toBe('succeeded');
      expect(provider.create).not.toHaveBeenCalled();
      expect(completeOrdinaryInvitationOutboxEvent).toHaveBeenCalledWith(
        client,
        {
          claim,
          providerInvitationRef: 'clerk-invitation-terminal',
          providerStatus: status,
        },
      );
    },
  );

  it('retries an unknown reconciled provider state without creating', async () => {
    const { client, pool, provider } = harness();
    vi.mocked(claimOrdinaryInvitationOutboxEvent).mockResolvedValue(claim);
    vi.mocked(provider.reconcile).mockResolvedValue({
      invitationRef: 'clerk-invitation-unknown',
      status: 'blocked',
    });
    vi.mocked(failOrdinaryInvitationOutboxEvent).mockResolvedValue('retrying');

    await expect(
      processNextOrdinaryInvitation(pool, provider, enabledEnvironment, {
        now: () => new Date('2026-01-01T00:00:00.000Z'),
        random: () => 0,
      }),
    ).resolves.toBe('retrying');
    expect(provider.create).not.toHaveBeenCalled();
    expect(failOrdinaryInvitationOutboxEvent).toHaveBeenCalledWith(client, {
      claim,
      retryable: true,
      nextAttemptAt: '2026-01-01T00:00:00.000Z',
      providerStatus: 'unknown_provider_state',
    });
  });

  it('retries an ambiguous reconciliation without creating', async () => {
    const { client, pool, provider } = harness();
    vi.mocked(claimOrdinaryInvitationOutboxEvent).mockResolvedValue(claim);
    const error = new OrdinaryInvitationProviderError(null, null);
    error.name = 'AmbiguousProviderStateError';
    vi.mocked(provider.reconcile).mockRejectedValue(error);
    vi.mocked(failOrdinaryInvitationOutboxEvent).mockResolvedValue('retrying');

    await expect(
      processNextOrdinaryInvitation(pool, provider, enabledEnvironment, {
        now: () => new Date('2026-01-01T00:00:00.000Z'),
        random: () => 0,
      }),
    ).resolves.toBe('retrying');
    expect(provider.create).not.toHaveBeenCalled();
    expect(failOrdinaryInvitationOutboxEvent).toHaveBeenCalledWith(client, {
      claim,
      retryable: true,
      nextAttemptAt: '2026-01-01T00:00:00.000Z',
      providerStatus: 'unknown_provider_state',
    });
  });

  it('passes the immutable attempt identifier as the provider idempotency key without the bearer', async () => {
    const { client, pool, provider } = harness();
    vi.mocked(claimOrdinaryInvitationOutboxEvent).mockResolvedValue(claim);
    vi.mocked(provider.reconcile).mockResolvedValue(null);
    vi.mocked(provider.create).mockResolvedValue({
      invitationRef: 'clerk-invitation-2',
      status: 'pending',
    });

    await expect(
      processNextOrdinaryInvitation(pool, provider, enabledEnvironment),
    ).resolves.toBe('succeeded');
    expect(provider.create).toHaveBeenCalledExactlyOnceWith({
      targetAddress: claim.targetAddress,
      invitationAttemptId: claim.invitationAttemptId,
    });
    expect(provider.create.mock.calls[0]?.[0]).not.toHaveProperty('credential');
    expect(completeOrdinaryInvitationOutboxEvent).toHaveBeenCalledWith(client, {
      claim,
      providerInvitationRef: 'clerk-invitation-2',
      providerStatus: 'pending',
    });
  });

  it('does not create a provider ticket for an already revoked local invitation', async () => {
    const { pool, provider } = harness();
    vi.mocked(claimOrdinaryInvitationOutboxEvent).mockResolvedValue({
      ...claim,
      invitationStatus: 'revoked',
    });

    await expect(
      processNextOrdinaryInvitation(pool, provider, enabledEnvironment),
    ).resolves.toBe('succeeded');
    expect(provider.reconcile).not.toHaveBeenCalled();
    expect(provider.create).not.toHaveBeenCalled();
    expect(completeOrdinaryInvitationOutboxEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        providerInvitationRef: null,
        providerStatus: 'not_needed',
      }),
    );
  });

  it('returns idle without invoking the provider when the queue is empty', async () => {
    const { pool, provider } = harness();
    vi.mocked(claimOrdinaryInvitationOutboxEvent).mockResolvedValue(null);

    await expect(
      processNextOrdinaryInvitation(pool, provider, enabledEnvironment),
    ).resolves.toBe('idle');
    expect(provider.create).not.toHaveBeenCalled();
    expect(provider.revoke).not.toHaveBeenCalled();
  });

  it('completes a revoke without a provider reference as a local no-op', async () => {
    const { client, pool, provider } = harness();
    vi.mocked(claimOrdinaryInvitationOutboxEvent).mockResolvedValue({
      ...claim,
      command: 'revoke',
    });

    await expect(
      processNextOrdinaryInvitation(pool, provider, enabledEnvironment),
    ).resolves.toBe('succeeded');
    expect(provider.revoke).not.toHaveBeenCalled();
    expect(completeOrdinaryInvitationOutboxEvent).toHaveBeenCalledWith(client, {
      claim: { ...claim, command: 'revoke' },
      providerInvitationRef: null,
      providerStatus: 'not_needed',
    });
  });

  it('reconciles a pending provider invitation before revoking it', async () => {
    const { client, pool, provider } = harness();
    const revokeClaim = {
      ...claim,
      command: 'revoke' as const,
      providerInvitationRef: 'clerk-invitation-revoke',
    };
    vi.mocked(claimOrdinaryInvitationOutboxEvent).mockResolvedValue(
      revokeClaim,
    );
    vi.mocked(provider.reconcile).mockResolvedValue({
      invitationRef: revokeClaim.providerInvitationRef,
      status: 'pending',
    });
    vi.mocked(provider.revoke).mockResolvedValue({
      invitationRef: revokeClaim.providerInvitationRef,
      status: 'revoked',
    });

    await expect(
      processNextOrdinaryInvitation(pool, provider, enabledEnvironment),
    ).resolves.toBe('succeeded');
    expect(provider.revoke).toHaveBeenCalledExactlyOnceWith(
      revokeClaim.providerInvitationRef,
    );
    expect(completeOrdinaryInvitationOutboxEvent).toHaveBeenCalledWith(client, {
      claim: revokeClaim,
      providerInvitationRef: revokeClaim.providerInvitationRef,
      providerStatus: 'revoked',
    });
  });

  it.each(['accepted', 'blocked'] as const)(
    'does not revoke when reconciliation returns %s',
    async (status) => {
      const { client, pool, provider } = harness();
      const revokeClaim = {
        ...claim,
        command: 'revoke' as const,
        providerInvitationRef: 'clerk-invitation-revoke',
      };
      vi.mocked(claimOrdinaryInvitationOutboxEvent).mockResolvedValue(
        revokeClaim,
      );
      vi.mocked(provider.reconcile).mockResolvedValue({
        invitationRef: revokeClaim.providerInvitationRef,
        status,
      });
      vi.mocked(failOrdinaryInvitationOutboxEvent).mockResolvedValue(
        'retrying',
      );

      await expect(
        processNextOrdinaryInvitation(pool, provider, enabledEnvironment, {
          now: () => new Date('2026-01-01T00:00:00.000Z'),
          random: () => 0,
        }),
      ).resolves.toBe('retrying');
      expect(provider.revoke).not.toHaveBeenCalled();
      expect(failOrdinaryInvitationOutboxEvent).toHaveBeenCalledWith(client, {
        claim: revokeClaim,
        retryable: true,
        nextAttemptAt: '2026-01-01T00:00:00.000Z',
        providerStatus: 'unknown_provider_state',
      });
    },
  );

  it('retries a provider/local reference mismatch without revoking', async () => {
    const { client, pool, provider } = harness();
    const revokeClaim = {
      ...claim,
      command: 'revoke' as const,
      providerInvitationRef: 'clerk-invitation-revoke',
    };
    vi.mocked(claimOrdinaryInvitationOutboxEvent).mockResolvedValue(
      revokeClaim,
    );
    vi.mocked(provider.reconcile).mockResolvedValue({
      invitationRef: 'clerk-invitation-other',
      status: 'pending',
    });
    vi.mocked(failOrdinaryInvitationOutboxEvent).mockResolvedValue('retrying');

    await expect(
      processNextOrdinaryInvitation(pool, provider, enabledEnvironment, {
        now: () => new Date('2026-01-01T00:00:00.000Z'),
        random: () => 0,
      }),
    ).resolves.toBe('retrying');
    expect(provider.revoke).not.toHaveBeenCalled();
    expect(failOrdinaryInvitationOutboxEvent).toHaveBeenCalledWith(client, {
      claim: revokeClaim,
      retryable: true,
      nextAttemptAt: '2026-01-01T00:00:00.000Z',
      providerStatus: 'unknown_provider_state',
    });
  });

  it('persists retry state for transient provider failures', async () => {
    const { client, pool, provider } = harness();
    vi.mocked(claimOrdinaryInvitationOutboxEvent).mockResolvedValue(claim);
    vi.mocked(provider.reconcile).mockResolvedValue(null);
    vi.mocked(provider.create).mockRejectedValue(
      new OrdinaryInvitationProviderError(429, '30'),
    );
    vi.mocked(failOrdinaryInvitationOutboxEvent).mockResolvedValue('retrying');

    await expect(
      processNextOrdinaryInvitation(pool, provider, enabledEnvironment, {
        now: () => new Date('2026-01-01T00:00:00.000Z'),
        random: () => 0,
      }),
    ).resolves.toBe('retrying');
    expect(failOrdinaryInvitationOutboxEvent).toHaveBeenCalledWith(client, {
      claim,
      retryable: true,
      nextAttemptAt: '2026-01-01T00:00:30.000Z',
      providerStatus: 'http_429',
    });
  });

  it('dead-letters the eighth transient failure', async () => {
    const { pool, provider } = harness();
    vi.mocked(claimOrdinaryInvitationOutboxEvent).mockResolvedValue({
      ...claim,
      attemptCount: 8,
    });
    vi.mocked(provider.reconcile).mockResolvedValue(null);
    vi.mocked(provider.create).mockRejectedValue(
      new OrdinaryInvitationProviderError(503, null),
    );
    vi.mocked(failOrdinaryInvitationOutboxEvent).mockResolvedValue(
      'dead_letter',
    );

    await expect(
      processNextOrdinaryInvitation(pool, provider, enabledEnvironment),
    ).resolves.toBe('dead_letter');
    expect(failOrdinaryInvitationOutboxEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        retryable: true,
        nextAttemptAt: null,
        providerStatus: 'http_503',
      }),
    );
  });

  it('records an ambiguous provider timeout before returning the stop signal', async () => {
    const { client, pool, provider } = harness();
    vi.mocked(claimOrdinaryInvitationOutboxEvent).mockResolvedValue(claim);
    vi.mocked(provider.reconcile).mockResolvedValue(null);
    vi.mocked(provider.create).mockRejectedValue(
      new OrdinaryInvitationProviderError(null, null, true),
    );
    vi.mocked(failOrdinaryInvitationOutboxEvent).mockResolvedValue('retrying');

    await expect(
      processNextOrdinaryInvitation(pool, provider, enabledEnvironment, {
        now: () => new Date('2026-01-01T00:00:00.000Z'),
        random: () => 0,
      }),
    ).resolves.toBe('ambiguous_timeout');
    expect(failOrdinaryInvitationOutboxEvent).toHaveBeenCalledWith(client, {
      claim,
      retryable: true,
      nextAttemptAt: '2026-01-01T00:00:00.000Z',
      providerStatus: 'request_timeout',
    });
  });

  it('dead-letters a nonretryable provider response', async () => {
    const { client, pool, provider } = harness();
    vi.mocked(claimOrdinaryInvitationOutboxEvent).mockResolvedValue(claim);
    vi.mocked(provider.reconcile).mockResolvedValue(null);
    vi.mocked(provider.create).mockRejectedValue(
      new OrdinaryInvitationProviderError(400, null),
    );
    vi.mocked(failOrdinaryInvitationOutboxEvent).mockResolvedValue(
      'dead_letter',
    );

    await expect(
      processNextOrdinaryInvitation(pool, provider, enabledEnvironment),
    ).resolves.toBe('dead_letter');
    expect(failOrdinaryInvitationOutboxEvent).toHaveBeenCalledWith(client, {
      claim,
      retryable: false,
      nextAttemptAt: null,
      providerStatus: 'http_400',
    });
  });

  it('rolls back and rethrows opaque provider errors', async () => {
    const { client, pool, provider } = harness();
    vi.mocked(claimOrdinaryInvitationOutboxEvent).mockResolvedValue(claim);
    vi.mocked(provider.reconcile).mockResolvedValue(null);
    const error = new Error('provider implementation failure');
    vi.mocked(provider.create).mockRejectedValue(error);

    await expect(
      processNextOrdinaryInvitation(pool, provider, enabledEnvironment),
    ).rejects.toBe(error);
    expect(failOrdinaryInvitationOutboxEvent).not.toHaveBeenCalled();
    expect(client.query).toHaveBeenLastCalledWith('ROLLBACK');
  });
});
