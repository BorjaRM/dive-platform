import {
  verifyToken as clerkVerifyToken,
  createClerkClient,
} from '@clerk/backend';
import { verifyWebhook as clerkVerifyWebhook } from '@clerk/backend/webhooks';
import type {
  IdentityAssurance,
  IdentityProviderPort,
  IdentityProviderPrincipal,
} from './index.js';
import {
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
  getSession: (sessionId: string, signal?: AbortSignal) => Promise<unknown>;
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

function providerFailure(error: unknown): Error {
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
  return Object.freeze({
    level: secondFactorVerified ? 'multi_factor' : 'single_factor',
    verifiedAt: new Date(
      (issuedAt - assuranceAgeMinutes * 60) * 1_000,
    ).toISOString(),
  });
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    throw new InvalidIdentityCredentialsError();
  }
  return value as Record<string, unknown>;
}

function sessionExpiresAtMs(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value >= 1_000_000_000_000) return value;
    if (value >= 1_000_000_000 && value < 10_000_000_000) {
      return value * 1_000;
    }
    return null;
  }
  if (typeof value !== 'string') return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
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
    getSession: (sessionId) => client.sessions.getSession(sessionId),
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
  implements IdentityProviderPort, IdentityWebhookVerifierPort
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
      throw providerFailure(error);
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

    let session: unknown;
    let user: unknown;
    try {
      [session, user] = await withDeadline(
        this.config.requestTimeoutMillis,
        (signal) =>
          Promise.all([
            this.dependencies.getSession(claims.sid as string, signal),
            this.dependencies.getUser(claims.sub as string, signal),
          ]),
      );
    } catch (error) {
      throw providerFailure(error);
    }

    const sessionRecord = record(session);
    const userRecord = record(user);
    const expiresAtMs = sessionExpiresAtMs(sessionRecord.expireAt);
    if (
      sessionRecord.id !== claims.sid ||
      sessionRecord.userId !== claims.sub ||
      sessionRecord.status !== 'active' ||
      expiresAtMs === null ||
      expiresAtMs <= Date.now() ||
      userRecord.id !== claims.sub ||
      typeof userRecord.banned !== 'boolean' ||
      typeof userRecord.locked !== 'boolean' ||
      userRecord.banned ||
      userRecord.locked ||
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

    return Object.freeze({
      issuer: claims.iss as string,
      subject: claims.sub as string,
      sessionId: claims.sid as string,
      verifiedAddresses: Object.freeze(
        verifiedAddresses.filter(
          (address): address is string => address !== null,
        ),
      ),
      assurance: assuranceFromClaims(claims),
    });
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
