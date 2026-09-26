export const IDENTITY_PROVIDER = Symbol('IDENTITY_PROVIDER');

export type AuthenticatedPrincipal = Readonly<{
  issuer: string;
  subject: string;
}>;

export interface IdentityProviderPort {
  authenticate(bearerToken: string): Promise<AuthenticatedPrincipal>;
}

export class RejectingIdentityProvider implements IdentityProviderPort {
  async authenticate(): Promise<AuthenticatedPrincipal> {
    throw new Error('Unauthenticated');
  }
}

export class DeterministicIdentityProvider implements IdentityProviderPort {
  constructor(
    private readonly principals: ReadonlyMap<string, AuthenticatedPrincipal>,
  ) {}

  async authenticate(token: string): Promise<AuthenticatedPrincipal> {
    const principal = this.principals.get(token);
    if (!principal) throw new Error('Unauthenticated');
    return Object.freeze({ ...principal });
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

const tenantWideRoles: ReadonlySet<string> = new Set([
  IAM_ROLES.tenantOwner,
  IAM_ROLES.tenantAdmin,
  IAM_ROLES.operationsLead,
  IAM_ROLES.auditorCompliance,
]);

export function permissionsForRoles(
  roles: readonly string[],
): ReadonlySet<string> {
  const result = new Set<string>();
  if (roles.some((role) => role !== IAM_ROLES.externalCollaborator)) {
    result.add('center.read');
  }
  if (
    roles.includes(IAM_ROLES.tenantOwner) ||
    roles.includes(IAM_ROLES.tenantAdmin)
  ) {
    result.add('membership.disable');
  }
  return result;
}

export function hasTenantWideScope(roles: readonly string[]): boolean {
  return roles.some((role) => tenantWideRoles.has(role));
}
