import { describe, expect, it, vi } from 'vitest';
import {
  ClerkOrdinaryInvitationAdapter,
  OrdinaryInvitationProviderError,
  type ClerkOrdinaryInvitationDependencies,
} from './ordinary-invitations.js';

function dependencies(): ClerkOrdinaryInvitationDependencies {
  return {
    createInvitation: vi.fn(),
    getInvitationList: vi.fn(),
    revokeInvitation: vi.fn(),
  };
}

describe('ClerkOrdinaryInvitationAdapter (DIVE-IAM-REQ-017)', () => {
  it('uses ordinary-only metadata and redirect values', async () => {
    const provider = dependencies();
    vi.mocked(provider.createInvitation).mockResolvedValue({
      id: 'inv_ordinary_1',
      status: 'pending',
      publicMetadata: { diveOrdinaryInvitationAttemptId: 'attempt-1' },
    });
    const adapter = new ClerkOrdinaryInvitationAdapter(
      {
        authenticationOrigin: 'https://auth.example.test',
        secretKey: 'sk_test_not-real',
        redirectUrl: 'https://auth.example.test/invitations/accept',
        requestTimeoutMillis: 15_000,
      },
      provider,
    );

    await expect(
      adapter.create({
        targetAddress: 'invitee@example.test',
        invitationAttemptId: 'attempt-1',
      }),
    ).resolves.toEqual({ invitationRef: 'inv_ordinary_1', status: 'pending' });
    expect(provider.createInvitation).toHaveBeenCalledWith({
      emailAddress: 'invitee@example.test',
      expiresInDays: 7,
      ignoreExisting: true,
      notify: true,
      publicMetadata: {
        diveOrdinaryInvitationAttemptId: 'attempt-1',
      },
      redirectUrl: 'https://auth.example.test/invitations/accept',
    });
  });

  it('reconciles by the immutable local attempt reference', async () => {
    const provider = dependencies();
    vi.mocked(provider.getInvitationList).mockResolvedValue({
      data: [
        {
          id: 'inv_ordinary_1',
          status: 'pending',
          publicMetadata: { diveOrdinaryInvitationAttemptId: 'attempt-1' },
        },
      ],
      totalCount: 1,
    });
    const adapter = new ClerkOrdinaryInvitationAdapter(
      {
        authenticationOrigin: 'https://auth.example.test',
        secretKey: 'sk_test_not-real',
        redirectUrl: 'https://auth.example.test/invitations/accept',
        requestTimeoutMillis: 15_000,
      },
      provider,
    );

    await expect(
      adapter.reconcile({
        targetAddress: 'invitee@example.test',
        invitationAttemptId: 'attempt-1',
      }),
    ).resolves.toEqual({ invitationRef: 'inv_ordinary_1', status: 'pending' });
  });

  it('fails closed when the local attempt matches multiple provider invitations', async () => {
    const provider = dependencies();
    vi.mocked(provider.getInvitationList).mockResolvedValue({
      data: [
        {
          id: 'inv_ordinary_1',
          status: 'pending',
          publicMetadata: { diveOrdinaryInvitationAttemptId: 'attempt-1' },
        },
        {
          id: 'inv_ordinary_2',
          status: 'pending',
          publicMetadata: { diveOrdinaryInvitationAttemptId: 'attempt-1' },
        },
      ],
      totalCount: 2,
    });
    const adapter = new ClerkOrdinaryInvitationAdapter(
      {
        authenticationOrigin: 'https://auth.example.test',
        secretKey: 'sk_test_not-real',
        redirectUrl: 'https://auth.example.test/invitations/accept',
        requestTimeoutMillis: 15_000,
      },
      provider,
    );

    await expect(
      adapter.reconcile({
        targetAddress: 'invitee@example.test',
        invitationAttemptId: 'attempt-1',
      }),
    ).rejects.toMatchObject({
      name: 'AmbiguousProviderStateError',
      statusCode: null,
    });
  });

  it('keeps provider failures opaque and treats a missing revoke as success', async () => {
    const provider = dependencies();
    vi.mocked(provider.createInvitation).mockRejectedValue({
      status: 503,
      message: 'provider secret detail',
    });
    vi.mocked(provider.revokeInvitation).mockRejectedValue({ status: 404 });
    const adapter = new ClerkOrdinaryInvitationAdapter(
      {
        authenticationOrigin: 'https://auth.example.test',
        secretKey: 'sk_test_not-real',
        redirectUrl: 'https://auth.example.test/invitations/accept',
        requestTimeoutMillis: 15_000,
      },
      provider,
    );

    const error = await adapter
      .create({
        targetAddress: 'invitee@example.test',
        invitationAttemptId: 'attempt-1',
      })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(OrdinaryInvitationProviderError);
    expect(error).toMatchObject({ statusCode: 503 });
    expect((error as Error).message).not.toContain('secret');
    await expect(adapter.revoke('inv_missing')).resolves.toEqual({
      invitationRef: 'inv_missing',
      status: 'not_found',
    });
  });

  it('rejects the bootstrap route for the ordinary adapter', () => {
    expect(
      () =>
        new ClerkOrdinaryInvitationAdapter(
          {
            authenticationOrigin: 'https://auth.example.test',
            secretKey: 'sk_test_not-real',
            redirectUrl: 'https://auth.example.test/bootstrap/accept',
            requestTimeoutMillis: 15_000,
          },
          dependencies(),
        ),
    ).toThrow('Invalid ORDINARY_INVITATION_REDIRECT_URL');
  });
});
