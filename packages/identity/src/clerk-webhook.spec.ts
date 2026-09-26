import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ClerkIdentityAdapter } from './clerk.js';

const secretBytes = Buffer.from('clerk-webhook-test-secret');
const signingSecret = `whsec_${secretBytes.toString('base64')}`;
const config = {
  secretKey: 'sk_test_not-a-real-secret',
  webhookSigningSecret: signingSecret,
  issuer: 'https://clerk.example.test',
  authorizedParties: ['https://dashboard.example.test'],
};

function signedHeaders(
  body: string,
  timestamp = Math.floor(Date.now() / 1_000),
) {
  const providerEventId = 'evt_clerk_123';
  const signature = createHmac('sha256', secretBytes)
    .update(`${providerEventId}.${timestamp}.${body}`)
    .digest('base64');
  return {
    'content-type': 'application/json',
    'svix-id': providerEventId,
    'svix-signature': `v1,${signature}`,
    'svix-timestamp': String(timestamp),
  };
}

describe('Clerk webhook verification (DIVE-IAM-REQ-021)', () => {
  it('uses the official verifier and preserves the signed provider event id', async () => {
    const updatedAt = Date.now();
    const body = JSON.stringify({
      type: 'user.deleted',
      data: { id: 'user_123', updated_at: updatedAt },
    });

    await expect(
      new ClerkIdentityAdapter(config).verify(
        new TextEncoder().encode(body),
        signedHeaders(body),
      ),
    ).resolves.toEqual({
      providerEventId: 'evt_clerk_123',
      issuer: config.issuer,
      type: 'user.deleted',
      subject: 'user_123',
      occurredAt: new Date(updatedAt).toISOString(),
    });
  });

  it('rejects a changed raw body and the SDK default stale timestamp boundary', async () => {
    const body = JSON.stringify({
      type: 'session.revoked',
      data: { id: 'sess_123', user_id: 'user_123', updated_at: Date.now() },
    });
    const adapter = new ClerkIdentityAdapter(config);

    await expect(
      adapter.verify(new TextEncoder().encode(`${body} `), signedHeaders(body)),
    ).rejects.toThrow();
    await expect(
      adapter.verify(
        new TextEncoder().encode(body),
        signedHeaders(body, Math.floor(Date.now() / 1_000) - 301),
      ),
    ).rejects.toThrow();
  });

  it('normalizes unknown events without resolving an identity or granting access', async () => {
    const body = JSON.stringify({
      type: 'organization.updated',
      data: { id: 'org_123', updated_at: Date.now() },
    });

    await expect(
      new ClerkIdentityAdapter(config).verify(
        new TextEncoder().encode(body),
        signedHeaders(body),
      ),
    ).resolves.toMatchObject({
      type: 'organization.updated',
      subject: null,
    });
  });

  it.each([
    ['user.created', { id: 'user_123' }, 'user_123'],
    ['user.updated', { id: 'user_123' }, 'user_123'],
    ['session.created', { user_id: 'user_123' }, 'user_123'],
    ['session.ended', { user_id: 'user_123' }, 'user_123'],
    ['session.removed', { user_id: 'user_123' }, 'user_123'],
    ['session.revoked', { user_id: 'user_123' }, 'user_123'],
  ])(
    'keeps known %s events non-authorizing and non-revoking',
    async (type, data, subject) => {
      const body = JSON.stringify({ type, data });

      await expect(
        new ClerkIdentityAdapter(config).verify(
          new TextEncoder().encode(body),
          signedHeaders(body),
        ),
      ).resolves.toMatchObject({
        type,
        subject,
      });
    },
  );
});
