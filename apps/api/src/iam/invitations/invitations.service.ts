import {
  issueIamInvitation,
  respondToIamInvitation,
  revokeIamInvitation,
} from '@dive-center/database';
import type { AuthenticatedPrincipal } from '@dive-center/identity';
import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { DATABASE_POOL } from '../../common/database/database.tokens.js';
import {
  SECURITY_LOGGER,
  type SecurityLoggerPort,
} from '../../common/security/security.tokens.js';
import { denied } from '../iam-denied.js';

@Injectable()
export class InvitationsService {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    @Inject(SECURITY_LOGGER) private readonly logger: SecurityLoggerPort,
  ) {}

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
        this.logger.warn({
          event: 'iam_security_event',
          action: 'membership.invite',
          reason: outcome.deniedReason,
          correlationId,
        });
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
        this.logger.warn({
          event: 'iam_security_event',
          action: 'membership.invite',
          reason: outcome.deniedReason,
          correlationId,
        });
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
        this.logger.warn({
          event: 'iam_security_event',
          action: 'membership.disable',
          reason: outcome.deniedReason,
          correlationId,
        });
      }
      denied();
    }
    return outcome;
  }
}
