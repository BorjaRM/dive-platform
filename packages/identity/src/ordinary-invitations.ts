import { createClerkClient } from '@clerk/backend';

const ORDINARY_ATTEMPT_REFERENCE_KEY = 'diveOrdinaryInvitationAttemptId';

export type OrdinaryInvitationProviderResult = Readonly<{
  invitationRef: string;
  status: string;
}>;

export interface OrdinaryInvitationProviderPort {
  create(input: {
    targetAddress: string;
    invitationAttemptId: string;
  }): Promise<OrdinaryInvitationProviderResult>;
  reconcile(input: {
    targetAddress: string;
    invitationAttemptId: string;
  }): Promise<OrdinaryInvitationProviderResult | null>;
  revoke(invitationRef: string): Promise<OrdinaryInvitationProviderResult>;
}

export class OrdinaryInvitationProviderError extends Error {
  constructor(
    readonly statusCode: number | null,
    readonly retryAfter: string | null,
    readonly timedOut = false,
  ) {
    super('Ordinary invitation provider failed');
    this.name = 'OrdinaryInvitationProviderError';
  }
}

export type ClerkOrdinaryInvitationConfig = Readonly<{
  allowInsecureLocalRedirect?: boolean;
  authenticationOrigin: string;
  secretKey: string;
  redirectUrl: string;
  requestTimeoutMillis: number;
}>;

type ProviderInvitation = Readonly<{
  id: string;
  status: string;
  publicMetadata: Record<string, unknown> | null;
}>;

export type ClerkOrdinaryInvitationDependencies = Readonly<{
  createInvitation(input: {
    emailAddress: string;
    expiresInDays: number;
    ignoreExisting: boolean;
    notify: boolean;
    publicMetadata: Record<string, unknown>;
    redirectUrl: string;
  }): Promise<ProviderInvitation>;
  getInvitationList(input: {
    limit: number;
    offset: number;
    query: string;
  }): Promise<
    Readonly<{ data: readonly ProviderInvitation[]; totalCount: number }>
  >;
  revokeInvitation(invitationRef: string): Promise<ProviderInvitation>;
}>;

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
  operation: Promise<T>,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timeout = setTimeout(
      () => reject(new OrdinaryInvitationProviderError(null, null, true)),
      timeoutMillis,
    );
  });
  try {
    return await Promise.race([operation, deadline]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

function redirectUrl(
  value: string,
  authenticationOrigin: string,
  allowInsecureLocalRedirect: boolean,
): string {
  const normalized = required(value, 'ORDINARY_INVITATION_REDIRECT_URL');
  const canonicalOrigin = required(
    authenticationOrigin,
    'AUTHENTICATION_ORIGIN',
  );
  let parsed: URL;
  let authenticationUrl: URL;
  try {
    parsed = new URL(normalized);
    authenticationUrl = new URL(canonicalOrigin);
  } catch {
    throw new Error('Invalid ORDINARY_INVITATION_REDIRECT_URL');
  }
  const isAllowedLocalHttp =
    allowInsecureLocalRedirect &&
    parsed.protocol === 'http:' &&
    (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1');
  if (
    authenticationUrl.origin !== canonicalOrigin ||
    parsed.origin !== canonicalOrigin ||
    parsed.username !== '' ||
    parsed.password !== '' ||
    (parsed.protocol !== 'https:' && !isAllowedLocalHttp) ||
    parsed.pathname !== '/invitations/accept' ||
    parsed.search !== '' ||
    parsed.hash !== ''
  ) {
    throw new Error('Invalid ORDINARY_INVITATION_REDIRECT_URL');
  }
  return parsed.toString();
}

function retryAfterFromError(error: Record<string, unknown>): string | null {
  const value = error.retryAfter;
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? String(value)
    : null;
}

function providerError(error: unknown): OrdinaryInvitationProviderError {
  if (error instanceof OrdinaryInvitationProviderError) return error;
  const record =
    typeof error === 'object' && error !== null
      ? (error as Record<string, unknown>)
      : {};
  return new OrdinaryInvitationProviderError(
    typeof record.status === 'number' ? record.status : null,
    retryAfterFromError(record),
  );
}

function providerStateError(
  name: 'AmbiguousProviderStateError' | 'UnknownProviderStateError',
): OrdinaryInvitationProviderError {
  const error = new OrdinaryInvitationProviderError(null, null);
  error.name = name;
  return error;
}

function result(
  invitation: ProviderInvitation,
): OrdinaryInvitationProviderResult {
  if (!invitation.id.trim() || !invitation.status.trim()) {
    throw new OrdinaryInvitationProviderError(null, null);
  }
  return Object.freeze({
    invitationRef: invitation.id,
    status: invitation.status,
  });
}

function defaultDependencies(
  secretKey: string,
): ClerkOrdinaryInvitationDependencies {
  const client = createClerkClient({ secretKey });
  return {
    createInvitation: (input) => client.invitations.createInvitation(input),
    getInvitationList: async (input) => {
      const page = await client.invitations.getInvitationList(input);
      return { data: page.data, totalCount: page.totalCount };
    },
    revokeInvitation: (invitationRef) =>
      client.invitations.revokeInvitation(invitationRef),
  };
}

export class ClerkOrdinaryInvitationAdapter
  implements OrdinaryInvitationProviderPort
{
  private readonly redirect: string;
  private readonly requestTimeoutMillis: number;
  private readonly dependencies: ClerkOrdinaryInvitationDependencies;

  constructor(
    config: ClerkOrdinaryInvitationConfig,
    dependencies?: ClerkOrdinaryInvitationDependencies,
  ) {
    const secretKey = required(config.secretKey, 'CLERK_SECRET_KEY');
    this.redirect = redirectUrl(
      config.redirectUrl,
      config.authenticationOrigin,
      config.allowInsecureLocalRedirect ?? false,
    );
    this.requestTimeoutMillis = positiveInteger(
      config.requestTimeoutMillis,
      'CLERK_REQUEST_TIMEOUT_MS',
    );
    this.dependencies = dependencies ?? defaultDependencies(secretKey);
  }

  async create(input: {
    targetAddress: string;
    invitationAttemptId: string;
  }): Promise<OrdinaryInvitationProviderResult> {
    try {
      return result(
        await withDeadline(
          this.requestTimeoutMillis,
          this.dependencies.createInvitation({
            emailAddress: input.targetAddress,
            expiresInDays: 7,
            ignoreExisting: true,
            notify: true,
            publicMetadata: {
              [ORDINARY_ATTEMPT_REFERENCE_KEY]: input.invitationAttemptId,
            },
            redirectUrl: this.redirect,
          }),
        ),
      );
    } catch (error) {
      throw providerError(error);
    }
  }

  async reconcile(input: {
    targetAddress: string;
    invitationAttemptId: string;
  }): Promise<OrdinaryInvitationProviderResult | null> {
    const matches: ProviderInvitation[] = [];
    let offset = 0;
    try {
      do {
        const page = await withDeadline(
          this.requestTimeoutMillis,
          this.dependencies.getInvitationList({
            limit: 500,
            offset,
            query: input.targetAddress,
          }),
        );
        matches.push(
          ...page.data.filter(
            (invitation) =>
              invitation.publicMetadata?.[ORDINARY_ATTEMPT_REFERENCE_KEY] ===
              input.invitationAttemptId,
          ),
        );
        offset += page.data.length;
        if (offset >= page.totalCount || page.data.length === 0) break;
      } while (matches.length < 2);
    } catch (error) {
      throw providerError(error);
    }
    if (matches.length > 1) {
      throw providerStateError('AmbiguousProviderStateError');
    }
    return matches[0] ? result(matches[0]) : null;
  }

  async revoke(
    invitationRef: string,
  ): Promise<OrdinaryInvitationProviderResult> {
    try {
      return result(
        await withDeadline(
          this.requestTimeoutMillis,
          this.dependencies.revokeInvitation(invitationRef),
        ),
      );
    } catch (error) {
      const failure = providerError(error);
      if (failure.statusCode === 404) {
        return Object.freeze({ invitationRef, status: 'not_found' });
      }
      throw failure;
    }
  }
}
