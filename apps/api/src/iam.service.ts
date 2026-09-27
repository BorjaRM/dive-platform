import type { IamDenialReason } from '@dive-center/contracts';
import {
  disableIamMembership,
  type IamAccessContext,
  IamAccessDeniedError,
  type IamOperator,
  iamCenters,
  issueIamInvitation,
  issueIamTenantContext,
  listIamOperators,
  resolveIamAccess,
  resolveIamTenantContext,
  respondToIamInvitation,
  revokeIamInvitation,
  revokeIamTenantContext,
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
  IAM_ACTIONS,
  type IamAction,
  SECURITY_LOGGER,
  type SecurityLoggerPort,
  TENANT_CONTEXT_CRYPTO,
} from './iam.tokens.js';
import type { TenantContextCrypto } from './tenant-context.crypto.js';

function denied(): never {
  throw new ForbiddenException('Access denied');
}

@Injectable()
export class IamService {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    @Inject(SECURITY_LOGGER) private readonly logger: SecurityLoggerPort,
    @Inject(TENANT_CONTEXT_CRYPTO)
    private readonly contextCrypto: TenantContextCrypto,
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

  async listOperators(principal: AuthenticatedPrincipal) {
    const operators = await listIamOperators(this.pool, principal);
    return {
      operators: operators.map((operator) => ({
        operatorRef: this.contextCrypto.operatorRef(
          operator.identityId,
          operator.tenantId,
        ),
        displayName: operator.displayName,
      })),
    };
  }

  async issueTenantContext(
    principal: AuthenticatedPrincipal,
    operatorRef: string | undefined,
    correlationId: string,
  ) {
    const operators = await listIamOperators(this.pool, principal);
    let selected: IamOperator | undefined;
    if (operatorRef === undefined) {
      selected = operators.length === 1 ? operators[0] : undefined;
    } else if (typeof operatorRef === 'string') {
      selected = operators.find(
        (operator) =>
          this.contextCrypto.operatorRef(
            operator.identityId,
            operator.tenantId,
          ) === operatorRef,
      );
    }
    if (!selected) {
      this.securityDenied(
        IAM_ACTIONS.tenantContextIssue,
        'membership_missing_or_inactive',
        correlationId,
      );
      denied();
    }

    const handle = this.contextCrypto.createHandle();
    const outcome = await issueIamTenantContext(this.pool, principal, {
      tenantId: selected.tenantId,
      handleHash: this.contextCrypto.handleHash(handle),
      sessionIdHash: this.contextCrypto.sessionIdHash(principal.sessionId),
    });
    if ('deniedReason' in outcome) {
      this.securityDenied(
        IAM_ACTIONS.tenantContextIssue,
        outcome.deniedReason,
        correlationId,
      );
      denied();
    }
    return { tenantContext: handle };
  }

  async revokeTenantContext(
    principal: AuthenticatedPrincipal,
    handle: string | undefined,
    correlationId: string,
  ): Promise<void> {
    if (!handle) {
      this.securityDenied(
        IAM_ACTIONS.tenantContextRevoke,
        'membership_missing_or_inactive',
        correlationId,
      );
      denied();
    }
    const outcome = await revokeIamTenantContext(this.pool, principal, {
      handleHash: this.contextCrypto.handleHash(handle),
      sessionIdHash: this.contextCrypto.sessionIdHash(principal.sessionId),
    });
    if ('deniedReason' in outcome) {
      this.securityDenied(
        IAM_ACTIONS.tenantContextRevoke,
        outcome.deniedReason,
        correlationId,
      );
      denied();
    }
  }

  private async resolveAuthorizedContext(
    principal: AuthenticatedPrincipal,
    handle: string | undefined,
    action: IamAction,
    correlationId: string,
  ): Promise<IamAccessContext> {
    if (!handle) {
      this.securityDenied(
        action,
        'membership_missing_or_inactive',
        correlationId,
      );
      denied();
    }
    const selected = await resolveIamTenantContext(this.pool, principal, {
      handleHash: this.contextCrypto.handleHash(handle),
      sessionIdHash: this.contextCrypto.sessionIdHash(principal.sessionId),
    });
    if (!selected) {
      this.securityDenied(
        action,
        'membership_missing_or_inactive',
        correlationId,
      );
      denied();
    }
    try {
      return await resolveIamAccess(this.pool, principal, selected.tenantId);
    } catch (error) {
      if (!(error instanceof IamAccessDeniedError)) throw error;
      this.securityDenied(action, error.reason, correlationId);
      denied();
    }
  }

  async readCenters(
    principal: AuthenticatedPrincipal,
    handle: string | undefined,
    correlationId: string,
  ) {
    const context = await this.resolveAuthorizedContext(
      principal,
      handle,
      'center.read',
      correlationId,
    );
    return withIamAuthorizedTenant(
      this.pool,
      context,
      async ({ db }, current) => {
        const rows = await db
          .select({ id: iamCenters.id, name: iamCenters.name })
          .from(iamCenters)
          .where(eq(iamCenters.tenantId, context.tenantId));
        return rows.filter(
          (center) =>
            authorizeIamMembership({
              membershipStatus: 'active',
              roles: current.roles,
              centerIds: current.centerIds,
              permission: 'center.read',
              requestedCenterId: center.id,
              tenantMatches: true,
              resourceExists: true,
              resourceStateAllows: true,
            }).allowed,
        );
      },
    );
  }

  async readCenter(
    principal: AuthenticatedPrincipal,
    handle: string | undefined,
    centerId: string,
    correlationId: string,
  ) {
    const context = await this.resolveAuthorizedContext(
      principal,
      handle,
      'center.read',
      correlationId,
    );

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
            tenantMatches: current.tenantId === context.tenantId,
            resourceExists: true,
            resourceStateAllows: true,
          });
          if (!decision.allowed) {
            this.securityDenied(
              'center.read',
              'membership_missing_or_inactive',
              correlationId,
            );
            denied();
          }

          const rows = await db
            .select({ id: iamCenters.id, name: iamCenters.name })
            .from(iamCenters)
            .where(
              and(
                eq(iamCenters.tenantId, context.tenantId),
                eq(iamCenters.id, centerId),
              ),
            )
            .limit(1);
          if (!rows[0]) {
            this.securityDenied(
              'center.read',
              'membership_missing_or_inactive',
              correlationId,
            );
            denied();
          }
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
    handle: string | undefined,
    membershipId: string,
    correlationId: string,
  ) {
    const context = await this.resolveAuthorizedContext(
      principal,
      handle,
      'membership.disable',
      correlationId,
    );
    const outcome = await disableIamMembership(this.pool, principal, {
      tenantId: context.tenantId,
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
