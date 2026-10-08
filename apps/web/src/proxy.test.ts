import { clerkMiddleware } from '@clerk/nextjs/server';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { proxy } from './proxy';

vi.mock('@clerk/nextjs/server', () => ({
  clerkMiddleware: vi.fn((handler) => handler),
}));

describe('public product proxy', () => {
  beforeEach(() => {
    vi.stubEnv('PUBLIC_PRODUCT_ORIGIN', 'https://bluecurrent.example');
    vi.stubEnv('PUBLIC_PRODUCT_CONTACT_EMAIL', 'hola@bluecurrent.example');
    vi.stubEnv('PUBLIC_PRODUCT_INDEXABLE', 'false');
    vi.stubEnv('AUTHENTICATION_ORIGIN', 'https://auth.example.test');
    vi.stubEnv('CENTER_APP_BASE_DOMAIN', 'app.example.test');
    vi.stubEnv('BFF_API_ORIGIN', 'https://api.example.test');
    vi.stubEnv('NEXT_PUBLIC_DASHBOARD_REQUEST_TIMEOUT_MS', '5000');
    vi.stubEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('serves the canonical root without adding auth or tenant state', async () => {
    const response = await proxy(
      new NextRequest('https://bluecurrent.example/?source=direct'),
    );

    expect(response.status).toBe(200);
  });

  it('redirects www permanently while preserving the path and query', async () => {
    const response = await proxy(
      new NextRequest('https://www.bluecurrent.example/robots.txt?check=1'),
    );

    expect(response.status).toBe(308);
    expect(response.headers.get('location')).toBe(
      'https://bluecurrent.example/robots.txt?check=1',
    );
  });

  it.each([
    'https://center.app.bluecurrent.example/',
    'https://bluecurrent.preview.example/',
    'https://unknown.example/',
  ])('fails closed for %s', async (url) => {
    expect((await proxy(new NextRequest(url))).status).toBe(404);
  });

  it('rejects unknown application hosts before authentication or data rendering', async () => {
    expect(
      (await proxy(new NextRequest('https://unknown.example/dashboard')))
        .status,
    ).toBe(404);
  });

  it.each(['https://alpha.app.example.test', 'https://unknown.example'])(
    'denies platform pages on %s before fetching center data',
    async (origin) => {
      const upstream = vi.spyOn(globalThis, 'fetch');
      expect(
        (await proxy(new NextRequest(`${origin}/platform/invitations`))).status,
      ).toBe(404);
      expect(upstream).not.toHaveBeenCalled();
    },
  );

  it.each([
    '/platform/invitations',
    '/sign-in?redirect_url=https://auth.example.test/platform/invitations',
  ])('preserves the canonical platform login destination %s', async (path) => {
    const response = await proxy(
      new NextRequest(`https://auth.example.test${path}`, {
        headers: { 'x-dive-platform-return': 'https://evil.test' },
      }),
    );
    expect(response.status).toBe(200);
    expect(
      response.headers.get('x-middleware-request-x-dive-platform-return'),
    ).toBe('https://auth.example.test/platform/invitations');
  });

  it('discards a forged platform return outside the approved route', async () => {
    const response = await proxy(
      new NextRequest(
        'https://auth.example.test/sign-in?redirect_url=https://evil.test',
        { headers: { 'x-dive-platform-return': 'https://evil.test' } },
      ),
    );
    expect(
      response.headers.has('x-middleware-request-x-dive-platform-return'),
    ).toBe(false);
  });

  it('returns a configuration error instead of selecting a host default', async () => {
    vi.stubEnv('PUBLIC_PRODUCT_ORIGIN', '');

    expect(
      (await proxy(new NextRequest('https://bluecurrent.example/'))).status,
    ).toBe(500);
  });

  it('uses active entry for roots but leaves existing dashboard handles to API revalidation', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': 'https://alpha.app.example.test',
        },
      }),
    );
    expect(
      (await proxy(new NextRequest('https://alpha.app.example.test/dashboard')))
        .status,
    ).toBe(200);
    expect(
      (
        await proxy(new NextRequest('https://alpha.app.example.test/'))
      ).headers.get('location'),
    ).toBe('https://alpha.app.example.test/dashboard');
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    expect(
      (await proxy(new NextRequest('https://alpha.app.example.test/dashboard')))
        .status,
    ).toBe(200);
    expect(
      (await proxy(new NextRequest('https://alpha.app.example.test/'))).status,
    ).toBe(404);
  });

  it('rejects an internal HTTP origin without an ingress protocol', async () => {
    const response = await proxy(
      new NextRequest('http://next-internal.local/dashboard', {
        headers: { host: 'alpha.app.example.test' },
      }),
    );

    expect(response.status).toBe(404);
  });

  it('uses the ingress protocol when TLS terminates before the framework', async () => {
    const response = await proxy(
      new NextRequest('http://next-internal.local/dashboard', {
        headers: {
          host: 'alpha.app.example.test',
          'x-forwarded-proto': 'https',
        },
      }),
    );

    expect(response.status).toBe(200);
  });

  it('rejects an ambiguous ingress protocol instead of choosing one', async () => {
    const response = await proxy(
      new NextRequest('https://next-internal.local/dashboard', {
        headers: {
          host: 'alpha.app.example.test',
          'x-forwarded-proto': 'https, http',
        },
      }),
    );

    expect(response.status).toBe(404);
  });

  it('strips forged return headers and validates only active canonical return destinations', async () => {
    const denied = await proxy(
      new NextRequest(
        'https://auth.example.test/sign-in?redirect_url=https://evil.test/dashboard',
        { headers: { 'x-dive-center-return': 'https://evil.test' } },
      ),
    );
    expect(
      denied.headers.has('x-middleware-request-x-dive-center-return'),
    ).toBe(false);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': 'https://alpha.app.example.test',
        },
      }),
    );
    const allowed = await proxy(
      new NextRequest(
        'https://auth.example.test/sign-in?redirect_url=https://alpha.app.example.test/dashboard',
      ),
    );
    expect(
      allowed.headers.get('x-middleware-request-x-dive-center-return'),
    ).toBe('https://alpha.app.example.test/dashboard');
  });

  it.each(['test-center', 'ocean-north'])(
    'keeps local center %s behind active mapping and canonical login',
    async (centerKey) => {
      vi.stubEnv('NODE_ENV', 'development');
      vi.stubEnv('AUTHENTICATION_ORIGIN', 'http://localhost:3000');
      vi.stubEnv('CENTER_APP_BASE_DOMAIN', 'app.localhost');
      vi.stubEnv('CENTER_APP_BASE_ORIGIN', 'http://app.localhost:3000');
      const origin = `http://${centerKey}.app.localhost:3000`;
      const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(null, {
          status: 204,
          headers: { 'Access-Control-Allow-Origin': origin },
        }),
      );
      expect((await proxy(new NextRequest(`${origin}/dashboard`))).status).toBe(
        200,
      );
      expect(
        (await proxy(new NextRequest(`${origin}/`))).headers.get('location'),
      ).toBe(`${origin}/dashboard`);
      const login = await proxy(new NextRequest(`${origin}/sign-in`));
      const loginUrl = new URL(login.headers.get('location') ?? '');
      expect(loginUrl.origin).toBe('http://localhost:3000');
      expect(loginUrl.searchParams.get('redirect_url')).toBe(
        `${origin}/dashboard`,
      );
      const returned = await proxy(
        new NextRequest(
          `http://localhost:3000/sign-in?redirect_url=${encodeURIComponent(`${origin}/dashboard`)}`,
        ),
      );
      expect(
        returned.headers.get('x-middleware-request-x-dive-center-return'),
      ).toBe(`${origin}/dashboard`);
      expect(
        (await proxy(new NextRequest(`${origin}/bootstrap/setup`))).status,
      ).toBe(404);
      expect(
        (
          await proxy(
            new NextRequest(`http://${centerKey}.app.localhost:4000/dashboard`),
          )
        ).status,
      ).toBe(404);
      fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
      expect((await proxy(new NextRequest(`${origin}/dashboard`))).status).toBe(
        200,
      );
    },
  );

  it('forwards a validated Clerk sync return without dropping its protocol parameter', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': 'https://alpha.app.example.test',
        },
      }),
    );
    const destination =
      'https://alpha.app.example.test/dashboard?__clerk_synced=false';
    const response = await proxy(
      new NextRequest(
        `https://auth.example.test/sign-in?redirect_url=${encodeURIComponent(destination)}`,
      ),
    );
    expect(
      response.headers.get('x-middleware-request-x-dive-center-return'),
    ).toBe(destination);
  });

  it.each([
    'https://alpha.app.example.test/',
    'https://auth.example.test/sign-in?redirect_url=https://alpha.app.example.test/dashboard',
  ])(
    'reports resolver failure as unavailable for %s without mounting Clerk',
    async (url) => {
      vi.mocked(clerkMiddleware).mockClear();
      const reportError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(null, { status: 503 }),
      );
      const response = await proxy(new NextRequest(url));
      expect(response.status).toBe(503);
      expect(await response.text()).toBe('Application unavailable');
      expect(reportError).toHaveBeenCalledWith(
        'Center origin verification unavailable',
        expect.objectContaining({ origin: new URL(url).origin }),
      );
      expect(clerkMiddleware).not.toHaveBeenCalled();
    },
  );

  it('reports timeouts instead of claiming a center does not exist', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      new DOMException('aborted', 'TimeoutError'),
    );
    expect(
      (await proxy(new NextRequest('https://alpha.app.example.test/'))).status,
    ).toBe(503);
  });

  it('keeps sign-in on the single authentication host and rejects setup on center hosts', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': 'https://alpha.app.example.test',
        },
      }),
    );
    const response = await proxy(
      new NextRequest('https://alpha.app.example.test/sign-in'),
    );
    expect(response.headers.get('location')).toBe(
      'https://auth.example.test/sign-in?redirect_url=https%3A%2F%2Falpha.app.example.test%2Fdashboard',
    );
    expect(
      (
        await proxy(
          new NextRequest('https://alpha.app.example.test/bootstrap/setup'),
        )
      ).status,
    ).toBe(404);
  });

  it.each(['redirect_url', '__clerk_redirect_url'])(
    'keeps center sign-in with %s on the authentication host when the root domain is shared',
    async (parameter) => {
      vi.stubEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'pk_test_fixture');
      vi.mocked(clerkMiddleware).mockClear();
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': 'https://alpha.app.example.test',
          },
        }),
      );
      const response = await proxy(
        new NextRequest(
          `https://alpha.app.example.test/sign-in?${parameter}=https%3A%2F%2Fevil.test%2Fdashboard`,
        ),
      );
      expect(response.headers.get('location')).toBe(
        'https://auth.example.test/sign-in?redirect_url=https%3A%2F%2Falpha.app.example.test%2Fdashboard',
      );
      expect(clerkMiddleware).not.toHaveBeenCalled();
    },
  );

  it.each(['redirect_url', '__clerk_redirect_url'])(
    'lets Clerk process a local satellite sign-in callback with %s',
    async (parameter) => {
      vi.stubEnv('NODE_ENV', 'development');
      vi.stubEnv('AUTHENTICATION_ORIGIN', 'http://localhost:3000');
      vi.stubEnv('CENTER_APP_BASE_DOMAIN', 'app.localhost');
      vi.stubEnv('CENTER_APP_BASE_ORIGIN', 'http://app.localhost:3000');
      vi.stubEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'pk_test_fixture');
      vi.mocked(clerkMiddleware).mockClear();
      const origin = 'http://alpha.app.localhost:3000';
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(null, {
          status: 204,
          headers: { 'Access-Control-Allow-Origin': origin },
        }),
      );
      const response = await proxy(
        new NextRequest(
          `${origin}/sign-in?${parameter}=${encodeURIComponent(`${origin}/dashboard`)}`,
        ),
      );
      expect(response.status).toBe(200);
      expect(response.headers.get('location')).toBeNull();
      expect(clerkMiddleware).toHaveBeenCalledWith(expect.any(Function), {
        isSatellite: true,
        satelliteAutoSync: true,
        domain: 'alpha.app.localhost',
        signInUrl: 'http://localhost:3000/sign-in',
      });
    },
  );

  it('lets Clerk return a satellite sync to an active center path', async () => {
    vi.stubEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'pk_test_fixture');
    vi.mocked(clerkMiddleware).mockClear();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': 'https://alpha.app.example.test',
        },
      }),
    );
    const destination =
      'https://alpha.app.example.test/dashboard/activities?view=list';
    const response = await proxy(
      new NextRequest(
        `https://auth.example.test/sign-in?__clerk_redirect_url=${encodeURIComponent(destination)}`,
      ),
    );
    expect(response.status).toBe(200);
    expect(clerkMiddleware).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.test/v1/me/center-entry-contexts',
      expect.objectContaining({
        headers: expect.objectContaining({
          Origin: 'https://alpha.app.example.test',
        }),
      }),
    );
  });

  it.each([
    'https://evil.test/dashboard',
    'https://auth.example.test/dashboard',
    'https://nested.alpha.app.example.test/dashboard',
    'http://alpha.app.example.test/dashboard',
    'https://alpha.app.example.test:8443/dashboard',
    'https://user:secret@alpha.app.example.test/dashboard',
    'not a url',
  ])(
    'rejects a non-center satellite return %s before Clerk or origin lookup',
    async (destination) => {
      vi.stubEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'pk_test_fixture');
      vi.mocked(clerkMiddleware).mockClear();
      const fetchMock = vi.spyOn(globalThis, 'fetch');
      const response = await proxy(
        new NextRequest(
          `https://auth.example.test/sign-in?__clerk_redirect_url=${encodeURIComponent(destination)}`,
        ),
      );
      expect(response.status).toBe(404);
      expect(clerkMiddleware).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each(['/sign-in', '/dashboard', '/'])(
    'rejects an unregistered or disabled center satellite return on %s',
    async (path) => {
      vi.stubEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'pk_test_fixture');
      vi.mocked(clerkMiddleware).mockClear();
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(null, { status: 204 }),
      );
      const response = await proxy(
        new NextRequest(
          `https://auth.example.test${path}?__clerk_redirect_url=${encodeURIComponent('https://unknown.app.example.test/dashboard')}`,
        ),
      );
      expect(response.status).toBe(404);
      expect(clerkMiddleware).not.toHaveBeenCalled();
    },
  );

  it('rejects duplicated satellite returns instead of choosing one', async () => {
    vi.stubEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'pk_test_fixture');
    vi.mocked(clerkMiddleware).mockClear();
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const active = encodeURIComponent(
      'https://alpha.app.example.test/dashboard',
    );
    const external = encodeURIComponent('https://evil.test/dashboard');
    const response = await proxy(
      new NextRequest(
        `https://auth.example.test/sign-in?__clerk_redirect_url=${active}&__clerk_redirect_url=${external}`,
      ),
    );
    expect(response.status).toBe(404);
    expect(clerkMiddleware).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports satellite return verification failure as unavailable', async () => {
    vi.stubEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'pk_test_fixture');
    vi.mocked(clerkMiddleware).mockClear();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 503 }),
    );
    const response = await proxy(
      new NextRequest(
        `https://auth.example.test/sign-in?__clerk_redirect_url=${encodeURIComponent('https://alpha.app.example.test/dashboard')}`,
      ),
    );
    expect(response.status).toBe(503);
    expect(clerkMiddleware).not.toHaveBeenCalled();
  });

  it('mounts Clerk only for canonical hosts and leaves dashboard mapping authorization to API', async () => {
    vi.mocked(clerkMiddleware).mockClear();
    vi.stubEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'pk_test_fixture');
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }));
    expect(
      (await proxy(new NextRequest('https://unknown.example.test/dashboard')))
        .status,
    ).toBe(404);
    expect(clerkMiddleware).not.toHaveBeenCalled();
    fetchMock.mockResolvedValue(
      new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': 'https://alpha.app.example.test',
        },
      }),
    );
    expect(
      (await proxy(new NextRequest('https://alpha.app.example.test/dashboard')))
        .status,
    ).toBe(200);
    expect(clerkMiddleware).toHaveBeenCalledWith(expect.any(Function), {
      signInUrl: 'https://auth.example.test/sign-in',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails closed outside development when center hosts would need Clerk satellites', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('AUTHENTICATION_ORIGIN', 'https://auth.example.test');
    vi.stubEnv('CENTER_APP_BASE_DOMAIN', 'app.other.test');
    vi.stubEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'pk_test_fixture');
    vi.mocked(clerkMiddleware).mockClear();
    expect(
      (await proxy(new NextRequest('https://alpha.app.other.test/dashboard')))
        .status,
    ).toBe(500);
    expect(clerkMiddleware).not.toHaveBeenCalled();
  });
});
