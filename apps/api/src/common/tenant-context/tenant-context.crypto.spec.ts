import { describe, expect, it } from 'vitest';
import {
  centerAppBaseDomainFromEnvironment,
  centerAppBaseOriginFromEnvironment,
  centerKeyFromOrigin,
  dashboardContextHmacSecretFromEnvironment,
  dashboardCorsOriginsFromEnvironment,
} from './tenant-context.crypto.js';

const productionSecret = 'J7m!Q2v#L9r@X4p$N6w^C8z&K5t*H3d?';

describe('dashboard tenant-context configuration', () => {
  it('accepts HTTP origins for non-production local profiles', () => {
    expect(
      dashboardCorsOriginsFromEnvironment({
        NODE_ENV: 'development',
        AUTHENTICATION_ORIGIN: 'http://localhost:3000',
        CENTER_APP_BASE_DOMAIN: 'app.example.test',
        DASHBOARD_CORS_ORIGINS: 'http://localhost:3000',
      }),
    ).toEqual(['http://localhost:3000']);
  });

  it.each([
    'http://dashboard.dive-platform.com',
    'https://dashboard.example.test',
  ])('rejects unsafe production origin: %s', (origin) => {
    expect(() =>
      dashboardCorsOriginsFromEnvironment({
        NODE_ENV: 'production',
        AUTHENTICATION_ORIGIN: 'https://auth.dive-platform.com',
        CENTER_APP_BASE_DOMAIN: 'app.dive-platform.com',
        DASHBOARD_CORS_ORIGINS: origin,
      }),
    ).toThrow('Invalid DASHBOARD_CORS_ORIGINS');
  });

  it('accepts a strong HTTPS production configuration', () => {
    expect(
      dashboardCorsOriginsFromEnvironment({
        NODE_ENV: 'production',
        AUTHENTICATION_ORIGIN: 'https://auth.dive-platform.com',
        CENTER_APP_BASE_DOMAIN: 'app.dive-platform.com',
        DASHBOARD_CORS_ORIGINS: 'https://dashboard.dive-platform.com',
      }),
    ).toEqual([
      'https://auth.dive-platform.com',
      'https://dashboard.dive-platform.com',
    ]);
    expect(
      dashboardContextHmacSecretFromEnvironment({
        NODE_ENV: 'production',
        DASHBOARD_CONTEXT_HMAC_SECRET: productionSecret,
      }),
    ).toBe(productionSecret);
  });

  it.each(['replace-with-at-least-32-random-bytes', 'a'.repeat(32)])(
    'rejects unsafe production HMAC secret: %s',
    (secret) => {
      expect(() =>
        dashboardContextHmacSecretFromEnvironment({
          NODE_ENV: 'production',
          DASHBOARD_CONTEXT_HMAC_SECRET: secret,
        }),
      ).toThrow('Invalid DASHBOARD_CONTEXT_HMAC_SECRET');
    },
  );

  it('derives only a single exact center key from the configured HTTPS domain', () => {
    expect(
      centerKeyFromOrigin(
        'https://costa-norte.app.dive-platform.com',
        'app.dive-platform.com',
      ),
    ).toBe('costa-norte');
    expect(
      centerKeyFromOrigin(
        'https://other.costa-norte.app.dive-platform.com',
        'app.dive-platform.com',
      ),
    ).toBeNull();
    expect(
      centerKeyFromOrigin(
        'https://costa-norte.app.dive-platform.com.evil.test',
        'app.dive-platform.com',
      ),
    ).toBeNull();
    expect(
      centerKeyFromOrigin(
        'http://costa-norte.app.dive-platform.com',
        'app.dive-platform.com',
      ),
    ).toBeNull();
  });

  it('rejects center origins from the static dashboard allowlist', () => {
    expect(() =>
      dashboardCorsOriginsFromEnvironment({
        NODE_ENV: 'staging',
        AUTHENTICATION_ORIGIN: 'https://auth.staging.dive-platform.com',
        CENTER_APP_BASE_DOMAIN: 'app.staging.dive-platform.com',
        DASHBOARD_CORS_ORIGINS:
          'https://costa-norte.app.staging.dive-platform.com',
      }),
    ).toThrow('Invalid DASHBOARD_CORS_ORIGINS');
  });

  it('requires a canonical per-environment center application domain', () => {
    expect(
      centerAppBaseDomainFromEnvironment({
        NODE_ENV: 'staging',
        CENTER_APP_BASE_DOMAIN: 'app.staging.dive-platform.com',
      }),
    ).toBe('app.staging.dive-platform.com');
    expect(() =>
      centerAppBaseDomainFromEnvironment({
        NODE_ENV: 'production',
        CENTER_APP_BASE_DOMAIN: '*.app.example.test',
      }),
    ).toThrow('Invalid CENTER_APP_BASE_DOMAIN');
  });

  it('resolves local center keys only with the configured protocol and port', () => {
    const environment = {
      NODE_ENV: 'development',
      AUTHENTICATION_ORIGIN: 'http://localhost:3000',
      CENTER_APP_BASE_DOMAIN: 'app.localhost',
      CENTER_APP_BASE_ORIGIN: 'http://app.localhost:3000',
    };
    const baseOrigin = centerAppBaseOriginFromEnvironment(environment);
    expect(baseOrigin).toBe('http://app.localhost:3000');
    expect(dashboardCorsOriginsFromEnvironment(environment)).toEqual([
      'http://localhost:3000',
    ]);
    for (const centerKey of ['test-center', 'ocean-north']) {
      expect(
        centerKeyFromOrigin(
          `http://${centerKey}.app.localhost:3000`,
          'app.localhost',
          baseOrigin,
        ),
      ).toBe(centerKey);
    }
    for (const origin of [
      'https://test-center.app.localhost:3000',
      'http://test-center.app.localhost:4000',
      'http://test-center.app.localhost',
      'http://nested.test-center.app.localhost:3000',
      'http://test-center.app.localhost.evil.test:3000',
      'http://user@test-center.app.localhost:3000',
      'http://test-center.app.localhost:3000/path',
      'http://test-center.app.localhost:3000?tenant=other',
    ]) {
      expect(
        centerKeyFromOrigin(origin, 'app.localhost', baseOrigin),
      ).toBeNull();
    }
    expect(() =>
      dashboardCorsOriginsFromEnvironment({
        ...environment,
        DASHBOARD_CORS_ORIGINS: 'http://test-center.app.localhost:3000',
      }),
    ).toThrow('Invalid DASHBOARD_CORS_ORIGINS');
  });

  it.each(['production', 'staging', 'test'])(
    'rejects local HTTP center configuration in %s',
    (environment) => {
      expect(() =>
        centerAppBaseOriginFromEnvironment({
          NODE_ENV: environment,
          CENTER_APP_BASE_DOMAIN: 'app.localhost',
          CENTER_APP_BASE_ORIGIN: 'http://app.localhost:3000',
        }),
      ).toThrow();
    },
  );

  it.each([
    ['app.example.test', 'http://app.example.test:3000'],
    ['app.localhost', 'http://app.localhost.evil.test:3000'],
    ['app.localhost', 'http://app.localhost:3000/path'],
    ['app.localhost', 'http://user@app.localhost:3000'],
    ['app.localhost', ''],
    ['app.example.test', 'https://app.example.test:3000'],
  ])('rejects unsafe center base origin %s / %s', (domain, origin) => {
    expect(() =>
      centerAppBaseOriginFromEnvironment({
        NODE_ENV: 'development',
        CENTER_APP_BASE_DOMAIN: domain,
        CENTER_APP_BASE_ORIGIN: origin,
      }),
    ).toThrow('CENTER_APP_BASE_ORIGIN');
  });

  it('preserves the production HTTPS origin without an override', () => {
    expect(
      centerAppBaseOriginFromEnvironment({
        NODE_ENV: 'production',
        CENTER_APP_BASE_DOMAIN: 'app.dive-platform.com',
      }),
    ).toBe('https://app.dive-platform.com');
  });
});
