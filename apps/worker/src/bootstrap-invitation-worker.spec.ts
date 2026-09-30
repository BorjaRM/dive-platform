import {
  claimBootstrapOutboxEvent,
  completeBootstrapOutboxEvent,
  failBootstrapOutboxEvent,
} from '@dive-center/database';
import {
  BootstrapInvitationProviderError,
  type BootstrapInvitationProviderPort,
} from '@dive-center/identity';
import type { Pool, PoolClient } from 'pg';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assertBootstrapWorkerRollout,
  fullJitterDelayMillis,
  processNextBootstrapInvitation,
  retryAfterDelayMillis,
} from './bootstrap-invitation-worker.js';

vi.mock('@dive-center/database', () => ({
  claimBootstrapOutboxEvent: vi.fn(),
  completeBootstrapOutboxEvent: vi.fn(),
  failBootstrapOutboxEvent: vi.fn(),
}));

const enabledEnvironment = {
  BOOTSTRAP_INVITATION_DELIVERY_ENABLED: 'true',
  BOOTSTRAP_INVITATION_WRITES_ENABLED: 'true',
};
const claim = {
  eventId: 'event-1',
  grantId: 'grant-1',
  command: 'create' as const,
  destinationEmail: 'owner@example.test',
  providerInvitationRef: null,
  attemptCount: 0,
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
  const provider: BootstrapInvitationProviderPort = {
    create: vi.fn(),
    reconcile: vi.fn(),
    revoke: vi.fn(),
  };
  return { client, pool, provider };
}

describe('bootstrap invitation worker (DIVE-ONB-REQ-043..045)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('does not connect or claim while delivery is disabled', async () => {
    const { pool, provider } = harness();
    await expect(
      processNextBootstrapInvitation(pool, provider, {
        BOOTSTRAP_INVITATION_DELIVERY_ENABLED: 'false',
      }),
    ).resolves.toBe('disabled');
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it('fails closed when delivery is enabled before writes', () => {
    expect(() =>
      assertBootstrapWorkerRollout({
        BOOTSTRAP_INVITATION_DELIVERY_ENABLED: 'true',
        BOOTSTRAP_INVITATION_WRITES_ENABLED: 'false',
      }),
    ).toThrow(/requires BOOTSTRAP_INVITATION_WRITES_ENABLED/);
  });

  it('holds the transaction from claim through provider completion', async () => {
    const { client, pool, provider } = harness();
    vi.mocked(claimBootstrapOutboxEvent).mockResolvedValue(claim);
    vi.mocked(provider.create).mockResolvedValue({
      invitationRef: 'inv_1',
      status: 'pending',
    });
    await expect(
      processNextBootstrapInvitation(pool, provider, enabledEnvironment),
    ).resolves.toBe('succeeded');
    expect(client.query).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(completeBootstrapOutboxEvent).toHaveBeenCalledWith(client, {
      eventId: 'event-1',
      providerInvitationRef: 'inv_1',
      providerStatus: 'pending',
    });
    expect(client.query).toHaveBeenLastCalledWith('COMMIT');
    expect(vi.mocked(provider.create).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(completeBootstrapOutboxEvent).mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('reconciles a remote success lost to local rollback before creating', async () => {
    const { pool, provider } = harness();
    vi.mocked(claimBootstrapOutboxEvent).mockResolvedValue(claim);
    vi.mocked(provider.reconcile).mockResolvedValue({
      invitationRef: 'inv_existing',
      status: 'pending',
    });
    await expect(
      processNextBootstrapInvitation(pool, provider, enabledEnvironment),
    ).resolves.toBe('succeeded');
    expect(provider.create).not.toHaveBeenCalled();
    expect(completeBootstrapOutboxEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ providerInvitationRef: 'inv_existing' }),
    );
  });

  it('honors valid Retry-After when it exceeds local jitter', async () => {
    const { client, pool, provider } = harness();
    vi.mocked(claimBootstrapOutboxEvent).mockResolvedValue(claim);
    vi.mocked(provider.create).mockRejectedValue(
      new BootstrapInvitationProviderError(429, '30'),
    );
    vi.mocked(failBootstrapOutboxEvent).mockResolvedValue('retrying');
    await expect(
      processNextBootstrapInvitation(pool, provider, enabledEnvironment, {
        now: () => new Date('2026-01-01T00:00:00.000Z'),
        random: () => 0,
      }),
    ).resolves.toBe('retrying');
    expect(failBootstrapOutboxEvent).toHaveBeenCalledWith(client, {
      eventId: 'event-1',
      retryable: true,
      nextAttemptAt: '2026-01-01T00:00:30.000Z',
      providerStatus: 'http_429',
    });
  });

  it.each([
    '9007199254740991',
    '9007199254740992',
    '8640000000000',
    '9'.repeat(400),
  ])(
    'pauses an unrepresentable Retry-After %s without early replay (DIVE-ONB-REQ-044)',
    async (retryAfter) => {
      const { client, pool, provider } = harness();
      vi.mocked(claimBootstrapOutboxEvent).mockResolvedValue(claim);
      vi.mocked(provider.create).mockRejectedValue(
        new BootstrapInvitationProviderError(429, retryAfter),
      );
      vi.mocked(failBootstrapOutboxEvent).mockResolvedValue('retrying');
      await expect(
        processNextBootstrapInvitation(pool, provider, enabledEnvironment, {
          now: () => new Date('2026-01-01T00:00:00.000Z'),
          random: () => 0,
        }),
      ).resolves.toBe('retrying');
      expect(failBootstrapOutboxEvent).toHaveBeenCalledWith(client, {
        eventId: 'event-1',
        retryable: true,
        nextAttemptAt: 'infinity',
        providerStatus: 'retry_after_out_of_range',
      });
      expect(client.query).toHaveBeenLastCalledWith('COMMIT');
      expect(client.release).toHaveBeenCalledOnce();
    },
  );

  it.each([503, 429])(
    'dead-letters the eighth HTTP %s failure without scheduling replay',
    async (statusCode) => {
      const { client, pool, provider } = harness();
      vi.mocked(claimBootstrapOutboxEvent).mockResolvedValue({
        ...claim,
        attemptCount: 7,
      });
      vi.mocked(provider.reconcile).mockResolvedValue(null);
      vi.mocked(provider.create).mockRejectedValue(
        new BootstrapInvitationProviderError(
          statusCode,
          statusCode === 429 ? '9007199254740991' : null,
        ),
      );
      vi.mocked(failBootstrapOutboxEvent).mockResolvedValue('dead_letter');
      await expect(
        processNextBootstrapInvitation(pool, provider, enabledEnvironment),
      ).resolves.toBe('dead_letter');
      expect(failBootstrapOutboxEvent).toHaveBeenCalledWith(client, {
        eventId: 'event-1',
        retryable: true,
        nextAttemptAt: null,
        providerStatus: `http_${statusCode}`,
      });
    },
  );

  it('also pauses revoke commands without attempting another create (DIVE-ONB-REQ-044)', async () => {
    const { client, pool, provider } = harness();
    vi.mocked(claimBootstrapOutboxEvent).mockResolvedValue({
      ...claim,
      command: 'revoke',
      providerInvitationRef: 'inv_previous',
    });
    vi.mocked(provider.revoke).mockRejectedValue(
      new BootstrapInvitationProviderError(429, '9007199254740991'),
    );
    vi.mocked(failBootstrapOutboxEvent).mockResolvedValue('retrying');
    await expect(
      processNextBootstrapInvitation(pool, provider, enabledEnvironment, {
        now: () => new Date('2026-01-01T00:00:00.000Z'),
        random: () => 0,
      }),
    ).resolves.toBe('retrying');
    expect(failBootstrapOutboxEvent).toHaveBeenCalledWith(client, {
      eventId: 'event-1',
      retryable: true,
      nextAttemptAt: 'infinity',
      providerStatus: 'retry_after_out_of_range',
    });
    expect(provider.create).not.toHaveBeenCalled();
    expect(provider.reconcile).not.toHaveBeenCalled();
    expect(client.query).toHaveBeenLastCalledWith('COMMIT');
  });

  it.each([null, 'invalid', 'Wed, 31 Dec 2025 23:59:59 GMT', '0'])(
    'retains local jitter when Retry-After %s imposes no later deadline (DIVE-ONB-REQ-044)',
    async (retryAfter) => {
      const { client, pool, provider } = harness();
      vi.mocked(claimBootstrapOutboxEvent).mockResolvedValue(claim);
      vi.mocked(provider.create).mockRejectedValue(
        new BootstrapInvitationProviderError(429, retryAfter),
      );
      vi.mocked(failBootstrapOutboxEvent).mockResolvedValue('retrying');
      await expect(
        processNextBootstrapInvitation(pool, provider, enabledEnvironment, {
          now: () => new Date('2026-01-01T00:00:00.000Z'),
          random: () => 0.5,
        }),
      ).resolves.toBe('retrying');
      expect(failBootstrapOutboxEvent).toHaveBeenCalledWith(client, {
        eventId: 'event-1',
        retryable: true,
        nextAttemptAt: '2026-01-01T00:00:02.500Z',
        providerStatus: 'http_429',
      });
    },
  );

  it('persists an ambiguous timeout before asking the process to stop', async () => {
    const { client, pool, provider } = harness();
    vi.mocked(claimBootstrapOutboxEvent).mockResolvedValue(claim);
    vi.mocked(provider.create).mockRejectedValue(
      new BootstrapInvitationProviderError(null, null, true),
    );
    vi.mocked(failBootstrapOutboxEvent).mockResolvedValue('retrying');

    await expect(
      processNextBootstrapInvitation(pool, provider, enabledEnvironment, {
        now: () => new Date('2026-01-01T00:00:00.000Z'),
        random: () => 0,
      }),
    ).resolves.toBe('ambiguous_timeout');
    expect(failBootstrapOutboxEvent).toHaveBeenCalledWith(client, {
      eventId: 'event-1',
      retryable: true,
      nextAttemptAt: '2026-01-01T00:00:00.000Z',
      providerStatus: 'request_timeout',
    });
    expect(client.query).toHaveBeenLastCalledWith('COMMIT');
  });

  it('treats provider 4xx other than 408 and 429 as terminal', async () => {
    const { client, pool, provider } = harness();
    vi.mocked(claimBootstrapOutboxEvent).mockResolvedValue(claim);
    vi.mocked(provider.create).mockRejectedValue(
      new BootstrapInvitationProviderError(400, null),
    );
    vi.mocked(failBootstrapOutboxEvent).mockResolvedValue('dead_letter');
    await expect(
      processNextBootstrapInvitation(pool, provider, enabledEnvironment),
    ).resolves.toBe('dead_letter');
    expect(failBootstrapOutboxEvent).toHaveBeenCalledWith(
      client,
      expect.objectContaining({ retryable: false, nextAttemptAt: null }),
    );
  });

  it('implements capped full jitter and strict Retry-After parsing', () => {
    expect(fullJitterDelayMillis(1, () => 0)).toBe(0);
    expect(fullJitterDelayMillis(8, () => 1 - Number.EPSILON)).toBe(640_000);
    expect(() => fullJitterDelayMillis(1, () => 1)).toThrow(
      'Invalid random sample',
    );
    const now = new Date('2026-01-01T00:00:00.000Z');
    expect(retryAfterDelayMillis('12', now)).toBe(12_000);
    expect(retryAfterDelayMillis('Thu, 01 Jan 2026 00:00:30 GMT', now)).toBe(
      30_000,
    );
    expect(retryAfterDelayMillis('-1', now)).toBeNull();
    expect(retryAfterDelayMillis('invalid', now)).toBeNull();
    expect(
      retryAfterDelayMillis('Wed, 31 Dec 2025 23:59:59 GMT', now),
    ).toBeNull();
  });
});
