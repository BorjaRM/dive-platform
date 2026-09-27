import { describe, expect, it } from 'vitest';
import {
  dashboardContextHmacSecretFromEnvironment,
  dashboardCorsOriginsFromEnvironment,
} from './tenant-context.crypto.js';

const productionSecret = 'J7m!Q2v#L9r@X4p$N6w^C8z&K5t*H3d?';

describe('dashboard tenant-context configuration', () => {
  it('accepts HTTP origins for non-production local profiles', () => {
    expect(
      dashboardCorsOriginsFromEnvironment({
        NODE_ENV: 'development',
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
        DASHBOARD_CORS_ORIGINS: origin,
      }),
    ).toThrow('Invalid DASHBOARD_CORS_ORIGINS');
  });

  it('accepts a strong HTTPS production configuration', () => {
    expect(
      dashboardCorsOriginsFromEnvironment({
        NODE_ENV: 'production',
        DASHBOARD_CORS_ORIGINS: 'https://dashboard.dive-platform.com',
      }),
    ).toEqual(['https://dashboard.dive-platform.com']);
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
});
