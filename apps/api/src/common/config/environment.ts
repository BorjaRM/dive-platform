export type Environment = Readonly<Record<string, string | undefined>>;

export type RuntimeEnvironment =
  | 'development'
  | 'test'
  | 'staging'
  | 'preview'
  | 'production';

const runtimeEnvironments = [
  'development',
  'test',
  'staging',
  'preview',
  'production',
] as const satisfies readonly RuntimeEnvironment[];

const syntheticValueMarkers = [
  'replace-with',
  'replace_with',
  'not-a-real-secret',
  'example.com',
  'example.org',
  'example.test',
  'localhost',
  '127.0.0.1',
] as const;

export function runtimeEnvironmentFromEnvironment(
  environment: Environment,
): RuntimeEnvironment {
  const value = environment.NODE_ENV?.trim();
  if (!value) throw new Error('Missing NODE_ENV');
  if (!(runtimeEnvironments as readonly string[]).includes(value)) {
    throw new Error('Invalid NODE_ENV');
  }
  return value as RuntimeEnvironment;
}

export function assertNoSyntheticProductionValue(
  value: string,
  name: string,
  runtimeEnvironment: RuntimeEnvironment,
): void {
  if (
    runtimeEnvironment === 'production' &&
    syntheticValueMarkers.some((marker) => value.toLowerCase().includes(marker))
  ) {
    throw new Error(`Invalid ${name}`);
  }
}

export function assertProductionSecretStrength(
  value: string,
  name: string,
  runtimeEnvironment: RuntimeEnvironment,
): void {
  assertNoSyntheticProductionValue(value, name, runtimeEnvironment);
  if (runtimeEnvironment !== 'production') return;

  const uniqueCharacters = new Set(value).size;
  const repeatedPattern = /^(.{1,4})\1+$/.test(value);
  if (uniqueCharacters < 16 || repeatedPattern) {
    throw new Error(`Invalid ${name}`);
  }
}
