import { describe, expect, it } from 'vitest';
import { clerkIdentityConfigFromEnvironment } from './clerk.config.js';

const validEnvironment = {
  NODE_ENV: 'test',
  CLERK_SECRET_KEY: 'sk_test_not-a-real-secret',
  CLERK_WEBHOOK_SIGNING_SECRET: 'whsec_not-a-real-secret',
  CLERK_ISSUER: 'https://clerk.example.test',
  CLERK_AUTHORIZED_PARTIES:
    'https://dashboard.example.test, https://admin.example.test',
  CLERK_REQUEST_TIMEOUT_MS: '100',
};

describe('Clerk production configuration', () => {
  it('parses comma-separated and JSON authorized-party lists', () => {
    expect(
      clerkIdentityConfigFromEnvironment(validEnvironment).authorizedParties,
    ).toEqual(['https://dashboard.example.test', 'https://admin.example.test']);
    expect(
      clerkIdentityConfigFromEnvironment({
        ...validEnvironment,
        CLERK_AUTHORIZED_PARTIES: JSON.stringify([
          'https://dashboard.example.test',
        ]),
      }).authorizedParties,
    ).toEqual(['https://dashboard.example.test']);
  });

  it.each([
    ['CLERK_SECRET_KEY', ''],
    ['CLERK_WEBHOOK_SIGNING_SECRET', '   '],
    ['CLERK_ISSUER', ''],
    ['CLERK_AUTHORIZED_PARTIES', ''],
    ['CLERK_REQUEST_TIMEOUT_MS', ''],
  ])('rejects missing %s', (name, value) => {
    expect(() =>
      clerkIdentityConfigFromEnvironment({
        ...validEnvironment,
        [name]: value,
      }),
    ).toThrow(`Missing ${name}`);
  });

  it.each([
    ['CLERK_SECRET_KEY', 'secret'],
    ['CLERK_SECRET_KEY', 'sk_test_*'],
    ['CLERK_WEBHOOK_SIGNING_SECRET', 'secret'],
    ['CLERK_WEBHOOK_SIGNING_SECRET', 'whsec_*'],
  ])('rejects invalid %s without exposing its value', (name, value) => {
    expect(() =>
      clerkIdentityConfigFromEnvironment({
        ...validEnvironment,
        [name]: value,
      }),
    ).toThrow(`Invalid ${name}`);
    try {
      clerkIdentityConfigFromEnvironment({
        ...validEnvironment,
        [name]: value,
      });
    } catch (error) {
      expect(String(error)).not.toContain(value);
    }
  });

  it.each([
    '*',
    'https://*.example.test',
    'http://clerk.example.test',
    'https://user:password@clerk.example.test',
    'https://clerk.example.test/path',
    'https://clerk.example.test?query=value',
    'https://clerk.example.test#fragment',
    'not-a-url',
  ])('rejects an invalid issuer without exposing its value: %s', (issuer) => {
    expect(() =>
      clerkIdentityConfigFromEnvironment({
        ...validEnvironment,
        CLERK_ISSUER: issuer,
      }),
    ).toThrow('Invalid CLERK_ISSUER');
    try {
      clerkIdentityConfigFromEnvironment({
        ...validEnvironment,
        CLERK_ISSUER: issuer,
      });
    } catch (error) {
      expect(String(error)).not.toContain(issuer);
    }
  });

  it.each([
    '*',
    'https://*.example.test',
    'https://dashboard.example.test,',
    'https://dashboard.example.test/',
    'https://dashboard.example.test/path',
    'https://user:password@dashboard.example.test',
    'not-a-url',
    '[]',
  ])('rejects unsafe authorized parties: %s', (authorizedParties) => {
    expect(() =>
      clerkIdentityConfigFromEnvironment({
        ...validEnvironment,
        CLERK_AUTHORIZED_PARTIES: authorizedParties,
      }),
    ).toThrow('Invalid CLERK_AUTHORIZED_PARTIES');
  });
});
