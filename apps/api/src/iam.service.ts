import type { IamDenialReason } from '@dive-center/contracts';
import {
  disableIamMembership,
  type IamAccessContext,
  IamAccessDeniedError,
  iamCenters,
  issueIamInvitation,
  resolveIamAccess,
  respondToIamInvitation,
  revokeIamInvitation,
  withIamAuthorizedTenant,
} from '@dive-center/database';
import {
  type AuthenticatedPrincipal,
  authorizeIamMembership,
} from '@dive-center/identity';
import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { Pool } from 'pg';
import {
  DATABASE_POOL,
  type IamAction,
  SECURITY_LOGGER,
  type SecurityLoggerPort,
} from './iam.tokens.js';

function denied(): never {
  throw new ForbiddenException('Access denied');
}

@Injectable()
export class IamService {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    @Inject(SECURITY_LOGGER) private readonly logger: SecurityLoggerPort,
  ) {}

  private securityDenied(
    action: IamAction,
    reason: IamDenialReason,
    correlationId: string,
  ): void {
    this.logger.warn({
      event: 'iam_security_event',
      action,
      reason,
      correlationId,
    });
  }

  async readCenter(
    principal: AuthenticatedPrincipal,
    tenantId: string,
    centerId: string,
    correlationId: string,
  ) {
    let context: IamAccessContext;
    try {
      context = await resolveIamAccess(this.pool, principal, tenantId);
    } catch (error) {
      if (!(error instanceof IamAccessDeniedError)) throw error;
      this.securityDenied('center.read', error.reason, correlationId);
      denied();
    }

    try {
      return await withIamAuthorizedTenant(
        this.pool,
        context,
        async ({ db }, current) => {
          const decision = authorizeIamMembership({
            membershipStatus: 'active',
            roles: current.roles,
            centerIds: current.centerIds,
            permission: 'center.read',
            requestedCenterId: centerId,
            tenantMatches: current.tenantId === tenantId,
            resourceExists: true,
            resourceStateAllows: true,
          });
          if (!decision.allowed) denied();

          const rows = await db
            .select({ id: iamCenters.id, name: iamCenters.name })
            .from(iamCenters)
            .where(
              and(
                eq(iamCenters.tenantId, tenantId),
                eq(iamCenters.id, centerId),
              ),
            )
            .limit(1);
          if (!rows[0]) denied();
          return rows[0];
        },
      );
    } catch (error) {
      if (!(error instanceof IamAccessDeniedError)) throw error;
      this.securityDenied('center.read', error.reason, correlationId);
      denied();
    }
  }

  async disableMembership(
    principal: AuthenticatedPrincipal,
    tenantId: string,
    membershipId: string,
    correlationId: string,
  ) {
    const outcome = await disableIamMembership(this.pool, principal, {
      tenantId,
      membershipId,
      correlationId,
    });
    if ('deniedReason' in outcome) {
      if (outcome.deniedReason === 'membership_missing_or_inactive') {
        this.securityDenied(
          'membership.disable',
          outcome.deniedReason,
          correlationId,
        );
      }
      if (outcome.deniedReason === 'last_owner') {
        throw new ForbiddenException('Operation not allowed');
      }
      denied();
    }
    return { status: outcome.status };
  }

  async issueInvitation(
    principal: AuthenticatedPrincipal,
    tenantId: string,
    input: Readonly<{
      targetAddress: string;
      roles: readonly string[];
      centerIds: readonly string[];
      idempotencyKey: string;
      reissueInvitationId?: string;
    }>,
    correlationId: string,
  ) {
    const outcome = await issueIamInvitation(this.pool, principal, {
      ...input,
      tenantId,
      correlationId,
    });
    if ('deniedReason' in outcome) {
      if (outcome.deniedReason === 'membership_missing_or_inactive') {
        this.securityDenied(
          'membership.invite',
          outcome.deniedReason,
          correlationId,
        );
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
        this.securityDenied(
          'membership.invite',
          outcome.deniedReason,
          correlationId,
        );
      }
      denied();
    }
    return outcome;
  }

  async revokeInvitation(
    principal: AuthenticatedPrincipal,
    tenantId: string,
    invitationId: string,
    correlationId: string,
  ) {
    const outcome = await revokeIamInvitation(this.pool, principal, {
      tenantId,
      invitationId,
      correlationId,
    });
    if ('deniedReason' in outcome) {
      if (outcome.deniedReason === 'membership_missing_or_inactive') {
        this.securityDenied(
          'membership.disable',
          outcome.deniedReason,
          correlationId,
        );
      }
      denied();
    }
    return outcome;
  }
}
