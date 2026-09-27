import { beforeEach, describe, expect, it, vi } from 'vitest';

const clerk = vi.hoisted(() => ({
  createClerkClient: vi.fn(),
  getSession: vi.fn(),
  getUser: vi.fn(),
  verifyToken: vi.fn(),
  verifyWebhook: vi.fn(),
}));

vi.mock('@clerk/backend', () => ({
  createClerkClient: clerk.createClerkClient,
  verifyToken: clerk.verifyToken,
}));

vi.mock('@clerk/backend/webhooks', () => ({
  verifyWebhook: clerk.verifyWebhook,
}));

import {
  ClerkIdentityAdapter,
  type ClerkIdentityAdapterDependencies,
} from './clerk.js';
import { authenticateIdentity } from './index.js';

const config = {
  secretKey: 'sk_test_not-a-real-secret',
  webhookSigningSecret: 'whsec_not-a-real-secret',
  issuer: 'https://clerk.example.test',
  authorizedParties: ['https://dashboard.example.test'],
};

const dependencies: ClerkIdentityAdapterDependencies = {
  verifyToken: clerk.verifyToken,
  getSession: clerk.getSession,
  getUser: clerk.getUser,
  verifyWebhook: clerk.verifyWebhook,
};

function createAdapter() {
  return new ClerkIdentityAdapter(config, dependencies);
}

function activeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sess_123',
    userId: 'user_123',
    status: 'active',
    expireAt: new Date(Date.now() + 60_000).toISOString(),
    ...overrides,
  };
}

function activeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user_123',
    banned: false,
    locked: false,
    emailAddresses: [
      {
        emailAddress: 'verified@example.test',
        verification: { status: 'verified' },
      },
      {
        emailAddress: 'unverified@example.test',
        verification: { status: 'unverified' },
      },
    ],
    ...overrides,
  };
}

describe('ClerkIdentityAdapter (DIVE-IAM-REQ-004, DIVE-IAM-REQ-005, DIVE-IAM-REQ-016, DIVE-IAM-REQ-022)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clerk.verifyToken.mockResolvedValue({
      iss: config.issuer,
      sub: 'user_123',
      sid: 'sess_123',
      azp: config.authorizedParties[0],
      iat: 1_800_000_000,
      fva: [2, -1],
    });
    clerk.getSession.mockResolvedValue(activeSession());
    clerk.getUser.mockResolvedValue(activeUser());
    clerk.createClerkClient.mockReturnValue({
      sessions: { getSession: clerk.getSession },
      users: { getUser: clerk.getUser },
    });
  });

  it('accepts an audience-free token and returns only provider-verified identity data', async () => {
    const adapter = createAdapter();

    await expect(
      authenticateIdentity(adapter, 'session-token'),
    ).resolves.toEqual({
      issuer: config.issuer,
      subject: 'user_123',
      verifiedAddresses: ['verified@example.test'],
      assurance: {
        level: 'single_factor',
        verifiedAt: new Date((1_800_000_000 - 120) * 1_000).toISOString(),
      },
    });
    expect(clerk.verifyToken).toHaveBeenCalledWith('session-token', {
      authorizedParties: config.authorizedParties,
      secretKey: config.secretKey,
    });
    expect(clerk.getSession).toHaveBeenCalledWith('sess_123');
    expect(clerk.getUser).toHaveBeenCalledWith('user_123');
  });

  it('uses the default Clerk SDK wiring for authentication', async () => {
    const adapter = new ClerkIdentityAdapter(config);

    await expect(
      authenticateIdentity(adapter, 'session-token'),
    ).resolves.toMatchObject({
      issuer: config.issuer,
      subject: 'user_123',
    });
    expect(clerk.createClerkClient).toHaveBeenCalledWith({
      secretKey: config.secretKey,
    });
    expect(clerk.verifyToken).toHaveBeenCalledWith('session-token', {
      authorizedParties: config.authorizedParties,
      secretKey: config.secretKey,
    });
    expect(clerk.getSession).toHaveBeenCalledWith('sess_123');
    expect(clerk.getUser).toHaveBeenCalledWith('user_123');
  });

  it.each([
    ['missing', undefined],
    ['unapproved', 'https://other.example.test'],
  ])('rejects a token with %s azp', async (_kind, azp) => {
    clerk.verifyToken.mockResolvedValue({
      iss: config.issuer,
      sub: 'user_123',
      sid: 'sess_123',
      azp,
      iat: 1_800_000_000,
    });

    await expect(createAdapter().authenticate('session-token')).rejects.toThrow(
      'Unauthenticated',
    );
    expect(clerk.getSession).not.toHaveBeenCalled();
    expect(clerk.getUser).not.toHaveBeenCalled();
  });

  it.each([
    ['string', 'dive-dashboard'],
    ['array', ['dive-dashboard']],
  ])('rejects a token carrying an %s audience claim', async (_kind, aud) => {
    clerk.verifyToken.mockResolvedValue({
      iss: config.issuer,
      sub: 'user_123',
      sid: 'sess_123',
      azp: config.authorizedParties[0],
      iat: 1_800_000_000,
      aud,
    });

    await expect(createAdapter().authenticate('session-token')).rejects.toThrow(
      'Unauthenticated',
    );
    expect(clerk.getSession).not.toHaveBeenCalled();
    expect(clerk.getUser).not.toHaveBeenCalled();
  });

  it('allows ordinary authentication when the user has no verified address', async () => {
    clerk.getUser.mockResolvedValue(activeUser({ emailAddresses: [] }));

    await expect(
      createAdapter().authenticate('session-token'),
    ).resolves.toMatchObject({ verifiedAddresses: [] });
  });

  it('accepts numeric Clerk session expiry timestamps expressed in seconds', async () => {
    clerk.getSession.mockResolvedValue(
      activeSession({ expireAt: Math.floor(Date.now() / 1_000) + 60 }),
    );

    await expect(
      createAdapter().authenticate('session-token'),
    ).resolves.toMatchObject({ subject: 'user_123' });
  });

  it('maps second-factor verification into provider-neutral assurance', async () => {
    clerk.verifyToken.mockResolvedValue({
      iss: config.issuer,
      sub: 'user_123',
      sid: 'sess_123',
      azp: config.authorizedParties[0],
      iat: 1_800_000_000,
      fva: [5, 1],
    });

    const principal = await authenticateIdentity(
      createAdapter(),
      'session-token',
    );

    expect(principal.assurance).toEqual({
      level: 'multi_factor',
      verifiedAt: new Date((1_800_000_000 - 60) * 1_000).toISOString(),
    });
  });

  it('allows an ordinary session without optional factor-age claims', async () => {
    clerk.verifyToken.mockResolvedValue({
      iss: config.issuer,
      sub: 'user_123',
      sid: 'sess_123',
      azp: config.authorizedParties[0],
      iat: 1_800_000_000,
    });

    const principal = await authenticateIdentity(
      createAdapter(),
      'session-token',
    );

    expect(principal.assurance).toEqual({
      level: 'single_factor',
      verifiedAt: null,
    });
  });

  it.each([null, false, 0, '', [], [2], ['2', -1]])(
    'rejects malformed factor-age claim %#',
    async (fva) => {
      clerk.verifyToken.mockResolvedValue({
        iss: config.issuer,
        sub: 'user_123',
        sid: 'sess_123',
        azp: config.authorizedParties[0],
        iat: 1_800_000_000,
        fva,
      });

      await expect(
        createAdapter().authenticate('session-token'),
      ).rejects.toThrow('Unauthenticated');
    },
  );

  it.each([
    [
      'invalid or expired token',
      () => clerk.verifyToken.mockRejectedValue(new Error('invalid')),
    ],
    [
      'ended session',
      () =>
        clerk.getSession.mockResolvedValue(activeSession({ status: 'ended' })),
    ],
    [
      'revoked session',
      () =>
        clerk.getSession.mockResolvedValue(
          activeSession({ status: 'revoked' }),
        ),
    ],
    [
      'expired provider session',
      () =>
        clerk.getSession.mockResolvedValue(
          activeSession({ expireAt: new Date(Date.now() - 1).toISOString() }),
        ),
    ],
    [
      'session id mismatch',
      () =>
        clerk.getSession.mockResolvedValue(activeSession({ id: 'sess_other' })),
    ],
    [
      'session subject mismatch',
      () =>
        clerk.getSession.mockResolvedValue(
          activeSession({ userId: 'user_other' }),
        ),
    ],
    [
      'provider outage',
      () => clerk.getSession.mockRejectedValue(new Error('unavailable')),
    ],
    [
      'user lookup outage',
      () => clerk.getUser.mockRejectedValue(new Error('unavailable')),
    ],
    [
      'banned user',
      () => clerk.getUser.mockResolvedValue(activeUser({ banned: true })),
    ],
    [
      'locked user',
      () => clerk.getUser.mockResolvedValue(activeUser({ locked: true })),
    ],
  ])('fails closed for %s', async (_name, arrange) => {
    arrange();
    await expect(createAdapter().authenticate('session-token')).rejects.toThrow(
      'Unauthenticated',
    );
  });

  it('revalidates the token, session, and user on every call', async () => {
    const adapter = createAdapter();
    await expect(adapter.authenticate('session-token')).resolves.toMatchObject({
      subject: 'user_123',
    });
    clerk.getSession.mockResolvedValue(activeSession({ status: 'ended' }));

    await expect(adapter.authenticate('session-token')).rejects.toThrow(
      'Unauthenticated',
    );
    expect(clerk.verifyToken).toHaveBeenCalledTimes(2);
    expect(clerk.getSession).toHaveBeenCalledTimes(2);
    expect(clerk.getUser).toHaveBeenCalledTimes(2);
  });

  it('rejects missing configuration at startup', () => {
    expect(
      () =>
        new ClerkIdentityAdapter({
          ...config,
          secretKey: '',
        }),
    ).toThrow('Missing CLERK_SECRET_KEY');
    expect(
      () =>
        new ClerkIdentityAdapter({
          ...config,
          authorizedParties: [],
        }),
    ).toThrow('Missing CLERK_AUTHORIZED_PARTIES');
  });
});
