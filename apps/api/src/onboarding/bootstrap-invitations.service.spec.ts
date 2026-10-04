import {
  consumeBootstrapInvitationRateLimit,
  issueBootstrapInvitation,
  readBootstrapInvitation,
} from '@dive-center/database';
import {
  authenticateIdentity,
  DeterministicIdentityProvider,
} from '@dive-center/identity';
import type { Pool } from 'pg';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProblemException } from '../common/http/problem-details.js';
import {
  BootstrapInvitationsService,
  bootstrapInvitationWritesEnabled,
} from './bootstrap-invitations.service.js';

vi.mock('@dive-center/database', () => ({
  consumeBootstrapInvitationRateLimit: vi.fn(),
  issueBootstrapInvitation: vi.fn(),
  readBootstrapInvitation: vi.fn(),
  reissueBootstrapInvitation: vi.fn(),
  revokeBootstrapInvitation: vi.fn(),
}));

const identityProvider = new DeterministicIdentityProvider(
  new Map([
    [
      'token',
      {
        issuer: 'https://identity.example.test',
        subject: 'platform-operator',
        verifiedAddresses: ['operator@example.test'],
      },
    ],
  ]),
);

describe('BootstrapInvitationsService', () => {
  const pool = {} as Pool;
  const service = new BootstrapInvitationsService(pool);
  const previousWritesFlag = process.env.BOOTSTRAP_INVITATION_WRITES_ENABLED;

  beforeEach(() => {
    vi.resetAllMocks();
    delete process.env.BOOTSTRAP_INVITATION_WRITES_ENABLED;
    vi.mocked(consumeBootstrapInvitationRateLimit).mockResolvedValue(null);
  });

  afterEach(() => {
    if (previousWritesFlag === undefined) {
      delete process.env.BOOTSTRAP_INVITATION_WRITES_ENABLED;
    } else {
      process.env.BOOTSTRAP_INVITATION_WRITES_ENABLED = previousWritesFlag;
    }
  });

  it('defaults writes to disabled after counting the attempted operation', async () => {
    const principal = await authenticateIdentity(identityProvider, 'token');
    await expect(
      service.issue(
        principal,
        { destinationEmail: 'owner@example.test', reason: 'Pilot' },
        'issue-1',
        'aaaaaaaa-1111-4111-8111-111111111111',
      ),
    ).rejects.toMatchObject({ status: 503 });
    expect(consumeBootstrapInvitationRateLimit).toHaveBeenCalledWith(
      pool,
      principal,
    );
    expect(issueBootstrapInvitation).not.toHaveBeenCalled();
  });

  it('keeps safe reads available while writes are disabled', async () => {
    const principal = await authenticateIdentity(identityProvider, 'token');
    vi.mocked(readBootstrapInvitation).mockResolvedValue({
      invitationId: 'aaaaaaaa-1111-4111-8111-111111111111',
      destinationEmail: 'owner@example.test',
      status: 'issued',
      deliveryStatus: 'pending',
    });
    await expect(
      service.read(principal, 'aaaaaaaa-1111-4111-8111-111111111111'),
    ).resolves.toMatchObject({ status: 'issued' });
  });

  it('returns non-disclosing rate limit details and Retry-After', async () => {
    const principal = await authenticateIdentity(identityProvider, 'token');
    vi.mocked(consumeBootstrapInvitationRateLimit).mockResolvedValue(37);
    const error = await service
      .read(principal, 'aaaaaaaa-1111-4111-8111-111111111111')
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiProblemException);
    expect(error).toMatchObject({
      status: 429,
      headers: { 'Retry-After': '37' },
    });
    expect(readBootstrapInvitation).not.toHaveBeenCalled();
  });

  it('maps inaccessible resources without exposing capability or existence', async () => {
    const principal = await authenticateIdentity(identityProvider, 'token');
    vi.mocked(readBootstrapInvitation).mockResolvedValue({
      deniedReason: 'resource_missing_or_inaccessible',
    });
    await expect(
      service.read(principal, 'aaaaaaaa-1111-4111-8111-111111111111'),
    ).rejects.toMatchObject({
      status: 404,
      response: expect.objectContaining({ code: 'invitation_unavailable' }),
    });
  });

  it('enables writes only for the exact true value', () => {
    expect(bootstrapInvitationWritesEnabled({})).toBe(false);
    expect(
      bootstrapInvitationWritesEnabled({
        BOOTSTRAP_INVITATION_WRITES_ENABLED: 'TRUE',
      }),
    ).toBe(false);
    expect(
      bootstrapInvitationWritesEnabled({
        BOOTSTRAP_INVITATION_WRITES_ENABLED: 'true',
      }),
    ).toBe(true);
  });
});
