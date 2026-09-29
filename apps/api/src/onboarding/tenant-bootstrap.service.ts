import {
  completeOwnTenantBootstrap,
  type TenantBootstrapCompletion,
} from '@dive-center/database';
import type { AuthenticatedPrincipal } from '@dive-center/identity';
import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { DATABASE_POOL } from '../common/database/database.tokens.js';
import { ApiProblemException } from '../common/http/problem-details.js';
import { bootstrapInvitationWritesEnabled } from './bootstrap-invitations.service.js';
import type { TenantBootstrapInput } from './tenant-bootstrap.dto.js';

@Injectable()
export class TenantBootstrapService {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async complete(
    principal: AuthenticatedPrincipal,
    input: TenantBootstrapInput,
    correlationId: string,
  ): Promise<TenantBootstrapCompletion> {
    if (!bootstrapInvitationWritesEnabled()) {
      throw new ApiProblemException(503, 'feature_unavailable');
    }
    const result = await completeOwnTenantBootstrap(this.pool, principal, {
      ...input,
      correlationId,
    });
    if (!('deniedReason' in result)) return result;
    switch (result.deniedReason) {
      case 'bootstrap_unavailable':
        throw new ApiProblemException(403, 'bootstrap_unavailable');
      case 'idempotency_conflict':
        throw new ApiProblemException(409, 'idempotency_conflict');
      case 'rate_limited':
        throw new ApiProblemException(429, 'rate_limited', undefined, {
          'Retry-After': String(result.retryAfterSeconds ?? 60),
        });
      case 'validation_error':
        throw new ApiProblemException(422, 'validation_error');
    }
  }
}
