import {
  completeOwnTenantBootstrap,
  type TenantBootstrapCompletion,
} from '@dive-center/database';
import {
  type AuthenticatedPrincipal,
  IdentityProviderUnavailableError,
  InvalidIdentityCredentialsError,
  resolveVerifiedIdentity,
  VERIFIED_ADDRESS_PROVIDER,
  type VerifiedAddressProviderPort,
} from '@dive-center/identity';
import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { DATABASE_POOL } from '../common/database/database.tokens.js';
import { ApiProblemException } from '../common/http/problem-details.js';
import { bootstrapInvitationWritesEnabled } from './bootstrap-invitations.service.js';
import type { TenantBootstrapInput } from './tenant-bootstrap.dto.js';

@Injectable()
export class TenantBootstrapService {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    @Inject(VERIFIED_ADDRESS_PROVIDER)
    private readonly identities: VerifiedAddressProviderPort,
  ) {}

  async complete(
    principal: AuthenticatedPrincipal,
    input: TenantBootstrapInput,
    correlationId: string,
  ): Promise<TenantBootstrapCompletion> {
    if (!bootstrapInvitationWritesEnabled()) {
      throw new ApiProblemException(503, 'feature_unavailable');
    }
    let verifiedPrincipal: AuthenticatedPrincipal;
    try {
      verifiedPrincipal = await resolveVerifiedIdentity(
        this.identities,
        principal,
      );
    } catch (error) {
      if (error instanceof IdentityProviderUnavailableError) {
        throw new ApiProblemException(503, 'bootstrap_unavailable');
      }
      if (error instanceof InvalidIdentityCredentialsError) {
        throw new ApiProblemException(403, 'bootstrap_unavailable');
      }
      throw error;
    }
    if (verifiedPrincipal.verifiedAddresses.length === 0) {
      throw new ApiProblemException(403, 'bootstrap_unavailable');
    }
    const result = await completeOwnTenantBootstrap(
      this.pool,
      verifiedPrincipal,
      {
        ...input,
        correlationId,
      },
    );
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
