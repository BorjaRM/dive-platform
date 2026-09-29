import {
  type BootstrapInvitationResult,
  type BootstrapInvitationState,
  consumeBootstrapInvitationRateLimit,
  issueBootstrapInvitation,
  readBootstrapInvitation,
  reissueBootstrapInvitation,
  revokeBootstrapInvitation,
} from '@dive-center/database';
import type { AuthenticatedPrincipal } from '@dive-center/identity';
import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { DATABASE_POOL } from '../common/database/database.tokens.js';
import { ApiProblemException } from '../common/http/problem-details.js';
import type {
  BootstrapInvitationIssueInput,
  BootstrapInvitationMutationInput,
} from './bootstrap-invitations.dto.js';

export function bootstrapInvitationWritesEnabled(
  environment: NodeJS.ProcessEnv = process.env,
): boolean {
  return environment.BOOTSTRAP_INVITATION_WRITES_ENABLED === 'true';
}

@Injectable()
export class BootstrapInvitationsService {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async issue(
    principal: AuthenticatedPrincipal,
    input: BootstrapInvitationIssueInput,
    idempotencyKey: string | undefined,
    correlationId: string,
  ): Promise<BootstrapInvitationState> {
    await this.authorizeOperation(principal);
    this.assertWritesEnabled();
    return this.state(
      await issueBootstrapInvitation(this.pool, principal, {
        ...input,
        idempotencyKey: this.idempotencyKey(idempotencyKey),
        correlationId,
      }),
    );
  }

  async read(
    principal: AuthenticatedPrincipal,
    invitationId: string,
  ): Promise<BootstrapInvitationState> {
    await this.authorizeOperation(principal);
    return this.state(
      await readBootstrapInvitation(this.pool, principal, invitationId),
    );
  }

  async reissue(
    principal: AuthenticatedPrincipal,
    invitationId: string,
    input: BootstrapInvitationMutationInput,
    idempotencyKey: string | undefined,
    correlationId: string,
  ): Promise<BootstrapInvitationState> {
    await this.authorizeOperation(principal);
    this.assertWritesEnabled();
    return this.state(
      await reissueBootstrapInvitation(this.pool, principal, {
        invitationId,
        reason: input.reason,
        idempotencyKey: this.idempotencyKey(idempotencyKey),
        correlationId,
      }),
    );
  }

  async revoke(
    principal: AuthenticatedPrincipal,
    invitationId: string,
    input: BootstrapInvitationMutationInput,
    idempotencyKey: string | undefined,
    correlationId: string,
  ): Promise<BootstrapInvitationState> {
    await this.authorizeOperation(principal);
    this.assertWritesEnabled();
    return this.state(
      await revokeBootstrapInvitation(this.pool, principal, {
        invitationId,
        reason: input.reason,
        idempotencyKey: this.idempotencyKey(idempotencyKey),
        correlationId,
      }),
    );
  }

  private async authorizeOperation(
    principal: AuthenticatedPrincipal,
  ): Promise<void> {
    const retryAfterSeconds = await consumeBootstrapInvitationRateLimit(
      this.pool,
      principal,
    );
    if (retryAfterSeconds !== null) {
      throw new ApiProblemException(429, 'rate_limited', undefined, {
        'Retry-After': String(retryAfterSeconds),
      });
    }
  }

  private assertWritesEnabled(): void {
    if (!bootstrapInvitationWritesEnabled()) {
      throw new ApiProblemException(503, 'feature_unavailable');
    }
  }

  private idempotencyKey(value: string | undefined): string {
    if (!value || value.trim() === '') {
      throw new ApiProblemException(
        422,
        'validation_error',
        'Idempotency-Key must be a non-empty string',
      );
    }
    return value.trim();
  }

  private state(result: BootstrapInvitationResult): BootstrapInvitationState {
    if (!('deniedReason' in result)) return result;
    switch (result.deniedReason) {
      case 'idempotency_conflict':
        throw new ApiProblemException(409, 'idempotency_conflict');
      case 'permission_missing':
        throw new ApiProblemException(403, 'permission_denied');
      case 'rate_limited':
        throw new ApiProblemException(429, 'rate_limited');
      case 'resource_missing_or_inaccessible':
        throw new ApiProblemException(404, 'invitation_unavailable');
    }
  }
}
