import { generateKeyPairSync, sign } from 'node:crypto';
import { verifyToken } from '@clerk/backend';
import { describe, expect, it } from 'vitest';

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
});
