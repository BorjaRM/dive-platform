import { afterEach, describe, expect, it, vi } from 'vitest';
import { BootstrapApiError, completeTenantBootstrap } from './bootstrap-api';

describe('completeTenantBootstrap', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends only the approved setup fields with the Clerk session (DIVE-ONB-REQ-004, DIVE-ONB-REQ-041)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          tenantId: 'tenant-id',
          centerId: 'center-id',
          membershipId: 'membership-id',
          centerKey: 'costa-norte',
        }),
        { status: 201, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const input = {
      operatorDisplayName: 'Océano Azul',
      centerDisplayName: 'Costa Norte',
      timeZone: 'Europe/Madrid',
      locale: 'es' as const,
    };

    await expect(
      completeTenantBootstrap({
        apiBaseUrl: 'https://api.example.test/',
        getToken: async () => 'clerk-session',
        input,
      }),
    ).resolves.toMatchObject({ centerKey: 'costa-norte' });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.test/v1/me/tenant-bootstrap',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Bearer clerk-session',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(input),
        cache: 'no-store',
      }),
    );
  });

  it('fails before the request when the Clerk session is absent', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      completeTenantBootstrap({
        apiBaseUrl: 'https://api.example.test',
        getToken: async () => null,
        input: {
          operatorDisplayName: 'Ocean',
          centerDisplayName: 'North',
          timeZone: 'Europe/Madrid',
          locale: 'en',
        },
      }),
    ).rejects.toEqual(new BootstrapApiError(401, 'session_expired'));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
