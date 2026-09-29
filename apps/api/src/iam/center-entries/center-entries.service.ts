import type { CenterEntryStatus } from '@dive-center/database';
import { setIamCenterEntryStatus } from '@dive-center/database';
import type { AuthenticatedPrincipal } from '@dive-center/identity';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { DATABASE_POOL } from '../../common/database/database.tokens.js';
import {
  IAM_ACTIONS,
  SECURITY_LOGGER,
  type SecurityLoggerPort,
} from '../../common/security/security.tokens.js';
import { denied } from '../iam-denied.js';
import { TenantContextService } from '../tenant-context/tenant-context.service.js';

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class CenterEntriesService {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    @Inject(SECURITY_LOGGER) private readonly logger: SecurityLoggerPort,
    @Inject(TenantContextService)
    private readonly tenantContexts: TenantContextService,
  ) {}

  async setStatus(
    principal: AuthenticatedPrincipal,
    handle: string | undefined,
    centerId: string,
    input: unknown,
    correlationId: string,
  ) {
    const request =
      typeof input === 'object' &&
      input !== null &&
      !Array.isArray(input) &&
      Object.keys(input).length === 2
        ? (input as { purpose?: unknown; status?: unknown })
        : null;
    const status =
      request?.status === 'active' || request?.status === 'disabled'
        ? request.status
        : null;
    const purpose =
      typeof request?.purpose === 'string' ? request.purpose.trim() : '';
    if (
      !uuidPattern.test(centerId) ||
      status === null ||
      purpose.length === 0
    ) {
      throw new BadRequestException('Invalid center entry lifecycle request');
    }

    const context = await this.tenantContexts.resolveAuthorizedContext(
      principal,
      handle,
      IAM_ACTIONS.centerEntryManage,
      correlationId,
    );
    const outcome = await setIamCenterEntryStatus(
      this.pool,
      principal,
      context,
      {
        centerId,
        status: status as CenterEntryStatus,
        purpose,
        correlationId,
      },
    );
    if ('deniedReason' in outcome) {
      this.logger.warn({
        event: 'iam_security_event',
        action: IAM_ACTIONS.centerEntryManage,
        reason: outcome.deniedReason,
        correlationId,
      });
      denied();
    }
    return { changed: outcome.changed, status: outcome.status };
  }
}
