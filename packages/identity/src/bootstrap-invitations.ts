import { createClerkClient } from '@clerk/backend';

const GRANT_REFERENCE_KEY = 'diveBootstrapGrantRef';

export type BootstrapInvitationProviderResult = Readonly<{
  invitationRef: string;
  status: string;
}>;

export interface BootstrapInvitationProviderPort {
  create(input: {
    destinationEmail: string;
    grantRef: string;
  }): Promise<BootstrapInvitationProviderResult>;
  reconcile(input: {
    destinationEmail: string;
    grantRef: string;
  }): Promise<BootstrapInvitationProviderResult | null>;
  revoke(invitationRef: string): Promise<BootstrapInvitationProviderResult>;
}

export class BootstrapInvitationProviderError extends Error {
  constructor(
    readonly statusCode: number | null,
    readonly retryAfter: string | null,
    readonly timedOut = false,
  ) {
    super('Bootstrap invitation provider failed');
    this.name = 'BootstrapInvitationProviderError';
  }
}

export type ClerkBootstrapInvitationConfig = Readonly<{
  secretKey: string;
  redirectUrl: string;
  requestTimeoutMillis: number;
}>;

type ProviderInvitation = Readonly<{
  id: string;
  status: string;
  publicMetadata: Record<string, unknown> | null;
}>;

export type ClerkBootstrapInvitationDependencies = Readonly<{
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
      () => reject(new BootstrapInvitationProviderError(null, null, true)),
      timeoutMillis,
    );
  });
  try {
    return await Promise.race([operation, deadline]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

function redirectUrl(value: string): string {
  const normalized = required(value, 'BOOTSTRAP_INVITATION_REDIRECT_URL');
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error('Invalid BOOTSTRAP_INVITATION_REDIRECT_URL');
  }
  if (
    parsed.protocol !== 'https:' ||
    parsed.pathname !== '/bootstrap/accept' ||
    parsed.search !== '' ||
    parsed.hash !== ''
  ) {
    throw new Error('Invalid BOOTSTRAP_INVITATION_REDIRECT_URL');
  }
  return parsed.toString();
}

function retryAfterFromError(error: Record<string, unknown>): string | null {
  const value = error.retryAfter;
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? String(value)
    : null;
}

function providerError(error: unknown): BootstrapInvitationProviderError {
  if (error instanceof BootstrapInvitationProviderError) return error;
  const record =
    typeof error === 'object' && error !== null
      ? (error as Record<string, unknown>)
      : {};
  return new BootstrapInvitationProviderError(
    typeof record.status === 'number' ? record.status : null,
    retryAfterFromError(record),
  );
}

function result(
  invitation: ProviderInvitation,
): BootstrapInvitationProviderResult {
  if (!invitation.id.trim() || !invitation.status.trim()) {
    throw new BootstrapInvitationProviderError(null, null);
  }
  return Object.freeze({
    invitationRef: invitation.id,
    status: invitation.status,
  });
}

function defaultDependencies(
  secretKey: string,
): ClerkBootstrapInvitationDependencies {
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

export class ClerkBootstrapInvitationAdapter
  implements BootstrapInvitationProviderPort
{
  private readonly redirect: string;
  private readonly requestTimeoutMillis: number;
  private readonly dependencies: ClerkBootstrapInvitationDependencies;

  constructor(
    config: ClerkBootstrapInvitationConfig,
    dependencies?: ClerkBootstrapInvitationDependencies,
  ) {
    const secretKey = required(config.secretKey, 'CLERK_SECRET_KEY');
    this.redirect = redirectUrl(config.redirectUrl);
    this.requestTimeoutMillis = positiveInteger(
      config.requestTimeoutMillis,
      'CLERK_REQUEST_TIMEOUT_MS',
    );
    this.dependencies = dependencies ?? defaultDependencies(secretKey);
  }

  async create(input: {
    destinationEmail: string;
    grantRef: string;
  }): Promise<BootstrapInvitationProviderResult> {
    try {
      return result(
        await withDeadline(
          this.requestTimeoutMillis,
          this.dependencies.createInvitation({
            emailAddress: input.destinationEmail,
            expiresInDays: 7,
            ignoreExisting: true,
            notify: true,
            publicMetadata: { [GRANT_REFERENCE_KEY]: input.grantRef },
            redirectUrl: this.redirect,
          }),
        ),
      );
    } catch (error) {
      throw providerError(error);
    }
  }

  async reconcile(input: {
    destinationEmail: string;
    grantRef: string;
  }): Promise<BootstrapInvitationProviderResult | null> {
    const matches: ProviderInvitation[] = [];
    let offset = 0;
    try {
      do {
        const page = await withDeadline(
          this.requestTimeoutMillis,
          this.dependencies.getInvitationList({
            limit: 500,
            offset,
            query: input.destinationEmail,
          }),
        );
        matches.push(
          ...page.data.filter(
            (invitation) =>
              invitation.publicMetadata?.[GRANT_REFERENCE_KEY] ===
              input.grantRef,
          ),
        );
        offset += page.data.length;
        if (offset >= page.totalCount || page.data.length === 0) break;
      } while (matches.length < 2);
    } catch (error) {
      throw providerError(error);
    }
    if (matches.length > 1) {
      throw new BootstrapInvitationProviderError(409, null);
    }
    return matches[0] ? result(matches[0]) : null;
  }

  async revoke(
    invitationRef: string,
  ): Promise<BootstrapInvitationProviderResult> {
    try {
      return result(
        await withDeadline(
          this.requestTimeoutMillis,
          this.dependencies.revokeInvitation(invitationRef),
        ),
      );
    } catch (error) {
      throw providerError(error);
    }
  }
}
