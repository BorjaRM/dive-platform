import { generateKeyPairSync, sign } from 'node:crypto';
import { verifyToken } from '@clerk/backend';
import { describe, expect, it, vi } from 'vitest';
import { ClerkIdentityAdapter } from './clerk.js';
import { authenticateIdentity } from './index.js';

const issuer = 'https://clerk.example.test';
const authorizedParty = 'https://dashboard.example.test';
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2_048,
});
const jwtKey = publicKey.export({ type: 'spki', format: 'pem' }).toString();

function encodeJson(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function signedSessionToken(overrides: Record<string, unknown> = {}): string {
  const now = Math.floor(Date.now() / 1_000);
  const signingInput = [
    encodeJson({ alg: 'RS256', typ: 'JWT', kid: 'local-contract-key' }),
    encodeJson({
      iss: issuer,
      sub: 'user_123',
      sid: 'sess_123',
      azp: authorizedParty,
      iat: now,
      nbf: now - 1,
      exp: now + 60,
      ...overrides,
    }),
  ].join('.');
  const signature = sign(
    'RSA-SHA256',
    Buffer.from(signingInput),
    privateKey,
  ).toString('base64url');
  return `${signingInput}.${signature}`;
}

describe('Clerk verifyToken signature contract (DIVE-IAM-REQ-004)', () => {
  it('verifies a locally signed standard session-token fixture with jwtKey', async () => {
    await expect(
      verifyToken(signedSessionToken(), {
        jwtKey,
        authorizedParties: [authorizedParty],
      }),
    ).resolves.toMatchObject({
      iss: issuer,
      sub: 'user_123',
      sid: 'sess_123',
      azp: authorizedParty,
    });
  });

  it('rejects a signed fixture from an unauthorized party', async () => {
    await expect(
      verifyToken(signedSessionToken({ azp: 'https://other.example.test' }), {
        jwtKey,
        authorizedParties: [authorizedParty],
      }),
    ).rejects.toThrow();
  });

  it.each([
    ['expired', { exp: Math.floor(Date.now() / 1_000) - 60 }],
    ['missing expiry', { exp: undefined }],
    ['not active yet', { nbf: Math.floor(Date.now() / 1_000) + 60 }],
    ['issued in the future', { iat: Math.floor(Date.now() / 1_000) + 60 }],
    ['wrong issuer', { iss: 'https://other.example.test' }],
    ['wrong party', { azp: 'https://other.example.test' }],
    ['missing subject', { sub: undefined }],
    ['missing session', { sid: undefined }],
    ['application audience', { aud: 'dashboard' }],
  ])(
    'adapter denies a cryptographically signed token with %s',
    async (_name, claims) => {
      const getSession = vi.fn();
      const getUser = vi.fn();
      const adapter = new ClerkIdentityAdapter(
        {
          secretKey: 'sk_test_synthetic',
          webhookSigningSecret: 'whsec_synthetic',
          issuer,
          authorizedParties: [authorizedParty],
          requestTimeoutMillis: 100,
        },
        {
          verifyToken: (token, options) =>
            verifyToken(token, {
              jwtKey,
              authorizedParties: [...options.authorizedParties],
            }),
          getUser,
          verifyWebhook: vi.fn(),
        },
      );
      await expect(
        authenticateIdentity(adapter, signedSessionToken(claims)),
      ).rejects.toThrow('Unauthenticated');
      expect(getSession).not.toHaveBeenCalled();
      expect(getUser).not.toHaveBeenCalled();
    },
  );

  it('accepts a frozen token despite revoked provider state, then denies it after expiry (DIVE-IAM-REQ-016,022)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const issuedAt = Date.now();
      const token = signedSessionToken();
      const getSession = vi.fn().mockResolvedValue({ status: 'revoked' });
      const getUser = vi.fn().mockResolvedValue({ banned: true, locked: true });
      const adapter = new ClerkIdentityAdapter(
        {
          secretKey: 'sk_test_synthetic',
          webhookSigningSecret: 'whsec_synthetic',
          issuer,
          authorizedParties: [authorizedParty],
          requestTimeoutMillis: 100,
        },
        {
          verifyToken: (value, options) =>
            verifyToken(value, {
              jwtKey,
              authorizedParties: [...options.authorizedParties],
            }),
          getUser,
          verifyWebhook: vi.fn(),
        },
      );
      await expect(authenticateIdentity(adapter, token)).resolves.toMatchObject(
        { subject: 'user_123' },
      );
      vi.setSystemTime(issuedAt + 120_000);
      await expect(authenticateIdentity(adapter, token)).rejects.toThrow(
        'Unauthenticated',
      );
      expect(getSession).not.toHaveBeenCalled();
      expect(getUser).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects a token signed with another private key', async () => {
    const otherPublicKey = generateKeyPairSync('rsa', {
      modulusLength: 2_048,
    }).publicKey;
    await expect(
      verifyToken(signedSessionToken(), {
        jwtKey: otherPublicKey
          .export({ type: 'spki', format: 'pem' })
          .toString(),
        authorizedParties: [authorizedParty],
      }),
    ).rejects.toThrow();
  });
});
