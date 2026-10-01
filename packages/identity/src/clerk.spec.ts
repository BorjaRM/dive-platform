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
import {
  authenticateIdentity,
  IdentityProviderUnavailableError,
  InvalidIdentityCredentialsError,
  resolveVerifiedIdentity,
} from './index.js';

const config = {
  secretKey: 'sk_test_not-a-real-secret',
  webhookSigningSecret: 'whsec_not-a-real-secret',
  issuer: 'https://clerk.example.test',
  authorizedParties: ['https://dashboard.example.test'],
  requestTimeoutMillis: 100,
};

const dependencies: ClerkIdentityAdapterDependencies = {
  verifyToken: clerk.verifyToken,
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

  it('authenticates a verified JWT without session or user lookups', async () => {
    await expect(
      authenticateIdentity(createAdapter(), 'session-token'),
    ).resolves.toMatchObject({
      subject: 'user_123',
      sessionId: 'sess_123',
      verifiedAddresses: [],
    });
    expect(clerk.getSession).not.toHaveBeenCalled();
    expect(clerk.getUser).not.toHaveBeenCalled();
  });

  it('accepts an audience-free token and returns only verified token identity data', async () => {
    const adapter = createAdapter();

    await expect(
      authenticateIdentity(adapter, 'session-token'),
    ).resolves.toEqual({
      issuer: config.issuer,
      subject: 'user_123',
      sessionId: 'sess_123',
      verifiedAddresses: [],
      assurance: {
        level: 'single_factor',
        verifiedAt: new Date((1_800_000_000 - 120) * 1_000).toISOString(),
      },
    });
    expect(clerk.verifyToken).toHaveBeenCalledWith(
      'session-token',
      {
        authorizedParties: config.authorizedParties,
        secretKey: config.secretKey,
      },
      expect.any(AbortSignal),
    );
    expect(clerk.getSession).not.toHaveBeenCalled();
    expect(clerk.getUser).not.toHaveBeenCalled();
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
    expect(clerk.getSession).not.toHaveBeenCalled();
    expect(clerk.getUser).not.toHaveBeenCalled();
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

  it('resolves verified addresses explicitly for the authenticated identity', async () => {
    const adapter = createAdapter();
    const principal = await authenticateIdentity(adapter, 'session-token');
    const verified = await resolveVerifiedIdentity(adapter, principal);
    expect(verified).toEqual({
      ...principal,
      verifiedAddresses: ['verified@example.test'],
    });
    expect(principal.verifiedAddresses).toEqual([]);
    expect(clerk.getUser).toHaveBeenCalledWith(
      'user_123',
      expect.any(AbortSignal),
    );
    expect(clerk.getSession).not.toHaveBeenCalled();
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
      () =>
        clerk.verifyToken.mockRejectedValue(
          Object.assign(new Error('invalid'), { status: 401 }),
        ),
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
      'banned user',
      () => clerk.getUser.mockResolvedValue(activeUser({ banned: true })),
    ],
    [
      'locked user',
      () => clerk.getUser.mockResolvedValue(activeUser({ locked: true })),
    ],
  ])(
    'uses token validity rather than provider status for %s',
    async (_name, arrange) => {
      arrange();
      if (_name === 'invalid or expired token') {
        await expect(
          createAdapter().authenticate('session-token'),
        ).rejects.toThrow('Unauthenticated');
      } else {
        await expect(
          createAdapter().authenticate('session-token'),
        ).resolves.toMatchObject({
          subject: 'user_123',
          verifiedAddresses: [],
        });
      }
      expect(clerk.getSession).not.toHaveBeenCalled();
      expect(clerk.getUser).not.toHaveBeenCalled();
    },
  );

  it('classifies provider outages separately from invalid credentials', async () => {
    clerk.verifyToken.mockRejectedValue(new Error('unavailable'));

    await expect(createAdapter().authenticate('session-token')).rejects.toThrow(
      'Identity provider unavailable',
    );
  });

  it('passes the deadline signal to provider operations', async () => {
    let receivedSignal: AbortSignal | undefined;
    const dependencies: ClerkIdentityAdapterDependencies = {
      ...({
        verifyToken: clerk.verifyToken,
        getUser: clerk.getUser,
        verifyWebhook: clerk.verifyWebhook,
      } satisfies ClerkIdentityAdapterDependencies),
      verifyToken: async (token, options, signal) => {
        receivedSignal = signal;
        return clerk.verifyToken(token, options, signal);
      },
    };

    const signaledAdapter = new ClerkIdentityAdapter(config, dependencies);
    await signaledAdapter.authenticate('session-token');
    expect(receivedSignal).toBeInstanceOf(AbortSignal);
  });

  it('bounds a provider operation that never resolves', async () => {
    let aborted = false;
    const dependencies: ClerkIdentityAdapterDependencies = {
      verifyToken: async (_token, _options, signal) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener(
            'abort',
            () => {
              aborted = true;
              reject(new Error('aborted'));
            },
            { once: true },
          );
        }),
      getUser: clerk.getUser,
      verifyWebhook: clerk.verifyWebhook,
    };

    await expect(
      new ClerkIdentityAdapter(
        { ...config, requestTimeoutMillis: 10 },
        dependencies,
      ).authenticate('session-token'),
    ).rejects.toThrow('Identity provider unavailable');
    expect(aborted).toBe(true);
  });

  it('revalidates the token on every call without consulting revoked provider state', async () => {
    const adapter = createAdapter();
    await expect(adapter.authenticate('session-token')).resolves.toMatchObject({
      subject: 'user_123',
    });
    clerk.getSession.mockResolvedValue(activeSession({ status: 'ended' }));

    await expect(adapter.authenticate('session-token')).resolves.toMatchObject({
      subject: 'user_123',
    });
    expect(clerk.verifyToken).toHaveBeenCalledTimes(2);
    expect(clerk.getSession).not.toHaveBeenCalled();
    expect(clerk.getUser).not.toHaveBeenCalled();
  });

  it.each([
    ['wrong provider user', { id: 'user_other' }],
    ['missing addresses', { emailAddresses: null }],
    ['malformed address', { emailAddresses: [{ emailAddress: 1 }] }],
    [
      'malformed verification',
      {
        emailAddresses: [
          { emailAddress: 'a@example.test', verification: false },
        ],
      },
    ],
  ])('rejects verified-address lookup with %s', async (_name, overrides) => {
    const adapter = createAdapter();
    const principal = await authenticateIdentity(adapter, 'session-token');
    clerk.getUser.mockResolvedValue(activeUser(overrides));
    await expect(resolveVerifiedIdentity(adapter, principal)).rejects.toThrow(
      'Unauthenticated',
    );
  });

  it('does not use blocking state as a condition for verified-address lookup', async () => {
    const adapter = createAdapter();
    const principal = await authenticateIdentity(adapter, 'session-token');
    clerk.getUser.mockResolvedValue(activeUser({ banned: true, locked: true }));
    await expect(
      resolveVerifiedIdentity(adapter, principal),
    ).resolves.toMatchObject({
      verifiedAddresses: ['verified@example.test'],
    });
    expect(clerk.getSession).not.toHaveBeenCalled();
  });

  it('fails closed when verified-address lookup is unavailable', async () => {
    const adapter = createAdapter();
    const principal = await authenticateIdentity(adapter, 'session-token');
    clerk.getUser.mockRejectedValue(new Error('unavailable'));
    await expect(resolveVerifiedIdentity(adapter, principal)).rejects.toThrow(
      'Identity provider unavailable',
    );
    await expect(adapter.authenticate('session-token')).resolves.toMatchObject({
      subject: 'user_123',
    });
  });

  it.each([400, 401, 403, 429, 500])(
    'classifies rejected server credentials or user-endpoint failures (%s) as operational',
    async (status) => {
      const adapter = createAdapter();
      const principal = await authenticateIdentity(adapter, 'session-token');
      clerk.getUser.mockRejectedValue(
        Object.assign(new Error('provider failure'), { status }),
      );
      await expect(
        resolveVerifiedIdentity(adapter, principal),
      ).rejects.toBeInstanceOf(IdentityProviderUnavailableError);
    },
  );

  it('denies verified-address lookup when the provider user no longer exists', async () => {
    const adapter = createAdapter();
    const principal = await authenticateIdentity(adapter, 'session-token');
    clerk.getUser.mockRejectedValue(
      Object.assign(new Error('missing user'), { status: 404 }),
    );
    await expect(
      resolveVerifiedIdentity(adapter, principal),
    ).rejects.toBeInstanceOf(InvalidIdentityCredentialsError);
  });

  it.each([
    { iat: 1_800_000_000, fva: [Number.MAX_VALUE, -1] },
    { iat: Number.MAX_VALUE, fva: [0, -1] },
    { iat: 1_800_000_000, fva: [200_000_000_000, -1] },
  ])(
    'rejects unrepresentable factor-age dates without a RangeError %#',
    async (claims) => {
      clerk.verifyToken.mockResolvedValue({
        iss: config.issuer,
        sub: 'user_123',
        sid: 'sess_123',
        azp: config.authorizedParties[0],
        ...claims,
      });
      await expect(
        createAdapter().authenticate('session-token'),
      ).rejects.toBeInstanceOf(InvalidIdentityCredentialsError);
    },
  );

  it('rejects an untrusted principal before looking up its addresses', async () => {
    const adapter = createAdapter();
    const principal = await authenticateIdentity(adapter, 'session-token');
    await expect(
      resolveVerifiedIdentity(adapter, { ...principal }),
    ).rejects.toThrow('Untrusted identity assertion');
    expect(clerk.getUser).not.toHaveBeenCalled();
  });

  it('rejects a principal from another issuer before looking up its addresses', async () => {
    const principal = await authenticateIdentity(
      {
        authenticate: async () => ({
          issuer: 'https://other.example.test',
          subject: 'user_123',
          sessionId: 'sess_123',
          verifiedAddresses: [],
          assurance: { level: 'single_factor', verifiedAt: null },
        }),
      },
      'other-token',
    );
    await expect(
      resolveVerifiedIdentity(createAdapter(), principal),
    ).rejects.toThrow('Unauthenticated');
    expect(clerk.getUser).not.toHaveBeenCalled();
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
