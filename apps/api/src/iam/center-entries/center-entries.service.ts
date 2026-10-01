import type { CenterEntryStatus } from '@dive-center/database';
import { setIamCenterEntryStatus } from '@dive-center/database';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import type { ResolvedCenterApplicationScope } from '../../common/auth/http-admission.js';
import { DATABASE_POOL } from '../../common/database/database.tokens.js';
import {
  IAM_ACTIONS,
  SECURITY_LOGGER,
  type SecurityLoggerPort,
} from '../../common/security/security.tokens.js';
import { denied } from '../iam-denied.js';

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class CenterEntriesService {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    @Inject(SECURITY_LOGGER) private readonly logger: SecurityLoggerPort,
  ) {}

  async setStatus(
    scope: ResolvedCenterApplicationScope,
    requestedCenterId: string,
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
      !uuidPattern.test(requestedCenterId) ||
      status === null ||
      purpose.length === 0
    ) {
      throw new BadRequestException('Invalid center entry lifecycle request');
    }

    if (requestedCenterId.toLowerCase() !== scope.centerId) {
      this.logger.warn({
        event: 'iam_security_event',
        action: IAM_ACTIONS.centerEntryManage,
        reason: 'scope_mismatch',
        correlationId,
      });
      denied();
    }
    const outcome = await setIamCenterEntryStatus(this.pool, scope.access, {
      centerId: scope.centerId,
      status: status as CenterEntryStatus,
      purpose,
      correlationId,
    });
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
