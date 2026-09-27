import type { ClerkIdentityAdapterConfig } from '@dive-center/identity';

type Environment = Readonly<Record<string, string | undefined>>;

function required(environment: Environment, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function secret(
  environment: Environment,
  name: string,
  pattern: RegExp,
): string {
  const value = required(environment, name);
  if (!pattern.test(value)) throw new Error(`Invalid ${name}`);
  return value;
}

function parseAuthorizedParties(value: string): readonly string[] {
  let candidates: unknown;
  if (value.startsWith('[')) {
    try {
      candidates = JSON.parse(value);
    } catch {
      throw new Error('Invalid CLERK_AUTHORIZED_PARTIES');
    }
  } else {
    candidates = value.split(',');
  }
  if (
    !Array.isArray(candidates) ||
    candidates.length === 0 ||
    candidates.some((candidate) => typeof candidate !== 'string')
  ) {
    throw new Error('Invalid CLERK_AUTHORIZED_PARTIES');
  }

  const parties = candidates.map((candidate) => candidate.trim());
  if (parties.some((party) => !party || party.includes('*'))) {
    throw new Error('Invalid CLERK_AUTHORIZED_PARTIES');
  }
  for (const party of parties) {
    try {
      const url = new URL(party);
      if (
        !['http:', 'https:'].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.pathname !== '/' ||
        url.search ||
        url.hash ||
        url.origin !== party
      ) {
        throw new Error('Invalid authorized party');
      }
    } catch {
      throw new Error('Invalid CLERK_AUTHORIZED_PARTIES');
    }
  }
  return Object.freeze([...new Set(parties)]);
}

export function clerkIdentityConfigFromEnvironment(
  environment: Environment,
): ClerkIdentityAdapterConfig {
  const issuer = required(environment, 'CLERK_ISSUER');
  try {
    const issuerUrl = new URL(issuer);
    if (
      issuerUrl.protocol !== 'https:' ||
      issuerUrl.username ||
      issuerUrl.password ||
      issuerUrl.pathname !== '/' ||
      issuerUrl.search ||
      issuerUrl.hash ||
      issuerUrl.origin !== issuer ||
      issuer.includes('*')
    ) {
      throw new Error('Invalid issuer');
    }
  } catch {
    throw new Error('Invalid CLERK_ISSUER');
  }

  return Object.freeze({
    secretKey: secret(
      environment,
      'CLERK_SECRET_KEY',
      /^sk_(?:test|live)_[^\s*]+$/,
    ),
    webhookSigningSecret: secret(
      environment,
      'CLERK_WEBHOOK_SIGNING_SECRET',
      /^whsec_[^\s*]+$/,
    ),
    issuer,
    authorizedParties: parseAuthorizedParties(
      required(environment, 'CLERK_AUTHORIZED_PARTIES'),
    ),
  });
}
