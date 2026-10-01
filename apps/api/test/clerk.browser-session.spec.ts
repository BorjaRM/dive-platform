import { ClerkAPIResponseError } from '@clerk/backend/errors';
import type { Browser, Page } from 'playwright';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assertClerkSessionCannotMintToken,
  completeClerkSignIn,
  createClerkBrowserSession,
} from './clerk.browser-session.js';

function signInPage(): Page {
  const locator = {
    first: () => locator,
    filter: () => locator,
    getByRole: () => locator,
    waitFor: vi.fn(),
    fill: vi.fn(),
    click: vi.fn(),
  };
  return {
    setDefaultTimeout: vi.fn(),
    goto: vi.fn(),
    locator: () => locator,
    waitForFunction: vi.fn(),
    url: () => 'https://auth.example.test/default-redirect',
    evaluate: async (
      callback: (argument: unknown) => unknown,
      argument: unknown,
    ) => callback(argument),
  } as unknown as Page;
}

afterEach(() => vi.unstubAllGlobals());

describe('Clerk sandbox token-issuance denial evidence', () => {
  it('accepts only the documented session-not-found refusal', async () => {
    const error = new ClerkAPIResponseError('synthetic', {
      status: 404,
      data: [{ code: 'resource_not_found', message: 'synthetic' }],
    });
    await expect(
      assertClerkSessionCannotMintToken(async () => {
        throw error;
      }),
    ).resolves.toBeUndefined();
  });

  it.each([400, 401, 403, 429, 500, 503, 504])(
    'does not count HTTP %s as denial evidence',
    async (status) => {
      const error = new ClerkAPIResponseError('synthetic', {
        status,
        data: [{ code: 'resource_not_found', message: 'synthetic' }],
      });
      await expect(
        assertClerkSessionCannotMintToken(async () => {
          throw error;
        }),
      ).rejects.toThrow('without a documented session denial');
    },
  );

  it.each([
    new Error('timeout'),
    { status: 404, errors: [{ code: 'resource_not_found' }] },
    new ClerkAPIResponseError('synthetic', { status: 404, data: [] }),
    new ClerkAPIResponseError('synthetic', {
      status: 404,
      data: [{ code: 'unexpected', message: 'synthetic' }],
    }),
  ])('rejects ambiguous errors %#', async (error) => {
    await expect(
      assertClerkSessionCannotMintToken(async () => {
        throw error;
      }),
    ).rejects.toThrow('without a documented session denial');
  });

  it('fails when the revoked session still obtains a token', async () => {
    await expect(
      assertClerkSessionCannotMintToken(async () => ({ jwt: 'synthetic' })),
    ).rejects.toThrow('still issued a token');
  });
});

describe('Clerk sandbox session cleanup registration', () => {
  it.each(['rejected', 'missing'] as const)(
    'registers a created session before %s token retrieval fails',
    async (failure) => {
      const registered: string[] = [];
      vi.stubGlobal('Clerk', {
        session: {
          id: 'session_sandbox',
          getToken: async () => {
            expect(registered).toEqual(['session_sandbox']);
            if (failure === 'rejected')
              throw new Error('Token retrieval failed');
            return null;
          },
        },
      });
      const close = vi.fn();
      const browser = {
        newContext: async () => ({ newPage: async () => signInPage(), close }),
      } as unknown as Browser;
      await expect(
        createClerkBrowserSession({
          browser,
          accountPortalUrl: 'https://auth.example.test',
          email: 'technical@example.test',
          password: 'synthetic-password',
          onSessionCreated: (sessionId) => registered.push(sessionId),
        }),
      ).rejects.toThrow(
        failure === 'rejected'
          ? 'Token retrieval failed'
          : 'Clerk browser session token is missing',
      );
      expect(registered).toEqual(['session_sandbox']);
      expect(close).toHaveBeenCalledOnce();
    },
  );

  it('returns the registered session and its token on success', async () => {
    const registered: string[] = [];
    vi.stubGlobal('Clerk', {
      session: {
        id: 'session_sandbox',
        getToken: async () => 'synthetic-token',
      },
    });
    await expect(
      completeClerkSignIn(signInPage(), {
        email: 'technical@example.test',
        password: 'synthetic-password',
        onSessionCreated: (sessionId) => registered.push(sessionId),
      }),
    ).resolves.toEqual({ id: 'session_sandbox', token: 'synthetic-token' });
    expect(registered).toEqual(['session_sandbox']);
  });
});
