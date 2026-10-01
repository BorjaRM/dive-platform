import {
  verifyToken as clerkVerifyToken,
  createClerkClient,
} from '@clerk/backend';
import { verifyWebhook as clerkVerifyWebhook } from '@clerk/backend/webhooks';
import type {
  AuthenticatedPrincipal,
  IdentityAssurance,
  IdentityProviderPort,
  IdentityProviderPrincipal,
  VerifiedAddressProviderPort,
} from './index.js';
import {
  assertAuthenticatedPrincipal,
  IdentityProviderUnavailableError,
  InvalidIdentityCredentialsError,
} from './index.js';

export type ClerkIdentityAdapterConfig = Readonly<{
  secretKey: string;
  webhookSigningSecret: string;
  issuer: string;
  authorizedParties: readonly string[];
  requestTimeoutMillis: number;
}>;

export type ClerkIdentityAdapterDependencies = Readonly<{
  verifyToken: (
    bearerToken: string,
    options: Readonly<{
      authorizedParties: readonly string[];
      secretKey: string;
    }>,
    signal?: AbortSignal,
  ) => Promise<unknown>;
  getUser: (userId: string, signal?: AbortSignal) => Promise<unknown>;
  verifyWebhook: (
    request: Request,
    options: Readonly<{ signingSecret: string }>,
  ) => Promise<unknown>;
}>;

export type IdentityWebhookEvent = Readonly<{
  providerEventId: string;
  issuer: string;
  type: string;
  subject: string | null;
  sessionId?: string | null;
  occurredAt: string | null;
}>;

export interface IdentityWebhookVerifierPort {
  verify(
    rawBody: Uint8Array,
    headers: Readonly<Record<string, string | readonly string[] | undefined>>,
  ): Promise<IdentityWebhookEvent>;
}

function required(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`Missing ${name}`);
  return normalized;
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`Invalid ${name}`);
  }
  return value;
}

async function withDeadline<T>(
  timeoutMillis: number,
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(new IdentityProviderUnavailableError());
    }, timeoutMillis);
  });
  try {
    return await Promise.race([operation(controller.signal), deadline]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

function providerFailure(error: unknown, operation: 'token' | 'user'): Error {
  if (
    error instanceof InvalidIdentityCredentialsError ||
    error instanceof IdentityProviderUnavailableError
  ) {
    return error;
  }
  const status =
    typeof error === 'object' && error !== null && 'status' in error
      ? (error as { status?: unknown }).status
      : undefined;
  if (operation === 'user') {
    if (status === 404) return new InvalidIdentityCredentialsError();
    return new IdentityProviderUnavailableError();
  }
  const reason =
    typeof error === 'object' && error !== null && 'reason' in error
      ? (error as { reason?: unknown }).reason
      : undefined;
  if (
    typeof reason === 'string' &&
    [
      'token-expired',
      'token-invalid',
      'token-invalid-algorithm',
      'token-invalid-authorized-parties',
      'token-invalid-signature',
      'token-not-active-yet',
      'token-iat-in-the-future',
      'token-verification-failed',
    ].includes(reason)
  ) {
    return new InvalidIdentityCredentialsError();
  }
  return status === 400 || status === 401 || status === 403 || status === 404
    ? new InvalidIdentityCredentialsError()
    : new IdentityProviderUnavailableError();
}

function assuranceFromClaims(claims: {
  iat?: unknown;
  fva?: unknown;
}): IdentityAssurance {
  const issuedAt = typeof claims.iat === 'number' ? claims.iat : Number.NaN;
  const factorAges = claims.fva;
  if (factorAges === undefined) {
    return Object.freeze({ level: 'single_factor', verifiedAt: null });
  }
  if (
    !Array.isArray(factorAges) ||
    factorAges.length !== 2 ||
    typeof factorAges[0] !== 'number' ||
    typeof factorAges[1] !== 'number' ||
    !Number.isFinite(issuedAt) ||
    !Number.isFinite(factorAges[0]) ||
    !Number.isFinite(factorAges[1]) ||
    factorAges[0] < 0
  ) {
    throw new InvalidIdentityCredentialsError();
  }
  const secondFactorVerified = factorAges[1] >= 0;
  const assuranceAgeMinutes = secondFactorVerified
    ? Math.min(factorAges[0], factorAges[1])
    : factorAges[0];
  const verifiedAtMillis = (issuedAt - assuranceAgeMinutes * 60) * 1_000;
  const verifiedAt = new Date(verifiedAtMillis);
  if (
    !Number.isFinite(verifiedAtMillis) ||
    Number.isNaN(verifiedAt.getTime())
  ) {
    throw new InvalidIdentityCredentialsError();
  }
  return Object.freeze({
    level: secondFactorVerified ? 'multi_factor' : 'single_factor',
    verifiedAt: verifiedAt.toISOString(),
  });
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    throw new InvalidIdentityCredentialsError();
  }
  return value as Record<string, unknown>;
}

function defaultDependencies(
  secretKey: string,
): ClerkIdentityAdapterDependencies {
  const client = createClerkClient({ secretKey });
  return {
    verifyToken: (bearerToken, options) =>
      clerkVerifyToken(bearerToken, {
        authorizedParties: [...options.authorizedParties],
        secretKey: options.secretKey,
      }),
    getUser: (userId) => client.users.getUser(userId),
    verifyWebhook: (request, options) =>
      clerkVerifyWebhook(request, { signingSecret: options.signingSecret }),
  };
}

function eventSubject(
  type: string,
  data: Record<string, unknown>,
): string | null {
  const candidate =
    type === 'user.created' ||
    type === 'user.updated' ||
    type === 'user.deleted'
      ? data.id
      : type === 'session.created' ||
          type === 'session.ended' ||
          type === 'session.removed' ||
          type === 'session.revoked'
        ? data.user_id
        : null;
  return typeof candidate === 'string' && candidate.trim()
    ? candidate.trim()
    : null;
}

function eventOccurredAt(data: Record<string, unknown>): string | null {
  const candidate = data.updated_at ?? data.created_at;
  if (typeof candidate !== 'number' || !Number.isFinite(candidate)) return null;
  const occurredAt = new Date(candidate);
  return Number.isNaN(occurredAt.getTime()) ? null : occurredAt.toISOString();
}

function eventSessionId(
  type: string,
  data: Record<string, unknown>,
): string | null {
  if (
    type !== 'session.created' &&
    type !== 'session.ended' &&
    type !== 'session.removed' &&
    type !== 'session.revoked'
  ) {
    return null;
  }
  const candidate = data.id;
  return typeof candidate === 'string' && candidate.trim()
    ? candidate.trim()
    : null;
}

function requestHeaders(
  values: Readonly<Record<string, string | readonly string[] | undefined>>,
): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(values)) {
    if (typeof value === 'string') {
      headers.set(name, value);
    } else if (value !== undefined) {
      for (const item of value) headers.append(name, item);
    }
  }
  return headers;
}

export class ClerkIdentityAdapter
  implements
    IdentityProviderPort,
    VerifiedAddressProviderPort,
    IdentityWebhookVerifierPort
{
  private readonly config: ClerkIdentityAdapterConfig;
  private readonly dependencies: ClerkIdentityAdapterDependencies;

  constructor(
    config: ClerkIdentityAdapterConfig,
    dependencies?: ClerkIdentityAdapterDependencies,
  ) {
    const authorizedParties = config.authorizedParties
      .map((party) => party.trim())
      .filter(Boolean);
    if (authorizedParties.length === 0) {
      throw new Error('Missing CLERK_AUTHORIZED_PARTIES');
    }
    this.config = Object.freeze({
      secretKey: required(config.secretKey, 'CLERK_SECRET_KEY'),
      webhookSigningSecret: required(
        config.webhookSigningSecret,
        'CLERK_WEBHOOK_SIGNING_SECRET',
      ),
      issuer: required(config.issuer, 'CLERK_ISSUER'),
      authorizedParties: Object.freeze(authorizedParties),
      requestTimeoutMillis: positiveInteger(
        config.requestTimeoutMillis,
        'CLERK_REQUEST_TIMEOUT_MS',
      ),
    });
    this.dependencies =
      dependencies ?? defaultDependencies(this.config.secretKey);
  }

  async authenticate(bearerToken: string): Promise<IdentityProviderPrincipal> {
    let claims: Record<string, unknown>;
    try {
      claims = record(
        await withDeadline(this.config.requestTimeoutMillis, (signal) =>
          this.dependencies.verifyToken(
            bearerToken,
            {
              authorizedParties: this.config.authorizedParties,
              secretKey: this.config.secretKey,
            },
            signal,
          ),
        ),
      );
    } catch (error) {
      throw providerFailure(error, 'token');
    }

    if (
      'aud' in claims ||
      claims.iss !== this.config.issuer ||
      typeof claims.sub !== 'string' ||
      typeof claims.sid !== 'string' ||
      typeof claims.azp !== 'string' ||
      !this.config.authorizedParties.includes(claims.azp)
    ) {
      throw new InvalidIdentityCredentialsError();
    }

    return Object.freeze({
      issuer: claims.iss as string,
      subject: claims.sub as string,
      sessionId: claims.sid as string,
      verifiedAddresses: Object.freeze([]),
      assurance: assuranceFromClaims(claims),
    });
  }

  async getVerifiedAddresses(
    principal: AuthenticatedPrincipal,
  ): Promise<readonly string[]> {
    assertAuthenticatedPrincipal(principal);
    if (principal.issuer !== this.config.issuer) {
      throw new InvalidIdentityCredentialsError();
    }
    let user: unknown;
    try {
      user = await withDeadline(this.config.requestTimeoutMillis, (signal) =>
        this.dependencies.getUser(principal.subject, signal),
      );
    } catch (error) {
      throw providerFailure(error, 'user');
    }

    const userRecord = record(user);
    if (
      userRecord.id !== principal.subject ||
      !Array.isArray(userRecord.emailAddresses)
    ) {
      throw new InvalidIdentityCredentialsError();
    }

    const verifiedAddresses = userRecord.emailAddresses.map((entry) => {
      const emailAddress = record(entry);
      if (typeof emailAddress.emailAddress !== 'string') {
        throw new InvalidIdentityCredentialsError();
      }
      const verification = emailAddress.verification;
      if (
        verification !== undefined &&
        verification !== null &&
        (typeof verification !== 'object' ||
          typeof (verification as Record<string, unknown>).status !== 'string')
      ) {
        throw new InvalidIdentityCredentialsError();
      }
      return verification &&
        (verification as Record<string, unknown>).status === 'verified'
        ? emailAddress.emailAddress
        : null;
    });

    return Object.freeze(
      verifiedAddresses.filter(
        (address): address is string => address !== null,
      ),
    );
  }

  async verify(
    rawBody: Uint8Array,
    headerValues: Readonly<
      Record<string, string | readonly string[] | undefined>
    >,
  ): Promise<IdentityWebhookEvent> {
    const headers = requestHeaders(headerValues);
    const event = record(
      await this.dependencies.verifyWebhook(
        new Request('https://identity-webhook.invalid', {
          method: 'POST',
          headers,
          body: Uint8Array.from(rawBody),
        }),
        { signingSecret: this.config.webhookSigningSecret },
      ),
    );
    const type = event.type;
    const data = record(event.data);
    const providerEventId = headers.get('svix-id')?.trim();
    if (typeof type !== 'string' || !providerEventId) {
      throw new Error('Invalid webhook');
    }
    return Object.freeze({
      providerEventId,
      issuer: this.config.issuer,
      type,
      subject: eventSubject(type, data),
      sessionId: eventSessionId(type, data),
      occurredAt: eventOccurredAt(data),
    });
  }
}
