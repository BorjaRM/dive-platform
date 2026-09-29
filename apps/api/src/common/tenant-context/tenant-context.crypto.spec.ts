import { describe, expect, it } from 'vitest';
import {
  centerAppBaseDomainFromEnvironment,
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
});
