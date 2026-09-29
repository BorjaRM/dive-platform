import type { IamDenialReason } from '@dive-center/contracts';

export const IDENTITY_PROVIDER = Symbol('IDENTITY_PROVIDER');
export const IDENTITY_WEBHOOK_VERIFIER = Symbol('IDENTITY_WEBHOOK_VERIFIER');

export class InvalidIdentityCredentialsError extends Error {
  constructor() {
    super('Unauthenticated');
    this.name = 'InvalidIdentityCredentialsError';
  }
}

export class IdentityProviderUnavailableError extends Error {
  constructor() {
    super('Identity provider unavailable');
    this.name = 'IdentityProviderUnavailableError';
  }
}

export type {
  BootstrapInvitationProviderPort,
  BootstrapInvitationProviderResult,
  ClerkBootstrapInvitationConfig,
  ClerkBootstrapInvitationDependencies,
} from './bootstrap-invitations.js';
export {
  BootstrapInvitationProviderError,
  ClerkBootstrapInvitationAdapter,
} from './bootstrap-invitations.js';

declare const authenticatedPrincipal: unique symbol;

export type IdentityAssurance = Readonly<{
  level: 'single_factor' | 'multi_factor';
  verifiedAt: string | null;
}>;

export type AuthenticatedPrincipal = Readonly<{
  issuer: string;
  subject: string;
  sessionId: string;
  verifiedAddresses: readonly string[];
  assurance: IdentityAssurance;
  [authenticatedPrincipal]: true;
}>;

export type IdentityProviderPrincipal = Readonly<{
  issuer: string;
  subject: string;
  sessionId: string;
  verifiedAddresses: readonly string[];
  assurance: IdentityAssurance;
}>;

export interface IdentityProviderPort {
  authenticate(bearerToken: string): Promise<IdentityProviderPrincipal>;
}

export class RejectingIdentityProvider implements IdentityProviderPort {
  async authenticate(): Promise<IdentityProviderPrincipal> {
    throw new Error('Unauthenticated');
  }
}

export class DeterministicIdentityProvider implements IdentityProviderPort {
  constructor(
    private readonly principals: ReadonlyMap<
      string,
      Omit<IdentityProviderPrincipal, 'assurance' | 'sessionId'> & {
        sessionId?: string;
        assurance?: IdentityAssurance;
      }
    >,
  ) {}

  async authenticate(token: string): Promise<IdentityProviderPrincipal> {
    const principal = this.principals.get(token);
    if (!principal) throw new Error('Unauthenticated');
    return Object.freeze({
      ...principal,
      sessionId: principal.sessionId ?? token,
      verifiedAddresses: Object.freeze([...principal.verifiedAddresses]),
      assurance: Object.freeze(
        principal.assurance ?? {
          level: 'single_factor',
          verifiedAt: null,
        },
      ),
    });
  }
}

const authenticatedPrincipals = new WeakSet<object>();

export async function authenticateIdentity(
  provider: IdentityProviderPort,
  bearerToken: string,
): Promise<AuthenticatedPrincipal> {
  const candidate = await provider.authenticate(bearerToken);
  if (typeof candidate !== 'object' || candidate === null) {
    throw new Error('Unauthenticated');
  }
  const candidateRecord = candidate as Record<string, unknown>;
  const assurance = candidateRecord.assurance;
  if (typeof assurance !== 'object' || assurance === null) {
    throw new Error('Unauthenticated');
  }
  const assuranceRecord = assurance as Record<string, unknown>;
  const issuer = candidateRecord.issuer;
  const subject = candidateRecord.subject;
  const sessionId = candidateRecord.sessionId;
  const verifiedAddressesValue = candidateRecord.verifiedAddresses;
  const level = assuranceRecord.level;
  const verifiedAt = assuranceRecord.verifiedAt;
  if (
    typeof issuer !== 'string' ||
    typeof subject !== 'string' ||
    typeof sessionId !== 'string' ||
    !Array.isArray(verifiedAddressesValue) ||
    verifiedAddressesValue.some((address) => typeof address !== 'string') ||
    !['single_factor', 'multi_factor'].includes(level as string) ||
    (verifiedAt !== null && typeof verifiedAt !== 'string')
  ) {
    throw new Error('Unauthenticated');
  }
  const normalizedIssuer = issuer.trim();
  const normalizedSubject = subject.trim();
  const normalizedSessionId = sessionId.trim();
  const verifiedAddresses = verifiedAddressesValue.map((address) =>
    address.trim(),
  );
  const assuranceVerifiedAt = verifiedAt === null ? null : new Date(verifiedAt);
  if (
    !normalizedIssuer ||
    !normalizedSubject ||
    !normalizedSessionId ||
    verifiedAddresses.some((address) => !address) ||
    (assuranceVerifiedAt !== null &&
      Number.isNaN(assuranceVerifiedAt.getTime())) ||
    (level === 'multi_factor' && assuranceVerifiedAt === null)
  ) {
    throw new Error('Unauthenticated');
  }
  const principal = Object.freeze({
    issuer: normalizedIssuer,
    subject: normalizedSubject,
    sessionId: normalizedSessionId,
    verifiedAddresses: Object.freeze(verifiedAddresses),
    assurance: Object.freeze({
      level,
      verifiedAt: assuranceVerifiedAt?.toISOString() ?? null,
    }),
  }) as AuthenticatedPrincipal;
  authenticatedPrincipals.add(principal);
  return principal;
}

export type {
  ClerkIdentityAdapterConfig,
  ClerkIdentityAdapterDependencies,
  IdentityWebhookEvent,
  IdentityWebhookVerifierPort,
} from './clerk.js';
export { ClerkIdentityAdapter } from './clerk.js';

export function assertAuthenticatedPrincipal(
  principal: unknown,
): asserts principal is AuthenticatedPrincipal {
  if (
    typeof principal !== 'object' ||
    principal === null ||
    !authenticatedPrincipals.has(principal)
  ) {
    throw new Error('Untrusted identity assertion');
  }
}

export const IAM_ROLES = {
  tenantOwner: 'tenant_owner',
  tenantAdmin: 'tenant_admin',
  operationsLead: 'operations_lead',
  auditorCompliance: 'auditor_compliance',
  centerManager: 'center_manager',
  receptionBookingManager: 'reception_booking_manager',
  externalCollaborator: 'external_collaborator',
} as const;

export const IAM_PERMISSIONS = [
  'center.read',
  'booking_service.create',
  'booking_service.read',
  'booking_service.update',
  'booking_service.publish',
  'availability.read',
  'availability.manage',
  'booking.create',
  'booking.read',
  'booking.update',
  'booking.confirm',
  'booking.cancel',
  'calendar.read',
  'customer_contact.read',
  'audit.read',
  'audit.export',
  'membership.invite',
  'membership.disable',
  'membership.read',
  'channel.read',
  'channel.manage',
  'support.tenant.read',
] as const;

export type IamPermission = (typeof IAM_PERMISSIONS)[number];

const tenantAdministratorPermissions: readonly IamPermission[] = [
  'center.read',
  'booking_service.create',
  'booking_service.read',
  'booking_service.update',
  'booking_service.publish',
  'availability.read',
  'availability.manage',
  'booking.create',
  'booking.read',
  'booking.update',
  'booking.confirm',
  'booking.cancel',
  'calendar.read',
  'audit.read',
  'membership.invite',
  'membership.disable',
  'membership.read',
  'channel.read',
  'channel.manage',
];

const permissionsByRole: Readonly<
  Record<string, readonly IamPermission[] | undefined>
> = Object.freeze({
  [IAM_ROLES.tenantOwner]: tenantAdministratorPermissions,
  [IAM_ROLES.tenantAdmin]: tenantAdministratorPermissions,
  [IAM_ROLES.operationsLead]: [
    'center.read',
    'booking_service.create',
    'booking_service.read',
    'booking_service.update',
    'booking_service.publish',
    'availability.read',
    'availability.manage',
    'booking.create',
    'booking.read',
    'booking.update',
    'booking.confirm',
    'booking.cancel',
    'calendar.read',
    'audit.read',
  ],
  [IAM_ROLES.auditorCompliance]: [
    'center.read',
    'booking_service.read',
    'availability.read',
    'booking.read',
    'calendar.read',
    'audit.read',
    'membership.read',
    'channel.read',
  ],
  [IAM_ROLES.centerManager]: [
    'center.read',
    'booking_service.create',
    'booking_service.read',
    'booking_service.update',
    'booking_service.publish',
    'availability.read',
    'availability.manage',
    'booking.create',
    'booking.read',
    'booking.update',
    'booking.confirm',
    'booking.cancel',
    'calendar.read',
    'audit.read',
    'channel.read',
    'channel.manage',
  ],
  [IAM_ROLES.receptionBookingManager]: [
    'center.read',
    'booking_service.read',
    'availability.read',
    'availability.manage',
    'booking.create',
    'booking.read',
    'booking.update',
    'booking.confirm',
    'booking.cancel',
    'calendar.read',
  ],
});

const tenantWideRoles: ReadonlySet<string> = new Set([
  IAM_ROLES.tenantOwner,
  IAM_ROLES.tenantAdmin,
  IAM_ROLES.operationsLead,
  IAM_ROLES.auditorCompliance,
]);

export function permissionsForRoles(
  roles: readonly string[],
): ReadonlySet<IamPermission> {
  if (
    roles.includes(IAM_ROLES.externalCollaborator) ||
    roles.some((role) => permissionsByRole[role] === undefined)
  ) {
    return new Set();
  }

  return new Set(roles.flatMap((role) => permissionsByRole[role] ?? []));
}

export function hasTenantWideScope(roles: readonly string[]): boolean {
  return (
    !roles.includes(IAM_ROLES.externalCollaborator) &&
    !roles.some((role) => permissionsByRole[role] === undefined) &&
    roles.some((role) => tenantWideRoles.has(role))
  );
}

function hasTenantWideScopeForPermission(
  roles: readonly string[],
  permission: IamPermission,
): boolean {
  return roles.some(
    (role) =>
      tenantWideRoles.has(role) &&
      permissionsByRole[role]?.includes(permission),
  );
}

export type IamAuthorizationDecision =
  | Readonly<{ allowed: true }>
  | Readonly<{ allowed: false; reason: IamDenialReason }>;

export function authorizeIamMembership(
  input: Readonly<{
    membershipStatus: string;
    roles: readonly string[];
    centerIds: readonly string[] | null;
    permission: string;
    requestedCenterId?: string;
    tenantMatches: boolean;
    resourceExists: boolean;
    resourceStateAllows: boolean;
  }>,
): IamAuthorizationDecision {
  if (input.membershipStatus !== 'active') {
    return { allowed: false, reason: 'membership_missing_or_inactive' };
  }
  if (!input.tenantMatches) {
    return { allowed: false, reason: 'resource_missing_or_inaccessible' };
  }
  const permission = input.permission as IamPermission;
  const hasPermission = permissionsForRoles(input.roles).has(permission);
  const hasTenantScope = hasPermission
    ? hasTenantWideScopeForPermission(input.roles, permission)
    : hasTenantWideScope(input.roles);
  if (
    input.requestedCenterId &&
    !hasTenantScope &&
    !input.centerIds?.includes(input.requestedCenterId)
  ) {
    return { allowed: false, reason: 'scope_mismatch' };
  }
  if (!hasPermission) {
    return { allowed: false, reason: 'permission_missing' };
  }
  if (!hasTenantScope && !input.requestedCenterId) {
    return { allowed: false, reason: 'scope_mismatch' };
  }
  if (!input.resourceExists) {
    return { allowed: false, reason: 'resource_missing_or_inaccessible' };
  }
  if (!input.resourceStateAllows) {
    return { allowed: false, reason: 'resource_state_invalid' };
  }
  return { allowed: true };
}
