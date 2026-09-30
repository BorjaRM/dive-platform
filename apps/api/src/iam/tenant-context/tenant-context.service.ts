import type { IamDenialReason } from '@dive-center/contracts';
import {
  type IamAccessContext,
  IamAccessDeniedError,
  type IamOperator,
  issueIamTenantContext,
  listIamOperators,
  resolveIamAccess,
  resolveIamCenterEntry,
  resolveIamTenantContext,
  revokeIamTenantContext,
  rollbackAndReleaseClient,
} from '@dive-center/database';
import {
  type AuthenticatedPrincipal,
  authorizeIamMembership,
} from '@dive-center/identity';
import { Inject, Injectable, Optional } from '@nestjs/common';
import type { Pool } from 'pg';
import { DATABASE_POOL } from '../../common/database/database.tokens.js';
import {
  IAM_ACTIONS,
  type IamAction,
  SECURITY_LOGGER,
  type SecurityLoggerPort,
} from '../../common/security/security.tokens.js';
import {
  centerKeyFromOrigin,
  type TenantContextCrypto,
} from '../../common/tenant-context/tenant-context.crypto.js';
import {
  CENTER_APP_BASE_DOMAIN,
  CENTER_APP_BASE_ORIGIN,
  TENANT_CONTEXT_CRYPTO,
} from '../../common/tenant-context/tenant-context.tokens.js';
import { denied } from '../iam-denied.js';

@Injectable()
export class TenantContextService {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    @Inject(SECURITY_LOGGER) private readonly logger: SecurityLoggerPort,
    @Inject(TENANT_CONTEXT_CRYPTO)
    private readonly contextCrypto: TenantContextCrypto,
    @Inject(CENTER_APP_BASE_DOMAIN)
    private readonly centerAppBaseDomain: string,
    @Optional()
    @Inject(CENTER_APP_BASE_ORIGIN)
    private readonly centerAppBaseOrigin?: string,
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

  async resolveCenterOrigin(origin: string) {
    const centerKey = centerKeyFromOrigin(
      origin,
      this.centerAppBaseDomain,
      this.centerAppBaseOrigin,
    );
    if (!centerKey) return null;
    return resolveIamCenterEntry(this.pool, centerKey);
  }

  async isCenterOriginAllowed(origin: string): Promise<boolean> {
    return (await this.resolveCenterOrigin(origin)) !== null;
  }

  async issueCenterEntryContext(
    principal: AuthenticatedPrincipal,
    origin: string | undefined,
    input: unknown,
    correlationId: string,
  ) {
    const centerRef =
      typeof input === 'object' &&
      input !== null &&
      !Array.isArray(input) &&
      Object.keys(input).length === 1 &&
      typeof (input as { centerRef?: unknown }).centerRef === 'string'
        ? (input as { centerRef: string }).centerRef
        : null;
    const centerKey = centerKeyFromOrigin(
      origin,
      this.centerAppBaseDomain,
      this.centerAppBaseOrigin,
    );
    if (!centerKey || centerRef !== centerKey) {
      this.securityDenied(
        IAM_ACTIONS.tenantContextIssue,
        'membership_missing_or_inactive',
        correlationId,
      );
      denied();
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const entry = await resolveIamCenterEntry(client, centerKey);
      if (!entry) {
        this.securityDenied(
          IAM_ACTIONS.tenantContextIssue,
          'membership_missing_or_inactive',
          correlationId,
        );
        denied();
      }

      let access: IamAccessContext;
      try {
        access = await resolveIamAccess(client, principal, entry.tenantId);
      } catch (error) {
        if (!(error instanceof IamAccessDeniedError)) throw error;
        this.securityDenied(
          IAM_ACTIONS.tenantContextIssue,
          error.reason,
          correlationId,
        );
        denied();
      }
      const decision = authorizeIamMembership({
        membershipStatus: 'active',
        roles: access.roles,
        centerIds: access.centerIds,
        permission: 'center.read',
        requestedCenterId: entry.centerId,
        tenantMatches: access.tenantId === entry.tenantId,
        resourceExists: true,
        resourceStateAllows: true,
      });
      if (!decision.allowed) {
        this.securityDenied(
          IAM_ACTIONS.tenantContextIssue,
          decision.reason,
          correlationId,
        );
        denied();
      }

      const handle = this.contextCrypto.createHandle();
      const outcome = await issueIamTenantContext(client, principal, {
        tenantId: access.tenantId,
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

      await client.query('COMMIT');
      client.release();
      return {
        tenantContext: handle,
        center: { centerId: entry.centerId },
      };
    } catch (error) {
      await rollbackAndReleaseClient(client);
      throw error;
    }
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
