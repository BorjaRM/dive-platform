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
    vi.stubEnv('NEXT_PUBLIC_DASHBOARD_API_URL', 'https://api.example.test');
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

  it('returns a configuration error instead of selecting a host default', async () => {
    vi.stubEnv('PUBLIC_PRODUCT_ORIGIN', '');

    expect(
      (await proxy(new NextRequest('https://bluecurrent.example/'))).status,
    ).toBe(500);
  });

  it('admits only active exact center origins and sends their root to the dashboard', async () => {
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
    ).toBe(404);
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
        404,
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
    'https://alpha.app.example.test/dashboard',
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
      (await proxy(new NextRequest('https://alpha.app.example.test/dashboard')))
        .status,
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

  it('mounts the same Clerk middleware only after active mapping validation', async () => {
    vi.mocked(clerkMiddleware).mockClear();
    vi.stubEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'pk_test_fixture');
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }));
    expect(
      (await proxy(new NextRequest('https://alpha.app.example.test/dashboard')))
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
      isSatellite: true,
      domain: 'alpha.app.example.test',
      signInUrl: 'https://auth.example.test/sign-in',
    });
  });
});
