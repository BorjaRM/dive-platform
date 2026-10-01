import {
  type IamAccessContext,
  IamAccessDeniedError,
  iamCenters,
  recordBookingCatalogMutation,
  type TenantUnitOfWork,
  withIamAuthorizedTenant,
} from '@dive-center/database';
import { authorizeIamMembership } from '@dive-center/identity';
import { correlationIdForCurrentContext } from '@dive-center/observability';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { Pool } from 'pg';
import type { ResolvedCenterApplicationScope } from '../common/auth/http-admission.js';
import { DATABASE_POOL } from '../common/database/database.tokens.js';
import { CatalogProblemException } from './catalog.errors.js';
import { validateCatalogTimeZone } from './catalog.time.js';
import { uuid } from './catalog.validation.js';

export type CatalogPermission =
  | 'center.read'
  | 'booking_service.create'
  | 'booking_service.read'
  | 'booking_service.update'
  | 'booking_service.publish'
  | 'availability.read'
  | 'availability.manage'
  | 'channel.manage';

type CatalogMutationInput = Readonly<{
  action: 'booking.create' | 'booking.update' | 'booking.activity.updated';
  eventType: string | null;
  resourceType: 'activity' | 'slot' | 'channel' | 'catalog_settings';
  resourceId: string;
  payload: Record<string, unknown>;
  idempotencyKey: string | null;
}>;

type CatalogAuthorizedScope = Readonly<{
  context: IamAccessContext;
  center: Readonly<{ id: string; timeZone: string | null }>;
  db: TenantUnitOfWork['db'];
  recordMutation(input: CatalogMutationInput): Promise<void>;
}>;

@Injectable()
export class CatalogAccessService {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  getDashboardCapabilities(applicationScope: ResolvedCenterApplicationScope) {
    return this.authorized(applicationScope, 'center.read', async (scope) => {
      const canPerform = (permission: CatalogPermission) =>
        authorizeIamMembership({
          membershipStatus: 'active',
          roles: scope.context.roles,
          centerIds: scope.context.centerIds,
          permission,
          requestedCenterId: scope.center.id,
          tenantMatches:
            scope.context.tenantId === applicationScope.access.tenantId,
          resourceExists: true,
          resourceStateAllows: true,
        }).allowed;

      return {
        canReadActivities: canPerform('booking_service.read'),
        canReadSessions: canPerform('availability.read'),
        canCreateActivity: canPerform('booking_service.create'),
        canScheduleSession: canPerform('availability.manage'),
      };
    });
  }

  assertRequestedCenterScope(
    scope: ResolvedCenterApplicationScope,
    requestedCenterId: string,
  ): void {
    const normalizedCenterId = uuid(requestedCenterId, 'centerId');
    if (scope.centerId !== normalizedCenterId) {
      throw new CatalogProblemException(404, 'resource_not_found');
    }
  }

  async authorized<T>(
    applicationScope: ResolvedCenterApplicationScope,
    permission: CatalogPermission,
    action: (scope: CatalogAuthorizedScope) => Promise<T>,
  ): Promise<T> {
    const context = applicationScope.access;
    const normalizedCenterId = uuid(applicationScope.centerId, 'centerId');
    try {
      return await withIamAuthorizedTenant(
        this.pool,
        context,
        async (unitOfWork, current) => {
          const center = await unitOfWork.db
            .select({ id: iamCenters.id, timeZone: iamCenters.timeZone })
            .from(iamCenters)
            .where(
              and(
                eq(iamCenters.tenantId, current.tenantId),
                eq(iamCenters.id, normalizedCenterId),
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
            requestedCenterId: normalizedCenterId,
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
          return action(
            Object.freeze({
              context: current,
              center: Object.freeze({
                id: center[0].id,
                timeZone: center[0].timeZone,
              }),
              db: unitOfWork.db,
              recordMutation: (input: CatalogMutationInput) =>
                this.recordMutation(unitOfWork, current, input),
            }),
          );
        },
      );
    } catch (error) {
      if (!(error instanceof IamAccessDeniedError)) throw error;
      throw new UnauthorizedException('Unauthenticated');
    }
  }

  private async recordMutation(
    unitOfWork: TenantUnitOfWork,
    context: IamAccessContext,
    input: CatalogMutationInput,
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
