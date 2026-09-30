import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CenterOriginUnavailableError,
  centerDashboardUrl,
  classifyApplicationHost,
  isActiveCenterOrigin,
  readApplicationHostConfig,
  validatedCenterReturnUrl,
} from './application-hosts';

const config = {
  authenticationOrigin: 'https://auth.example.test',
  centerAppBaseDomain: 'app.example.test',
};

const testRequire = createRequire(import.meta.url);
const clerkRequire = createRequire(testRequire.resolve('@clerk/nextjs'));
const { createRedirect } = clerkRequire('@clerk/backend/internal');

describe('application host boundary (DIVE-IAM-REQ-032)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('requires explicit environment values without another environment fallback', () => {
    expect(() => readApplicationHostConfig({})).toThrow();
    expect(() =>
      readApplicationHostConfig({
        AUTHENTICATION_ORIGIN: config.authenticationOrigin,
        CENTER_APP_BASE_DOMAIN: '*.app.example.test',
      }),
    ).toThrow();
    expect(
      readApplicationHostConfig({
        AUTHENTICATION_ORIGIN: config.authenticationOrigin,
        CENTER_APP_BASE_DOMAIN: config.centerAppBaseDomain,
      }),
    ).toEqual(config);
    expect(() =>
      readApplicationHostConfig({
        AUTHENTICATION_ORIGIN: 'https://alpha.app.example.test',
        CENTER_APP_BASE_DOMAIN: config.centerAppBaseDomain,
      }),
    ).toThrow();
  });

  it('classifies only the exact auth host or a single canonical center label', () => {
    expect(classifyApplicationHost('auth.example.test', config).kind).toBe(
      'authentication',
    );
    expect(classifyApplicationHost('alpha.app.example.test', config)).toEqual({
      kind: 'center',
      centerKey: 'alpha',
      origin: 'https://alpha.app.example.test',
    });
    for (const host of [
      'unknown.test',
      'alpha.other.test',
      'nested.alpha.app.example.test',
      'alpha.app.example.test:4000',
      'alpha.app.example.test.evil.test',
      'evil@alpha.app.example.test',
    ]) {
      expect(classifyApplicationHost(host, config)).toEqual({
        kind: 'unknown',
      });
    }
    expect(centerDashboardUrl('alpha', config.centerAppBaseDomain)).toBe(
      'https://alpha.app.example.test/dashboard',
    );
    expect(() =>
      centerDashboardUrl('../evil', config.centerAppBaseDomain),
    ).toThrow();
  });

  it('uses the backend exact-origin owner without treating shape as an active mapping', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': 'https://alpha.app.example.test',
          },
        }),
      )
      .mockResolvedValueOnce(
        new Response(null, {
          status: 204,
          headers: { 'Access-Control-Allow-Origin': '*' },
        }),
      )
      .mockRejectedValueOnce(new Error('unavailable'));
    await expect(
      isActiveCenterOrigin(
        'https://alpha.app.example.test',
        'https://api.example.test',
      ),
    ).resolves.toBe(true);
    await expect(
      isActiveCenterOrigin(
        'https://alpha.app.example.test',
        'https://api.example.test',
      ),
    ).resolves.toBe(false);
    await expect(
      isActiveCenterOrigin(
        'https://alpha.app.example.test',
        'https://api.example.test',
      ),
    ).rejects.toBeInstanceOf(CenterOriginUnavailableError);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: 'OPTIONS',
      cache: 'no-store',
      headers: { Origin: 'https://alpha.app.example.test' },
    });
  });

  it('rejects open redirects and disabled mappings', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }));
    for (const destination of [
      'https://evil.test/dashboard',
      'javascript:alert(1)',
      'https://alpha.app.example.test/sign-in',
      'http://alpha.app.example.test/dashboard',
      'https://evil@alpha.app.example.test/dashboard',
      'https://alpha.app.example.test/dashboard?redirect_url=https://evil.test',
      'https://alpha.app.example.test/dashboard?__clerk_synced=evil',
      'https://alpha.app.example.test/dashboard?__clerk_synced=false&__clerk_synced=true',
    ]) {
      await expect(
        validatedCenterReturnUrl(
          destination,
          config,
          'https://api.example.test',
        ),
      ).resolves.toBeNull();
    }
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(
      validatedCenterReturnUrl(
        'https://alpha.app.example.test/dashboard',
        config,
        'https://api.example.test',
      ),
    ).resolves.toBeNull();
  });

  it('builds and verifies exact local URLs for any registered center key', async () => {
    const localConfig = readApplicationHostConfig({
      NODE_ENV: 'development',
      AUTHENTICATION_ORIGIN: 'http://localhost:3000',
      CENTER_APP_BASE_DOMAIN: 'app.localhost',
      CENTER_APP_BASE_ORIGIN: 'http://app.localhost:3000',
    });
    for (const centerKey of ['test-center', 'ocean-north']) {
      expect(
        centerDashboardUrl(
          centerKey,
          localConfig.centerAppBaseDomain,
          localConfig.centerAppBaseOrigin,
        ),
      ).toBe(`http://${centerKey}.app.localhost:3000/dashboard`);
    }
    expect(
      classifyApplicationHost('test-center.app.localhost:3000', localConfig),
    ).toEqual({
      kind: 'center',
      centerKey: 'test-center',
      origin: 'http://test-center.app.localhost:3000',
    });
    for (const host of [
      'test-center.app.localhost:4000',
      'test-center.app.localhost',
      'nested.test-center.app.localhost:3000',
      'test-center.app.localhost.evil.test:3000',
    ]) {
      expect(classifyApplicationHost(host, localConfig)).toEqual({
        kind: 'unknown',
      });
    }
    const destination = 'http://test-center.app.localhost:3000/dashboard';
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin':
            'http://test-center.app.localhost:3000',
        },
      }),
    );
    await expect(
      validatedCenterReturnUrl(
        destination,
        localConfig,
        'http://localhost:3001',
      ),
    ).resolves.toBe(destination);
    await expect(
      validatedCenterReturnUrl(
        'https://test-center.app.localhost:3000/dashboard',
        localConfig,
        'http://localhost:3001',
      ),
    ).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(
      validatedCenterReturnUrl(
        destination,
        localConfig,
        'http://localhost:3001',
      ),
    ).resolves.toBeNull();
  });

  it.each(['production', 'staging', 'test'])(
    'rejects local HTTP center configuration in %s',
    (environment) => {
      expect(() =>
        readApplicationHostConfig({
          NODE_ENV: environment,
          AUTHENTICATION_ORIGIN: 'https://auth.example.test',
          CENTER_APP_BASE_DOMAIN: 'app.localhost',
          CENTER_APP_BASE_ORIGIN: 'http://app.localhost:3000',
        }),
      ).toThrow('Invalid CENTER_APP_BASE_ORIGIN');
    },
  );

  it.each([
    ['app.example.test', 'http://app.example.test:3000'],
    ['app.localhost', 'http://app.localhost.evil.test:3000'],
    ['app.localhost', 'http://app.localhost:3000/path'],
    ['app.localhost', 'http://user@app.localhost:3000'],
    ['app.localhost', 'http://app.localhost:3000?next=evil'],
    ['app.localhost', 'http://app.localhost:3000#fragment'],
    ['app.localhost', ''],
    ['app.example.test', 'https://app.example.test:3000'],
  ])('rejects unsafe center base origins: %s / %s', (domain, origin) => {
    expect(() =>
      readApplicationHostConfig({
        NODE_ENV: 'development',
        AUTHENTICATION_ORIGIN: 'http://localhost:3000',
        CENTER_APP_BASE_DOMAIN: domain,
        CENTER_APP_BASE_ORIGIN: origin,
      }),
    ).toThrow('Invalid CENTER_APP_BASE_ORIGIN');
  });

  it('preserves the return generated by the installed Clerk satellite SDK (DIVE-IAM-REQ-032)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': 'https://alpha.app.example.test',
        },
      }),
    );
    const redirect = createRedirect({
      publishableKey: `pk_test_${Buffer.from('clerk.example.test$').toString('base64')}`,
      redirectAdapter: (destination: string) => destination,
      signInUrl: `${config.authenticationOrigin}/sign-in`,
      baseUrl: 'https://alpha.app.example.test/dashboard',
      isSatellite: true,
    });
    const login = new URL(
      redirect.redirectToSignIn({
        returnBackUrl: 'https://alpha.app.example.test/dashboard',
      }),
    );
    const destination = login.searchParams.get('redirect_url');
    expect(destination).toBe(
      'https://alpha.app.example.test/dashboard?__clerk_synced=false',
    );
    await expect(
      validatedCenterReturnUrl(
        destination ?? undefined,
        config,
        'https://api.example.test',
      ),
    ).resolves.toBe(destination);
  });

  it.each([429, 500, 503])(
    'keeps HTTP %s resolver failures distinct from inactive mappings',
    async (status) => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(null, { status }),
      );
      await expect(
        isActiveCenterOrigin(
          'https://alpha.app.example.test',
          'https://api.example.test',
        ),
      ).rejects.toBeInstanceOf(CenterOriginUnavailableError);
      await expect(
        validatedCenterReturnUrl(
          'https://alpha.app.example.test/dashboard',
          config,
          'https://api.example.test',
        ),
      ).rejects.toBeInstanceOf(CenterOriginUnavailableError);
    },
  );

  it('propagates aborted checks and missing API configuration as operational failures', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      new DOMException('aborted', 'AbortError'),
    );
    await expect(
      isActiveCenterOrigin(
        'https://alpha.app.example.test',
        'https://api.example.test',
      ),
    ).rejects.toBeInstanceOf(CenterOriginUnavailableError);
    await expect(
      isActiveCenterOrigin('https://alpha.app.example.test', ''),
    ).rejects.toBeInstanceOf(CenterOriginUnavailableError);
  });
});
