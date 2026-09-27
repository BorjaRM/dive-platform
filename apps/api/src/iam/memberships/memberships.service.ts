import { disableIamMembership } from '@dive-center/database';
import type { AuthenticatedPrincipal } from '@dive-center/identity';
import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { DATABASE_POOL } from '../../common/database/database.tokens.js';
import {
  SECURITY_LOGGER,
  type SecurityLoggerPort,
} from '../../common/security/security.tokens.js';
import { denied } from '../iam-denied.js';
import { TenantContextService } from '../tenant-context/tenant-context.service.js';

@Injectable()
export class MembershipsService {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    @Inject(SECURITY_LOGGER) private readonly logger: SecurityLoggerPort,
    @Inject(TenantContextService)
    private readonly tenantContexts: TenantContextService,
  ) {}

  async disableMembership(
    principal: AuthenticatedPrincipal,
    handle: string | undefined,
    membershipId: string,
    correlationId: string,
  ) {
    const context = await this.tenantContexts.resolveAuthorizedContext(
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
        this.logger.warn({
          event: 'iam_security_event',
          action: 'membership.disable',
          reason: outcome.deniedReason,
          correlationId,
        });
      }
      if (outcome.deniedReason === 'last_owner') {
        throw new ForbiddenException('Operation not allowed');
      }
      denied();
    }
    return { status: outcome.status };
  }
}
