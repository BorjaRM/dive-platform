import {
  issueIamInvitation,
  issueIamMembershipInvitation,
  respondToIamInvitation,
  revokeIamInvitation,
} from '@dive-center/database';
import type { AuthenticatedPrincipal } from '@dive-center/identity';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { DATABASE_POOL } from '../../common/database/database.tokens.js';
import {
  SECURITY_LOGGER,
  type SecurityLoggerPort,
} from '../../common/security/security.tokens.js';
import { denied } from '../iam-denied.js';
import { TenantContextService } from '../tenant-context/tenant-context.service.js';

@Injectable()
export class InvitationsService {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    @Inject(SECURITY_LOGGER) private readonly logger: SecurityLoggerPort,
    @Inject(TenantContextService)
    private readonly tenantContexts: TenantContextService,
  ) {}

  async issueMembershipInvitation(
    principal: AuthenticatedPrincipal,
    handle: string | undefined,
    input: Readonly<{
      targetAddress: string;
      roles: readonly string[];
      centerIds: readonly string[];
      idempotencyKey: string;
      reissueInvitationId?: string;
    }>,
    correlationId: string,
  ) {
    if (input.roles.includes('tenant_owner')) {
      throw new BadRequestException(
        'Owner invitations require the ownership endpoint',
      );
    }
    const context = await this.tenantContexts.resolveAuthorizedContext(
      principal,
      handle,
      'membership.invite',
      correlationId,
    );
    const outcome = await issueIamMembershipInvitation(this.pool, principal, {
      ...input,
      tenantId: context.tenantId,
      correlationId,
    });
    return this.handleIssueOutcome(outcome, correlationId);
  }

  async issueOwnerInvitation(
    principal: AuthenticatedPrincipal,
    handle: string | undefined,
    input: Readonly<{
      targetAddress: string;
      centerIds: readonly string[];
      idempotencyKey: string;
      reissueInvitationId?: string;
    }>,
    correlationId: string,
  ) {
    const context = await this.tenantContexts.resolveAuthorizedContext(
      principal,
      handle,
      'membership.invite',
      correlationId,
    );
    const outcome = await issueIamInvitation(this.pool, principal, {
      ...input,
      roles: ['tenant_owner'],
      tenantId: context.tenantId,
      correlationId,
    });
    return this.handleIssueOutcome(outcome, correlationId);
  }

  private handleIssueOutcome(
    outcome: Awaited<ReturnType<typeof issueIamInvitation>>,
    correlationId: string,
  ) {
    if ('deniedReason' in outcome) {
      if (outcome.deniedReason === 'membership_missing_or_inactive') {
        this.logger.warn({
          event: 'iam_security_event',
          action: 'membership.invite',
          reason: outcome.deniedReason,
          correlationId,
        });
      }
      denied();
    }
    return outcome;
  }

  async respondToInvitation(
    principal: AuthenticatedPrincipal,
    tenantId: string,
    credential: string,
    decision: 'accepted' | 'rejected',
    correlationId: string,
  ) {
    const outcome = await respondToIamInvitation(this.pool, principal, {
      tenantId,
      credential,
      decision,
      correlationId,
    });
    if ('deniedReason' in outcome) {
      if (outcome.deniedReason === 'credential_invalid_or_expired') {
        this.logger.warn({
          event: 'iam_security_event',
          action: 'membership.invite',
          reason: outcome.deniedReason,
          correlationId,
        });
      }
      denied();
    }
    return outcome;
  }

  async revokeMembershipInvitation(
    principal: AuthenticatedPrincipal,
    handle: string | undefined,
    invitationId: string,
    correlationId: string,
  ) {
    const context = await this.tenantContexts.resolveAuthorizedContext(
      principal,
      handle,
      'membership.disable',
      correlationId,
    );
    return this.revokeInvitation(
      principal,
      context.tenantId,
      invitationId,
      correlationId,
      false,
    );
  }

  async revokeOwnerInvitation(
    principal: AuthenticatedPrincipal,
    handle: string | undefined,
    invitationId: string,
    correlationId: string,
  ) {
    const context = await this.tenantContexts.resolveAuthorizedContext(
      principal,
      handle,
      'membership.disable',
      correlationId,
    );
    return this.revokeInvitation(
      principal,
      context.tenantId,
      invitationId,
      correlationId,
      true,
    );
  }

  private async revokeInvitation(
    principal: AuthenticatedPrincipal,
    tenantId: string,
    invitationId: string,
    correlationId: string,
    allowOwnerInvitation: boolean,
  ) {
    const outcome = await revokeIamInvitation(this.pool, principal, {
      tenantId,
      invitationId,
      correlationId,
      allowOwnerInvitation,
    });
    if ('deniedReason' in outcome) {
      if (outcome.deniedReason === 'membership_missing_or_inactive') {
        this.logger.warn({
          event: 'iam_security_event',
          action: 'membership.disable',
          reason: outcome.deniedReason,
          correlationId,
        });
      }
      denied();
    }
    return outcome;
  }
}
