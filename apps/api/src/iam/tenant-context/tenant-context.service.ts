import type { IamDenialReason } from '@dive-center/contracts';
import {
  type IamAccessContext,
  IamAccessDeniedError,
  type IamOperator,
  issueIamTenantContext,
  listIamOperators,
  resolveIamAccess,
  resolveIamTenantContext,
  revokeIamTenantContext,
} from '@dive-center/database';
import type { AuthenticatedPrincipal } from '@dive-center/identity';
import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { DATABASE_POOL } from '../../common/database/database.tokens.js';
import {
  IAM_ACTIONS,
  type IamAction,
  SECURITY_LOGGER,
  type SecurityLoggerPort,
} from '../../common/security/security.tokens.js';
import type { TenantContextCrypto } from '../../common/tenant-context/tenant-context.crypto.js';
import { TENANT_CONTEXT_CRYPTO } from '../../common/tenant-context/tenant-context.tokens.js';
import { denied } from '../iam-denied.js';

@Injectable()
export class TenantContextService {
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

  async resolveAuthorizedContext(
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
}
