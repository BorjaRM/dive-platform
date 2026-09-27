import { describe, expect, it } from 'vitest';
import {
  assertNoSyntheticProductionValue,
  assertProductionSecretStrength,
  runtimeEnvironmentFromEnvironment,
} from './environment.js';

describe('runtime environment configuration', () => {
  it.each(['development', 'test', 'staging', 'preview', 'production'])(
    'accepts %s',
    (NODE_ENV) => {
      expect(runtimeEnvironmentFromEnvironment({ NODE_ENV })).toBe(NODE_ENV);
    },
  );

  it.each([
    ['NODE_ENV', undefined],
    ['NODE_ENV', ''],
    ['NODE_ENV', 'local'],
  ])('rejects invalid %s configuration', (name, value) => {
    expect(() => runtimeEnvironmentFromEnvironment({ [name]: value })).toThrow(
      value ? 'Invalid NODE_ENV' : 'Missing NODE_ENV',
    );
  });

  it('allows synthetic values outside production', () => {
    expect(() =>
      assertNoSyntheticProductionValue(
        'replace-with-a-local-value',
        'SETTING',
        'development',
      ),
    ).not.toThrow();
  });

  it.each(['replace-with-a-real-secret', 'a'.repeat(32), 'abcd'.repeat(8)])(
    'rejects unsafe production secrets: %s',
    (value) => {
      expect(() =>
        assertProductionSecretStrength(value, 'SETTING', 'production'),
      ).toThrow('Invalid SETTING');
    },
  );

  it('rejects synthetic production values without exposing the value', () => {
    const value = 'https://dashboard.example.test';
    expect(() =>
      assertNoSyntheticProductionValue(value, 'ORIGIN', 'production'),
    ).toThrow('Invalid ORIGIN');
    try {
      assertNoSyntheticProductionValue(value, 'ORIGIN', 'production');
    } catch (error) {
      expect(String(error)).not.toContain(value);
    }
  });
});
