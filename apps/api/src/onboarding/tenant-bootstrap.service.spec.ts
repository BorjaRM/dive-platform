import { completeOwnTenantBootstrap } from '@dive-center/database';
import {
  authenticateIdentity,
  DeterministicIdentityProvider,
  IdentityProviderUnavailableError,
  InvalidIdentityCredentialsError,
} from '@dive-center/identity';
import type { Pool } from 'pg';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProblemException } from '../common/http/problem-details.js';
import { TenantBootstrapService } from './tenant-bootstrap.service.js';

vi.mock('@dive-center/database', () => ({
  completeOwnTenantBootstrap: vi.fn(),
}));

const provider = new DeterministicIdentityProvider(
  new Map([
    [
      'token',
      {
        issuer: 'https://identity.example.test',
        subject: 'invited-owner',
        sessionId: 'session',
        verifiedAddresses: ['owner@example.test'],
      },
    ],
  ]),
);

describe('TenantBootstrapService', () => {
  const pool = {} as Pool;
  const service = new TenantBootstrapService(pool, provider);
  const previousWritesFlag = process.env.BOOTSTRAP_INVITATION_WRITES_ENABLED;
  const input = {
    operatorDisplayName: 'Ocean',
    centerDisplayName: 'North',
    timeZone: 'Europe/Madrid',
    locale: 'en' as const,
  };
  const correlationId = 'aaaaaaaa-1111-4111-8111-111111111111';

  beforeEach(() => {
    vi.resetAllMocks();
    process.env.BOOTSTRAP_INVITATION_WRITES_ENABLED = 'true';
  });

  afterEach(() => {
    if (previousWritesFlag === undefined) {
      delete process.env.BOOTSTRAP_INVITATION_WRITES_ENABLED;
    } else {
      process.env.BOOTSTRAP_INVITATION_WRITES_ENABLED = previousWritesFlag;
    }
  });

  it('keeps redemption disabled with the invitation write rollout control', async () => {
    delete process.env.BOOTSTRAP_INVITATION_WRITES_ENABLED;
    const principal = await authenticateIdentity(provider, 'token');
    await expect(
      service.complete(principal, input, correlationId),
    ).rejects.toMatchObject({ status: 503 });
    expect(completeOwnTenantBootstrap).not.toHaveBeenCalled();
  });

  it('delegates only the authenticated principal and approved setup payload', async () => {
    const principal = await authenticateIdentity(provider, 'token');
    vi.mocked(completeOwnTenantBootstrap).mockResolvedValue({
      tenantId: 'aaaaaaaa-1111-4111-8111-111111111111',
      centerId: 'aaaaaaaa-1111-4111-8111-222222222222',
      membershipId: 'aaaaaaaa-1111-4111-8111-333333333333',
      centerKey: 'north',
    });
    await expect(
      service.complete(principal, input, correlationId),
    ).resolves.toMatchObject({ centerKey: 'north' });
    expect(completeOwnTenantBootstrap).toHaveBeenCalledWith(pool, principal, {
      ...input,
      correlationId,
    });
  });

  it('maps grant failures without disclosing their cause', async () => {
    const principal = await authenticateIdentity(provider, 'token');
    vi.mocked(completeOwnTenantBootstrap).mockResolvedValue({
      deniedReason: 'bootstrap_unavailable',
    });
    await expect(
      service.complete(principal, input, correlationId),
    ).rejects.toMatchObject({
      status: 403,
      response: expect.objectContaining({ code: 'bootstrap_unavailable' }),
    });
  });

  it('returns Retry-After for the distributed redemption limit', async () => {
    const principal = await authenticateIdentity(provider, 'token');
    vi.mocked(completeOwnTenantBootstrap).mockResolvedValue({
      deniedReason: 'rate_limited',
      retryAfterSeconds: 23,
    });
    const error = await service
      .complete(principal, input, correlationId)
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiProblemException);
    expect(error).toMatchObject({
      status: 429,
      headers: { 'Retry-After': '23' },
    });
  });

  it.each([
    [new IdentityProviderUnavailableError(), 503],
    [new InvalidIdentityCredentialsError(), 403],
  ])(
    'does not consume a grant when email verification fails (%s)',
    async (failure, status) => {
      const principal = await authenticateIdentity(provider, 'token');
      const unavailable = new TenantBootstrapService(pool, {
        getVerifiedAddresses: async () => {
          throw failure;
        },
      });
      await expect(
        unavailable.complete(principal, input, correlationId),
      ).rejects.toMatchObject({
        status,
        response: expect.objectContaining({ code: 'bootstrap_unavailable' }),
      });
      expect(completeOwnTenantBootstrap).not.toHaveBeenCalled();
    },
  );

  it('does not trust addresses on the principal instead of the use-case lookup', async () => {
    const principal = await authenticateIdentity(provider, 'token');
    const withoutVerifiedEmail = new TenantBootstrapService(pool, {
      getVerifiedAddresses: async () => [],
    });
    await expect(
      withoutVerifiedEmail.complete(principal, input, correlationId),
    ).rejects.toMatchObject({ status: 403 });
    expect(completeOwnTenantBootstrap).not.toHaveBeenCalled();
  });
});
