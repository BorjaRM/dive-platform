import { describe, expect, it, vi } from 'vitest';
import {
  BootstrapInvitationProviderError,
  ClerkBootstrapInvitationAdapter,
  type ClerkBootstrapInvitationDependencies,
} from './bootstrap-invitations.js';

function dependencies(): ClerkBootstrapInvitationDependencies {
  return {
    createInvitation: vi.fn(),
    getInvitationList: vi.fn(),
    revokeInvitation: vi.fn(),
  };
}

describe('ClerkBootstrapInvitationAdapter (DIVE-ONB-REQ-038, 043..045)', () => {
  it('owns all provider parameters and returns no ticket or URL', async () => {
    const provider = dependencies();
    vi.mocked(provider.createInvitation).mockResolvedValue({
      id: 'inv_1',
      status: 'pending',
      publicMetadata: { diveBootstrapGrantRef: 'grant-1' },
    });
    const adapter = new ClerkBootstrapInvitationAdapter(
      {
        secretKey: 'sk_test_not-real',
        redirectUrl: 'https://auth.example.test/bootstrap/accept',
        requestTimeoutMillis: 15_000,
      },
      provider,
    );
    await expect(
      adapter.create({
        destinationEmail: 'owner@example.test',
        grantRef: 'grant-1',
      }),
    ).resolves.toEqual({ invitationRef: 'inv_1', status: 'pending' });
    expect(provider.createInvitation).toHaveBeenCalledWith({
      emailAddress: 'owner@example.test',
      expiresInDays: 7,
      ignoreExisting: true,
      notify: true,
      publicMetadata: { diveBootstrapGrantRef: 'grant-1' },
      redirectUrl: 'https://auth.example.test/bootstrap/accept',
    });
  });

  it('reconciles ambiguous creates by opaque grant reference across pages', async () => {
    const provider = dependencies();
    vi.mocked(provider.getInvitationList)
      .mockResolvedValueOnce({
        data: [{ id: 'other', status: 'pending', publicMetadata: null }],
        totalCount: 2,
      })
      .mockResolvedValueOnce({
        data: [
          {
            id: 'inv_1',
            status: 'pending',
            publicMetadata: { diveBootstrapGrantRef: 'grant-1' },
          },
        ],
        totalCount: 2,
      });
    const adapter = new ClerkBootstrapInvitationAdapter(
      {
        secretKey: 'sk_test_not-real',
        redirectUrl: 'https://auth.example.test/bootstrap/accept',
        requestTimeoutMillis: 15_000,
      },
      provider,
    );
    await expect(
      adapter.reconcile({
        destinationEmail: 'owner@example.test',
        grantRef: 'grant-1',
      }),
    ).resolves.toEqual({ invitationRef: 'inv_1', status: 'pending' });
    expect(provider.getInvitationList).toHaveBeenLastCalledWith({
      limit: 500,
      offset: 1,
      query: 'owner@example.test',
    });
  });

  it('classifies provider status and Retry-After without exposing error text', async () => {
    const provider = dependencies();
    vi.mocked(provider.createInvitation).mockRejectedValue({
      status: 429,
      retryAfter: 42,
      message: 'provider secret detail',
    });
    const adapter = new ClerkBootstrapInvitationAdapter(
      {
        secretKey: 'sk_test_not-real',
        redirectUrl: 'https://auth.example.test/bootstrap/accept',
        requestTimeoutMillis: 15_000,
      },
      provider,
    );
    const error = await adapter
      .create({ destinationEmail: 'owner@example.test', grantRef: 'grant-1' })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(BootstrapInvitationProviderError);
    expect(error).toMatchObject({ statusCode: 429, retryAfter: '42' });
    expect((error as Error).message).not.toContain('secret');
  });

  it('bounds stalled provider requests with the configured deadline', async () => {
    vi.useFakeTimers();
    try {
      const provider = dependencies();
      vi.mocked(provider.createInvitation).mockReturnValue(
        new Promise(() => undefined),
      );
      const adapter = new ClerkBootstrapInvitationAdapter(
        {
          secretKey: 'sk_test_not-real',
          redirectUrl: 'https://auth.example.test/bootstrap/accept',
          requestTimeoutMillis: 15_000,
        },
        provider,
      );
      const result = adapter.create({
        destinationEmail: 'owner@example.test',
        grantRef: 'grant-1',
      });
      const expectation = expect(result).rejects.toMatchObject({
        statusCode: null,
        retryAfter: null,
        timedOut: true,
      });

      await vi.advanceTimersByTimeAsync(15_000);

      await expectation;
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects redirect URLs outside the exact HTTPS acceptance path', () => {
    expect(
      () =>
        new ClerkBootstrapInvitationAdapter(
          {
            secretKey: 'sk_test_not-real',
            redirectUrl: 'https://auth.example.test/bootstrap/accept?next=x',
            requestTimeoutMillis: 15_000,
          },
          dependencies(),
        ),
    ).toThrow('Invalid BOOTSTRAP_INVITATION_REDIRECT_URL');
  });

  it('allows localhost HTTP only when explicitly enabled for local development', () => {
    expect(
      () =>
        new ClerkBootstrapInvitationAdapter(
          {
            allowInsecureLocalRedirect: true,
            secretKey: 'sk_test_not-real',
            redirectUrl: 'http://localhost:3000/bootstrap/accept',
            requestTimeoutMillis: 15_000,
          },
          dependencies(),
        ),
    ).not.toThrow();

    expect(
      () =>
        new ClerkBootstrapInvitationAdapter(
          {
            secretKey: 'sk_test_not-real',
            redirectUrl: 'http://localhost:3000/bootstrap/accept',
            requestTimeoutMillis: 15_000,
          },
          dependencies(),
        ),
    ).toThrow('Invalid BOOTSTRAP_INVITATION_REDIRECT_URL');
  });
});
