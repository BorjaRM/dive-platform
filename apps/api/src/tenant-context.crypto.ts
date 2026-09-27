import { createHash, createHmac, randomBytes } from 'node:crypto';

type Environment = Readonly<Record<string, string | undefined>>;

function required(environment: Environment, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function exactOrigin(value: string, name: string): string {
  try {
    const origin = new URL(value);
    if (
      !['http:', 'https:'].includes(origin.protocol) ||
      origin.username ||
      origin.password ||
      origin.pathname !== '/' ||
      origin.search ||
      origin.hash ||
      origin.origin !== value ||
      value.includes('*')
    ) {
      throw new Error('Invalid origin');
    }
    return origin.origin;
  } catch {
    throw new Error(`Invalid ${name}`);
  }
}

export function dashboardCorsOriginsFromEnvironment(
  environment: Environment,
): readonly string[] {
  const origins = required(environment, 'DASHBOARD_CORS_ORIGINS')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => exactOrigin(origin, 'DASHBOARD_CORS_ORIGINS'));
  if (origins.length === 0) throw new Error('Invalid DASHBOARD_CORS_ORIGINS');
  return Object.freeze([...new Set(origins)]);
}

export function dashboardContextHmacSecretFromEnvironment(
  environment: Environment,
): string {
  const value = required(environment, 'DASHBOARD_CONTEXT_HMAC_SECRET');
  if (Buffer.byteLength(value, 'utf8') < 32) {
    throw new Error('Invalid DASHBOARD_CONTEXT_HMAC_SECRET');
  }
  return value;
}

export class TenantContextCrypto {
  constructor(private readonly hmacSecret: string) {
    if (Buffer.byteLength(hmacSecret, 'utf8') < 32) {
      throw new Error('Invalid dashboard context HMAC secret');
    }
  }

  createHandle(): string {
    return `ctx_${randomBytes(32).toString('base64url')}`;
  }

  handleHash(handle: string): string {
    return createHash('sha256').update(handle, 'utf8').digest('hex');
  }

  sessionIdHash(sessionId: string): string {
    return createHmac('sha256', this.hmacSecret)
      .update(sessionId, 'utf8')
      .digest('hex');
  }

  operatorRef(identityId: string, tenantId: string): string {
    return `op_${createHmac('sha256', this.hmacSecret)
      .update(`${identityId}:${tenantId}`, 'utf8')
      .digest('base64url')}`;
  }
}
