import type { AuthenticatedPrincipal } from '@dive-center/identity';
import { Inject, Injectable } from '@nestjs/common';
import type { ResolvedCenterApplicationScope } from '../common/auth/http-admission.js';
import { CenterEntriesService } from './center-entries/center-entries.service.js';
import { CentersService } from './centers/centers.service.js';
import { InvitationsService } from './invitations/invitations.service.js';
import { MembershipsService } from './memberships/memberships.service.js';
import { TenantContextService } from './tenant-context/tenant-context.service.js';

export type { ResolvedCenterApplicationScope } from '../common/auth/http-admission.js';

@Injectable()
export class IamService {
  constructor(
    @Inject(TenantContextService)
    private readonly tenantContexts: TenantContextService,
    @Inject(CentersService) private readonly centers: CentersService,
    @Inject(MembershipsService)
    private readonly memberships: MembershipsService,
    @Inject(CenterEntriesService)
    private readonly centerEntries: CenterEntriesService,
    @Inject(InvitationsService)
    private readonly invitations: InvitationsService,
  ) {}

  listOperators(principal: AuthenticatedPrincipal) {
    return this.tenantContexts.listOperators(principal);
  }

  issueTenantContext(
    principal: AuthenticatedPrincipal,
    operatorRef: string | undefined,
    correlationId: string,
  ) {
    return this.tenantContexts.issueTenantContext(
      principal,
      operatorRef,
      correlationId,
    );
  }

  isCenterOriginAllowed(origin: string) {
    return this.tenantContexts.isCenterOriginAllowed(origin);
  }

  resolveCenterOrigin(origin: string) {
    return this.tenantContexts.resolveCenterOrigin(origin);
  }

  resolveCenterApplicationScope(
    ...input: Parameters<TenantContextService['resolveCenterApplicationScope']>
  ) {
    return this.tenantContexts.resolveCenterApplicationScope(...input);
  }

  issueCenterEntryContext(
    principal: AuthenticatedPrincipal,
    origin: string | undefined,
    input: unknown,
    correlationId: string,
  ) {
    return this.tenantContexts.issueCenterEntryContext(
      principal,
      origin,
      input,
      correlationId,
    );
  }

  setCenterEntryStatus(
    scope: ResolvedCenterApplicationScope,
    requestedCenterId: string,
    input: Parameters<CenterEntriesService['setStatus']>[2],
    correlationId: string,
  ) {
    return this.centerEntries.setStatus(
      scope,
      requestedCenterId,
      input,
      correlationId,
    );
  }

  revokeTenantContext(
    principal: AuthenticatedPrincipal,
    handle: string | undefined,
    correlationId: string,
  ) {
    return this.tenantContexts.revokeTenantContext(
      principal,
      handle,
      correlationId,
    );
  }

  readCenters(scope: ResolvedCenterApplicationScope, correlationId: string) {
    return this.centers.readCenters(scope, correlationId);
  }

  readCenter(
    scope: ResolvedCenterApplicationScope,
    requestedCenterId: string,
    correlationId: string,
  ) {
    return this.centers.readCenter(scope, requestedCenterId, correlationId);
  }

  disableMembership(
    principal: AuthenticatedPrincipal,
    handle: string | undefined,
    membershipId: string,
    correlationId: string,
  ) {
    return this.memberships.disableMembership(
      principal,
      handle,
      membershipId,
      correlationId,
    );
  }

  issueInvitation(
    principal: AuthenticatedPrincipal,
    tenantId: string,
    input: Parameters<InvitationsService['issueInvitation']>[2],
    correlationId: string,
  ) {
    return this.invitations.issueInvitation(
      principal,
      tenantId,
      input,
      correlationId,
    );
  }

  respondToInvitation(
    principal: AuthenticatedPrincipal,
    tenantId: string,
    credential: string,
    decision: 'accepted' | 'rejected',
    correlationId: string,
  ) {
    return this.invitations.respondToInvitation(
      principal,
      tenantId,
      credential,
      decision,
      correlationId,
    );
  }

  revokeInvitation(
    principal: AuthenticatedPrincipal,
    tenantId: string,
    invitationId: string,
    correlationId: string,
  ) {
    return this.invitations.revokeInvitation(
      principal,
      tenantId,
      invitationId,
      correlationId,
    );
  }
}
