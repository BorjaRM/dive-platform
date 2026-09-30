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
import { IamService } from '../iam/iam.facade.js';
import { CatalogProblemException } from './catalog.errors.js';
import { validateCatalogTimeZone } from './catalog.time.js';
import { uuid } from './catalog.validation.js';

export const CATALOG_DASHBOARD_ORIGINS = Symbol('CATALOG_DASHBOARD_ORIGINS');

export type CatalogPermission =
  | 'booking_service.create'
  | 'booking_service.read'
  | 'booking_service.update'
  | 'booking_service.publish'
  | 'availability.read'
  | 'availability.manage'
  | 'channel.manage';

type CatalogMutationInput = Readonly<{
  action: 'booking.create' | 'booking.update';
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
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    @Inject(TENANT_CONTEXT_CRYPTO)
    private readonly contextCrypto: TenantContextCrypto,
    @Inject(IamService) private readonly iam: IamService,
    @Inject(CATALOG_DASHBOARD_ORIGINS)
    private readonly dashboardOrigins: readonly string[],
  ) {}

  async assertCenterOriginScope(
    principal: AuthenticatedPrincipal,
    handle: string | undefined,
    requestedCenterId: string,
    origin: string | undefined,
  ): Promise<void> {
    if (origin === undefined || this.dashboardOrigins.includes(origin)) return;
    const normalizedCenterId = uuid(requestedCenterId, 'centerId');
    const context = await this.context(principal, handle);
    const entry = await this.iam.resolveCenterOrigin(origin);
    if (
      !entry ||
      entry.tenantId !== context.tenantId ||
      entry.centerId !== normalizedCenterId
    ) {
      throw new CatalogProblemException(404, 'resource_not_found');
    }
  }

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
    requestedCenterId: string,
    permission: CatalogPermission,
    action: (scope: CatalogAuthorizedScope) => Promise<T>,
  ): Promise<T> {
    const normalizedCenterId = uuid(requestedCenterId, 'centerId');
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
