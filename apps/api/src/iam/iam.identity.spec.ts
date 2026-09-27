import {
  assertAuthenticatedPrincipal,
  authenticateIdentity,
  DeterministicIdentityProvider,
} from '@dive-center/identity';

describe('IAM identity assertion boundary (DIVE-IAM-REQ-004, DIVE-IAM-REQ-005)', () => {
  it('normalizes a provider result into a trusted provider-neutral assertion', async () => {
    const provider = new DeterministicIdentityProvider(
      new Map([
        [
          'session',
          {
            issuer: ' issuer ',
            subject: ' subject ',
            verifiedAddresses: [' person@example.test '],
          },
        ],
      ]),
    );

    const principal = await authenticateIdentity(provider, 'session');
    expect(principal).toEqual({
      issuer: 'issuer',
      subject: 'subject',
      sessionId: 'session',
      verifiedAddresses: ['person@example.test'],
      assurance: { level: 'single_factor', verifiedAt: null },
    });
    expect(() => assertAuthenticatedPrincipal(principal)).not.toThrow();
    expect(() =>
      assertAuthenticatedPrincipal({
        issuer: 'issuer',
        subject: 'subject',
        sessionId: 'session',
        verifiedAddresses: ['person@example.test'],
      }),
    ).toThrow('Untrusted identity assertion');
  });

  it('allows ordinary authentication without a verified address', async () => {
    const principal = await authenticateIdentity(
      new DeterministicIdentityProvider(
        new Map([
          [
            'session',
            {
              issuer: 'issuer',
              subject: 'subject',
              verifiedAddresses: [],
            },
          ],
        ]),
      ),
      'session',
    );

    expect(principal.verifiedAddresses).toEqual([]);
    expect(() => assertAuthenticatedPrincipal(principal)).not.toThrow();
  });

  it('propagates unexpected provider failures', async () => {
    await expect(
      authenticateIdentity(
        {
          authenticate: async () => {
            throw new Error('provider unavailable');
          },
        },
        'provider-session',
      ),
    ).rejects.toThrow('provider unavailable');
  });

  it.each([
    {
      issuer: '',
      subject: 'subject',
      sessionId: 'session',
      verifiedAddresses: ['a@example.test'],
      assurance: { level: 'single_factor' as const, verifiedAt: null },
    },
    {
      issuer: 'issuer',
      subject: '   ',
      sessionId: 'session',
      verifiedAddresses: ['a@example.test'],
      assurance: { level: 'single_factor' as const, verifiedAt: null },
    },
    {
      issuer: 'issuer',
      subject: 'subject',
      sessionId: 'session',
      verifiedAddresses: [' '],
      assurance: { level: 'single_factor' as const, verifiedAt: null },
    },
    {
      issuer: 'issuer',
      subject: 'subject',
      sessionId: 'session',
      verifiedAddresses: 'not-an-array',
      assurance: { level: 'single_factor' as const, verifiedAt: null },
    },
    {
      issuer: 'issuer',
      subject: 'subject',
      sessionId: 'session',
      verifiedAddresses: [],
    },
  ])('rejects malformed provider output %#', async (principal) => {
    await expect(
      authenticateIdentity(
        {
          authenticate: async () =>
            principal as Awaited<
              ReturnType<
                InstanceType<
                  typeof DeterministicIdentityProvider
                >['authenticate']
              >
            >,
        },
        'provider-session',
      ),
    ).rejects.toThrow('Unauthenticated');
  });
});
