import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  canonicalHttpsOrigin,
  requiredEnvironment,
  sandboxDatabaseUrl,
} from './clerk.sandbox-config.js';

afterEach(() => vi.unstubAllEnvs());

describe('Clerk sandbox safety preflight', () => {
  it('requires explicit nonempty environment configuration', () => {
    vi.stubEnv('SANDBOX_VALUE', undefined);
    expect(() => requiredEnvironment('SANDBOX_VALUE')).toThrow(
      'Missing SANDBOX_VALUE',
    );
    vi.stubEnv('SANDBOX_VALUE', '   ');
    expect(() => requiredEnvironment('SANDBOX_VALUE')).toThrow(
      'Missing SANDBOX_VALUE',
    );
    vi.stubEnv('SANDBOX_VALUE', ' value ');
    expect(requiredEnvironment('SANDBOX_VALUE')).toBe('value');
  });

  it('accepts only the dedicated local database and expected role', () => {
    vi.stubEnv(
      'SANDBOX_DATABASE_URL',
      'postgres://postgres:synthetic@127.0.0.1:55432/dive_spike',
    );
    expect(sandboxDatabaseUrl('SANDBOX_DATABASE_URL', 'postgres')).toContain(
      '/dive_spike',
    );
    expect(() =>
      sandboxDatabaseUrl('SANDBOX_DATABASE_URL', 'dive_app'),
    ).toThrow('local dive_spike sandbox database');
  });

  it.each([
    'not-a-url',
    'postgres://postgres:synthetic@remote.example.test:55432/dive_spike',
    'postgres://postgres:synthetic@127.0.0.1:5432/dive_spike',
    'postgres://postgres:synthetic@127.0.0.1:55432/production',
    'postgres://postgres:synthetic@127.0.0.1:55432/dive_spike?sslmode=disable',
    'postgres://postgres:synthetic@127.0.0.1:55432/dive_spike#fragment',
    'https://postgres:synthetic@127.0.0.1:55432/dive_spike',
  ])('rejects unsafe database configuration %#', (value) => {
    vi.stubEnv('SANDBOX_DATABASE_URL', value);
    expect(() =>
      sandboxDatabaseUrl('SANDBOX_DATABASE_URL', 'postgres'),
    ).toThrow();
  });

  it('accepts exact HTTPS origins', () => {
    vi.stubEnv('SANDBOX_ORIGIN', 'https://alpha.app.example.test');
    expect(canonicalHttpsOrigin('SANDBOX_ORIGIN')).toBe(
      'https://alpha.app.example.test',
    );
  });

  it.each([
    'http://alpha.app.example.test',
    'https://alpha.app.example.test/',
    'https://alpha.app.example.test/dashboard',
    'https://alpha.app.example.test?destination=other',
    'https://alpha.app.example.test#fragment',
    'https://user:synthetic@alpha.app.example.test',
    'not-a-url',
  ])('rejects noncanonical or insecure origins %#', (value) => {
    vi.stubEnv('SANDBOX_ORIGIN', value);
    expect(() => canonicalHttpsOrigin('SANDBOX_ORIGIN')).toThrow();
  });
});
