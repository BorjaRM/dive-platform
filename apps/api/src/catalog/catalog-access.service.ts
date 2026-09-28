import {
  type IamAccessContext,
  IamAccessDeniedError,
  iamCenters,
  recordBookingCatalogMutation,
  resolveIamAccess,
  resolveIamTenantContext,
  type TenantUnitOfWork,
  withIamAuthorizedTenant,
} from '@dive-center/database';
import {
  type AuthenticatedPrincipal,
  authorizeIamMembership,
} from '@dive-center/identity';
import { correlationIdForCurrentContext } from '@dive-center/observability';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { Pool } from 'pg';
import { DATABASE_POOL } from '../common/database/database.tokens.js';
import type { TenantContextCrypto } from '../common/tenant-context/tenant-context.crypto.js';
import { TENANT_CONTEXT_CRYPTO } from '../common/tenant-context/tenant-context.tokens.js';
import { CatalogProblemException } from './catalog.errors.js';
import { validateCatalogTimeZone } from './catalog.time.js';
import { uuid } from './catalog.validation.js';

export type CatalogPermission =
  | 'booking_service.create'
  | 'booking_service.read'
  | 'booking_service.publish'
  | 'availability.read'
  | 'availability.manage'
  | 'channel.manage';

@Injectable()
export class CatalogAccessService {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    @Inject(TENANT_CONTEXT_CRYPTO)
    private readonly contextCrypto: TenantContextCrypto,
  ) {}

  private async context(
    principal: AuthenticatedPrincipal,
    handle: string | undefined,
  ): Promise<IamAccessContext> {
    if (!handle) throw new UnauthorizedException('Unauthenticated');
    const selected = await resolveIamTenantContext(this.pool, principal, {
      handleHash: this.contextCrypto.handleHash(handle),
      sessionIdHash: this.contextCrypto.sessionIdHash(principal.sessionId),
    });
    if (!selected) throw new UnauthorizedException('Unauthenticated');
    try {
      return await resolveIamAccess(this.pool, principal, selected.tenantId);
    } catch (error) {
      if (!(error instanceof IamAccessDeniedError)) throw error;
      throw new UnauthorizedException('Unauthenticated');
    }
  }

  async authorized<T>(
    principal: AuthenticatedPrincipal,
    handle: string | undefined,
    centerId: string,
    permission: CatalogPermission,
    action: (
      context: IamAccessContext,
      center: { timeZone: string | null },
      unitOfWork: TenantUnitOfWork,
    ) => Promise<T>,
  ): Promise<T> {
    uuid(centerId, 'centerId');
    const context = await this.context(principal, handle);
    return withIamAuthorizedTenant(
      this.pool,
      context,
      async (unitOfWork, current) => {
        const center = await unitOfWork.db
          .select({ id: iamCenters.id, timeZone: iamCenters.timeZone })
          .from(iamCenters)
          .where(
            and(
              eq(iamCenters.tenantId, context.tenantId),
              eq(iamCenters.id, centerId),
            ),
          )
          .limit(1);
        if (!center[0])
          throw new CatalogProblemException(404, 'resource_not_found');
        const decision = authorizeIamMembership({
          membershipStatus: 'active',
          roles: current.roles,
          centerIds: current.centerIds,
          permission,
          requestedCenterId: centerId,
          tenantMatches: current.tenantId === context.tenantId,
          resourceExists: true,
          resourceStateAllows: true,
        });
        if (!decision.allowed) {
          if (decision.reason === 'scope_mismatch') {
            throw new CatalogProblemException(404, 'resource_not_found');
          }
          if (decision.reason === 'permission_missing') {
            throw new CatalogProblemException(403, 'permission_denied');
          }
          throw new CatalogProblemException(404, 'resource_not_found');
        }
        return action(context, center[0], unitOfWork);
      },
    );
  }

  async recordMutation(
    unitOfWork: TenantUnitOfWork,
    context: IamAccessContext,
    input: Readonly<{
      action: 'booking.create' | 'booking.update';
      eventType: string;
      resourceType: 'activity' | 'slot' | 'channel';
      resourceId: string;
      payload: Record<string, unknown>;
      idempotencyKey: string;
    }>,
  ): Promise<void> {
    await recordBookingCatalogMutation(unitOfWork.client, {
      ...input,
      tenantId: context.tenantId,
      actorIdentityId: context.identityId,
      correlationId: correlationIdForCurrentContext(),
    });
  }

  centerTimeZone(timeZone: string | null): string {
    if (!timeZone)
      throw new CatalogProblemException(422, 'center_timezone_missing');
    try {
      return validateCatalogTimeZone(timeZone);
    } catch {
      throw new CatalogProblemException(422, 'center_timezone_invalid');
    }
  }
}
