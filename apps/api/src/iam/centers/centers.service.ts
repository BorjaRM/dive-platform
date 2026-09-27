import type { IamDenialReason } from '@dive-center/contracts';
import {
  IamAccessDeniedError,
  iamCenters,
  withIamAuthorizedTenant,
} from '@dive-center/database';
import {
  type AuthenticatedPrincipal,
  authorizeIamMembership,
} from '@dive-center/identity';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { Pool } from 'pg';
import { DATABASE_POOL } from '../../common/database/database.tokens.js';
import {
  SECURITY_LOGGER,
  type SecurityLoggerPort,
} from '../../common/security/security.tokens.js';
import { denied } from '../iam-denied.js';
import { TenantContextService } from '../tenant-context/tenant-context.service.js';

@Injectable()
export class CentersService {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    @Inject(SECURITY_LOGGER) private readonly logger: SecurityLoggerPort,
    @Inject(TenantContextService)
    private readonly tenantContexts: TenantContextService,
  ) {}

  private securityDenied(correlationId: string, reason: IamDenialReason): void {
    this.logger.warn({
      event: 'iam_security_event',
      action: 'center.read',
      reason,
      correlationId,
    });
  }

  async readCenters(
    principal: AuthenticatedPrincipal,
    handle: string | undefined,
    correlationId: string,
  ) {
    const context = await this.tenantContexts.resolveAuthorizedContext(
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
    const context = await this.tenantContexts.resolveAuthorizedContext(
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
              correlationId,
              'membership_missing_or_inactive',
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
              correlationId,
              'membership_missing_or_inactive',
            );
            denied();
          }
          return rows[0];
        },
      );
    } catch (error) {
      if (!(error instanceof IamAccessDeniedError)) throw error;
      this.securityDenied(correlationId, error.reason);
      denied();
    }
  }
}
