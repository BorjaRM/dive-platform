import { createHash, createHmac, randomBytes } from 'node:crypto';
import {
  assertNoSyntheticProductionValue,
  assertProductionSecretStrength,
  type Environment,
  type RuntimeEnvironment,
  runtimeEnvironmentFromEnvironment,
} from '../config/environment.js';

function required(environment: Environment, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function exactOrigin(
  value: string,
  name: string,
  runtimeEnvironment: RuntimeEnvironment,
): string {
  try {
    const origin = new URL(value);
    if (
      !['http:', 'https:'].includes(origin.protocol) ||
      (runtimeEnvironment === 'production' && origin.protocol !== 'https:') ||
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
    assertNoSyntheticProductionValue(value, name, runtimeEnvironment);
    return origin.origin;
  } catch {
    throw new Error(`Invalid ${name}`);
  }
}

export function dashboardCorsOriginsFromEnvironment(
  environment: Environment,
): readonly string[] {
  const runtimeEnvironment = runtimeEnvironmentFromEnvironment(environment);
  const centerAppBaseDomain = centerAppBaseDomainFromEnvironment(environment);
  const centerAppBaseOrigin = centerAppBaseOriginFromEnvironment(environment);
  const configuredOrigins = environment.DASHBOARD_CORS_ORIGINS?.trim() ?? '';
  const origins = configuredOrigins
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) =>
      exactOrigin(origin, 'DASHBOARD_CORS_ORIGINS', runtimeEnvironment),
    );
  const authenticationOrigin = exactOrigin(
    required(environment, 'AUTHENTICATION_ORIGIN'),
    'AUTHENTICATION_ORIGIN',
    runtimeEnvironment,
  );
  if (
    centerKeyFromOrigin(
      authenticationOrigin,
      centerAppBaseDomain,
      centerAppBaseOrigin,
    )
  ) {
    throw new Error('Invalid AUTHENTICATION_ORIGIN');
  }
  if (
    origins.some((origin) =>
      centerKeyFromOrigin(origin, centerAppBaseDomain, centerAppBaseOrigin),
    )
  ) {
    throw new Error('Invalid DASHBOARD_CORS_ORIGINS');
  }
  return Object.freeze([...new Set([authenticationOrigin, ...origins])]);
}

export function centerAppBaseDomainFromEnvironment(
  environment: Environment,
): string {
  const runtimeEnvironment = runtimeEnvironmentFromEnvironment(environment);
  const value = required(environment, 'CENTER_APP_BASE_DOMAIN');
  if (
    value !== value.toLowerCase() ||
    value.includes('*') ||
    !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(
      value,
    )
  ) {
    throw new Error('Invalid CENTER_APP_BASE_DOMAIN');
  }
  assertNoSyntheticProductionValue(
    value,
    'CENTER_APP_BASE_DOMAIN',
    runtimeEnvironment,
  );
  return value;
}

export function centerAppBaseOriginFromEnvironment(
  environment: Environment,
): string {
  const baseDomain = centerAppBaseDomainFromEnvironment(environment);
  if (environment.CENTER_APP_BASE_ORIGIN === undefined)
    return `https://${baseDomain}`;
  const runtimeEnvironment = runtimeEnvironmentFromEnvironment(environment);
  const value = exactOrigin(
    required(environment, 'CENTER_APP_BASE_ORIGIN'),
    'CENTER_APP_BASE_ORIGIN',
    runtimeEnvironment,
  );
  const origin = new URL(value);
  const localHttp =
    runtimeEnvironment === 'development' &&
    origin.protocol === 'http:' &&
    origin.hostname.endsWith('.localhost');
  if (
    origin.hostname !== baseDomain ||
    (!localHttp && (origin.protocol !== 'https:' || origin.port !== ''))
  ) {
    throw new Error('Invalid CENTER_APP_BASE_ORIGIN');
  }
  return value;
}

export function centerKeyFromOrigin(
  value: string | undefined,
  baseDomain: string,
  baseOrigin = `https://${baseDomain}`,
): string | null {
  if (!value) return null;
  try {
    const origin = new URL(value);
    const configuredOrigin = new URL(baseOrigin);
    const suffix = `.${baseDomain}`;
    if (
      configuredOrigin.hostname !== baseDomain ||
      origin.protocol !== configuredOrigin.protocol ||
      origin.username ||
      origin.password ||
      origin.port !== configuredOrigin.port ||
      origin.pathname !== '/' ||
      origin.search ||
      origin.hash ||
      origin.origin !== value ||
      !origin.hostname.endsWith(suffix)
    ) {
      return null;
    }
    const centerKey = origin.hostname.slice(0, -suffix.length);
    if (
      centerKey.includes('.') ||
      !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(centerKey)
    ) {
      return null;
    }
    return centerKey;
  } catch {
    return null;
  }
}

export function dashboardContextHmacSecretFromEnvironment(
  environment: Environment,
): string {
  const runtimeEnvironment = runtimeEnvironmentFromEnvironment(environment);
  const value = required(environment, 'DASHBOARD_CONTEXT_HMAC_SECRET');
  if (Buffer.byteLength(value, 'utf8') < 32) {
    throw new Error('Invalid DASHBOARD_CONTEXT_HMAC_SECRET');
  }
  assertProductionSecretStrength(
    value,
    'DASHBOARD_CONTEXT_HMAC_SECRET',
    runtimeEnvironment,
  );
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
