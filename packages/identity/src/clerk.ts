import { createClerkClient, verifyToken } from '@clerk/backend';
import { verifyWebhook } from '@clerk/backend/webhooks';
import type {
  IdentityAssurance,
  IdentityProviderPort,
  IdentityProviderPrincipal,
} from './index.js';

export type ClerkIdentityAdapterConfig = Readonly<{
  secretKey: string;
  webhookSigningSecret: string;
  issuer: string;
  authorizedParties: readonly string[];
}>;

export type IdentityWebhookEvent = Readonly<{
  providerEventId: string;
  issuer: string;
  type: string;
  subject: string | null;
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

function assuranceFromClaims(claims: {
  iat?: number;
  fva?: readonly [number, number];
}): IdentityAssurance {
  const issuedAt = claims.iat ?? Number.NaN;
  const factorAges = claims.fva;
  if (!factorAges) {
    return Object.freeze({ level: 'single_factor', verifiedAt: null });
  }
  if (
    !Number.isFinite(issuedAt) ||
    !Number.isFinite(factorAges[0]) ||
    !Number.isFinite(factorAges[1]) ||
    factorAges[0] < 0
  ) {
    throw new Error('Unauthenticated');
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
  private readonly client: ReturnType<typeof createClerkClient>;

  constructor(config: ClerkIdentityAdapterConfig) {
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
    });
    this.client = createClerkClient({ secretKey: this.config.secretKey });
  }

  async authenticate(bearerToken: string): Promise<IdentityProviderPrincipal> {
    try {
      const claims = await verifyToken(bearerToken, {
        authorizedParties: [...this.config.authorizedParties],
        secretKey: this.config.secretKey,
      });
      if (
        'aud' in claims ||
        claims.iss !== this.config.issuer ||
        typeof claims.sub !== 'string' ||
        typeof claims.sid !== 'string'
      ) {
        throw new Error('Unauthenticated');
      }

      const [session, user] = await Promise.all([
        this.client.sessions.getSession(claims.sid),
        this.client.users.getUser(claims.sub),
      ]);
      if (
        session.id !== claims.sid ||
        session.userId !== claims.sub ||
        session.status !== 'active' ||
        session.expireAt <= Date.now() ||
        user.id !== claims.sub ||
        user.banned ||
        user.locked
      ) {
        throw new Error('Unauthenticated');
      }

      return Object.freeze({
        issuer: claims.iss,
        subject: claims.sub,
        verifiedAddresses: Object.freeze(
          user.emailAddresses
            .filter(({ verification }) => verification?.status === 'verified')
            .map(({ emailAddress }) => emailAddress),
        ),
        assurance: assuranceFromClaims(claims),
      });
    } catch {
      throw new Error('Unauthenticated');
    }
  }

  async verify(
    rawBody: Uint8Array,
    headerValues: Readonly<
      Record<string, string | readonly string[] | undefined>
    >,
  ): Promise<IdentityWebhookEvent> {
    const headers = requestHeaders(headerValues);
    const event = await verifyWebhook(
      new Request('https://identity-webhook.invalid', {
        method: 'POST',
        headers,
        body: Uint8Array.from(rawBody),
      }),
      { signingSecret: this.config.webhookSigningSecret },
    );
    const providerEventId = headers.get('svix-id')?.trim();
    if (!providerEventId) throw new Error('Invalid webhook');
    const data = event.data as unknown as Record<string, unknown>;
    return Object.freeze({
      providerEventId,
      issuer: this.config.issuer,
      type: event.type,
      subject: eventSubject(event.type, data),
      occurredAt: eventOccurredAt(data),
    });
  }
}
