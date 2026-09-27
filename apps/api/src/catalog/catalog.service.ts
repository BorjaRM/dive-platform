import { randomUUID } from 'node:crypto';
import {
  bookingActivities,
  bookingSlots,
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
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { InferSelectModel } from 'drizzle-orm';
import { and, asc, desc, eq, gte, lt } from 'drizzle-orm';
import type { Pool } from 'pg';
import type { TenantContextCrypto } from '../common/tenant-context.crypto.js';
import { DATABASE_POOL, TENANT_CONTEXT_CRYPTO } from '../common/tokens.js';
import type {
  CatalogActivityInput,
  CatalogListQueryInput,
  CatalogSlotInput,
} from './catalog.dto.js';
import { CatalogProblemException } from './catalog.errors.js';
import {
  formatCatalogInstant,
  parseCatalogInstant,
  validateCatalogTimeZone,
} from './catalog.time.js';
import {
  localized,
  pagination,
  positiveInteger,
  rejectUnknownFields,
  statusFilter,
  uuid,
} from './catalog.validation.js';

const CATALOG_EVENT_TYPES = {
  activityCreated: 'booking.activity.created.v1',
  activityStatusChanged: 'booking.activity.status_changed.v1',
  slotCreated: 'booking.slot.created.v1',
  slotStatusChanged: 'booking.slot.status_changed.v1',
} as const;

type CatalogPermission =
  | 'booking_service.create'
  | 'booking_service.read'
  | 'booking_service.publish'
  | 'availability.read'
  | 'availability.manage';

type ActivityRow = InferSelectModel<typeof bookingActivities>;
type SlotRow = InferSelectModel<typeof bookingSlots>;

@Injectable()
export class CatalogService {
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

  private async authorized<T>(
    principal: AuthenticatedPrincipal,
    handle: string | undefined,
    centerId: string,
    permission: CatalogPermission,
    fn: (
      context: IamAccessContext,
      center: { timeZone: string | null },
      uow: TenantUnitOfWork,
    ) => Promise<T>,
  ): Promise<T> {
    uuid(centerId, 'centerId');
    const context = await this.context(principal, handle);
    return withIamAuthorizedTenant(this.pool, context, async (uow, current) => {
      const center = await uow.db
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
      return fn(context, center[0], uow);
    });
  }

  private async recordMutation(
    uow: TenantUnitOfWork,
    context: IamAccessContext,
    input: Readonly<{
      action: 'booking.create' | 'booking.update';
      eventType: string;
      resourceType: 'activity' | 'slot';
      resourceId: string;
      payload: Record<string, unknown>;
      idempotencyKey: string;
    }>,
  ): Promise<void> {
    const correlationId = randomUUID();
    await recordBookingCatalogMutation(uow.client, {
      ...input,
      tenantId: context.tenantId,
      actorIdentityId: context.identityId,
      correlationId,
    });
  }

  private centerTimeZone(timeZone: string | null): string {
    if (!timeZone)
      throw new CatalogProblemException(422, 'center_timezone_missing');
    try {
      return validateCatalogTimeZone(timeZone);
    } catch {
      throw new CatalogProblemException(422, 'center_timezone_invalid');
    }
  }

  private activityDto(row: ActivityRow) {
    return {
      id: row.id,
      status: row.status,
      name: row.name,
      ...(row.description ? { description: row.description } : {}),
      ...(row.defaultCapacity === null
        ? {}
        : { defaultCapacity: row.defaultCapacity }),
      createdAt: row.createdAt.toISOString(),
    };
  }

  private slotDto(row: SlotRow, timeZone: string) {
    return {
      id: row.id,
      activityId: row.activityId,
      status: row.status,
      startsAt: formatCatalogInstant(row.startsAt, timeZone),
      durationMinutes: row.durationMinutes,
      capacity: row.capacity,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async listActivities(
    principal: AuthenticatedPrincipal,
    handle: string | undefined,
    centerId: string,
    query: CatalogListQueryInput,
  ) {
    return this.authorized(
      principal,
      handle,
      centerId,
      'booking_service.read',
      async (context, _center, uow) => {
        const db = uow.db;
        const { page, pageSize, offset } = pagination(query);
        const status = statusFilter(query.status, [
          'Draft',
          'Published',
          'Disabled',
        ]);
        const rows = await db
          .select()
          .from(bookingActivities)
          .where(
            and(
              eq(bookingActivities.tenantId, context.tenantId),
              eq(bookingActivities.centerId, centerId),
              status ? eq(bookingActivities.status, status) : undefined,
            ),
          )
          .orderBy(
            desc(bookingActivities.createdAt),
            desc(bookingActivities.id),
          )
          .limit(pageSize + 1)
          .offset(offset);
        return {
          items: rows
            .slice(0, pageSize)
            .map((row: ActivityRow) => this.activityDto(row)),
          page,
          pageSize,
          hasNext: rows.length > pageSize,
        };
      },
    );
  }

  async createActivity(
    principal: AuthenticatedPrincipal,
    handle: string | undefined,
    centerId: string,
    input: CatalogActivityInput,
  ) {
    return this.authorized(
      principal,
      handle,
      centerId,
      'booking_service.create',
      async (context, _center, uow) => {
        const db = uow.db;
        rejectUnknownFields(input, ['name', 'description', 'defaultCapacity']);
        const name = localized(input?.name, 'name', true);
        const description = localized(input?.description, 'description', false);
        const defaultCapacity =
          input?.defaultCapacity === undefined
            ? undefined
            : positiveInteger(input.defaultCapacity, 'defaultCapacity');
        const [row] = await db
          .insert(bookingActivities)
          .values({
            id: randomUUID(),
            tenantId: context.tenantId,
            centerId,
            name,
            description,
            defaultCapacity,
            status: 'Draft',
          })
          .returning();
        if (!row) throw new Error('Activity insert returned no row');
        await this.recordMutation(uow, context, {
          action: 'booking.create',
          eventType: CATALOG_EVENT_TYPES.activityCreated,
          resourceType: 'activity',
          resourceId: row.id,
          payload: { activityId: row.id, centerId },
          idempotencyKey: `booking.activity.created:${row.id}`,
        });
        return this.activityDto(row);
      },
    );
  }

  async setActivityStatus(
    principal: AuthenticatedPrincipal,
    handle: string | undefined,
    centerId: string,
    activityId: string,
    target: 'Published' | 'Disabled',
  ) {
    return this.authorized(
      principal,
      handle,
      centerId,
      'booking_service.publish',
      async (context, _center, uow) => {
        const db = uow.db;
        uuid(activityId, 'activityId');
        const [activity] = await db
          .select()
          .from(bookingActivities)
          .where(
            and(
              eq(bookingActivities.tenantId, context.tenantId),
              eq(bookingActivities.centerId, centerId),
              eq(bookingActivities.id, activityId),
            ),
          )
          .limit(1)
          .for('update');
        if (!activity)
          throw new CatalogProblemException(404, 'resource_not_found');
        if (activity.status === target) return;
        if (target === 'Published') {
          const name = localized(activity.name, 'name', true);
          if (!name?.es || !name.en) {
            throw new CatalogProblemException(
              422,
              'validation_error',
              'name must contain both es and en before publishing',
            );
          }
        }
        if (target === 'Published' && activity.status !== 'Draft')
          throw new CatalogProblemException(409, 'resource_state_conflict');
        if (target === 'Disabled' && activity.status !== 'Published')
          throw new CatalogProblemException(409, 'resource_state_conflict');
        await db
          .update(bookingActivities)
          .set({ status: target })
          .where(
            and(
              eq(bookingActivities.tenantId, context.tenantId),
              eq(bookingActivities.centerId, centerId),
              eq(bookingActivities.id, activityId),
            ),
          );
        await this.recordMutation(uow, context, {
          action: 'booking.update',
          eventType: CATALOG_EVENT_TYPES.activityStatusChanged,
          resourceType: 'activity',
          resourceId: activityId,
          payload: { activityId, centerId, status: target },
          idempotencyKey: `booking.activity.status:${activityId}:${target}`,
        });
      },
    );
  }

  async listSlots(
    principal: AuthenticatedPrincipal,
    handle: string | undefined,
    centerId: string,
    activityId: string,
    query: CatalogListQueryInput,
  ) {
    return this.authorized(
      principal,
      handle,
      centerId,
      'availability.read',
      async (context, center, uow) => {
        const db = uow.db;
        uuid(activityId, 'activityId');
        const activity = await db
          .select({ id: bookingActivities.id })
          .from(bookingActivities)
          .where(
            and(
              eq(bookingActivities.tenantId, context.tenantId),
              eq(bookingActivities.centerId, centerId),
              eq(bookingActivities.id, activityId),
            ),
          )
          .limit(1);
        if (!activity[0])
          throw new CatalogProblemException(404, 'resource_not_found');
        const timeZone = this.centerTimeZone(center.timeZone);
        const { page, pageSize, offset } = pagination(query);
        const status = statusFilter(query.status, [
          'Available',
          'Full',
          'Closed',
          'Cancelled',
        ]);
        let from: ReturnType<typeof parseCatalogInstant> | undefined;
        let to: ReturnType<typeof parseCatalogInstant> | undefined;
        try {
          from =
            query.from === undefined
              ? undefined
              : parseCatalogInstant(query.from, 'from');
          to =
            query.to === undefined
              ? undefined
              : parseCatalogInstant(query.to, 'to');
        } catch (error) {
          throw new CatalogProblemException(
            422,
            'validation_error',
            (error as Error).message,
          );
        }
        if (from && to && from.epochNanoseconds >= to.epochNanoseconds)
          throw new CatalogProblemException(
            422,
            'validation_error',
            'from must be before to',
          );
        const rows = await db
          .select()
          .from(bookingSlots)
          .where(
            and(
              eq(bookingSlots.tenantId, context.tenantId),
              eq(bookingSlots.centerId, centerId),
              eq(bookingSlots.activityId, activityId),
              status ? eq(bookingSlots.status, status) : undefined,
              from
                ? gte(
                    bookingSlots.startsAt,
                    new Date(Number(from.epochMilliseconds)),
                  )
                : undefined,
              to
                ? lt(
                    bookingSlots.startsAt,
                    new Date(Number(to.epochMilliseconds)),
                  )
                : undefined,
            ),
          )
          .orderBy(asc(bookingSlots.startsAt), asc(bookingSlots.id))
          .limit(pageSize + 1)
          .offset(offset);
        return {
          items: rows
            .slice(0, pageSize)
            .map((row: SlotRow) => this.slotDto(row, timeZone)),
          page,
          pageSize,
          hasNext: rows.length > pageSize,
        };
      },
    );
  }

  async createSlot(
    principal: AuthenticatedPrincipal,
    handle: string | undefined,
    centerId: string,
    activityId: string,
    input: CatalogSlotInput,
  ) {
    return this.authorized(
      principal,
      handle,
      centerId,
      'availability.manage',
      async (context, center, uow) => {
        const db = uow.db;
        rejectUnknownFields(input, ['startsAt', 'durationMinutes', 'capacity']);
        uuid(activityId, 'activityId');
        const activity = await db
          .select({ status: bookingActivities.status })
          .from(bookingActivities)
          .where(
            and(
              eq(bookingActivities.tenantId, context.tenantId),
              eq(bookingActivities.centerId, centerId),
              eq(bookingActivities.id, activityId),
            ),
          )
          .limit(1)
          .for('update');
        if (!activity[0])
          throw new CatalogProblemException(404, 'resource_not_found');
        if (activity[0].status !== 'Published')
          throw new CatalogProblemException(409, 'resource_state_conflict');
        let startsAt: ReturnType<typeof parseCatalogInstant>;
        try {
          startsAt = parseCatalogInstant(input?.startsAt, 'startsAt');
        } catch (error) {
          throw new CatalogProblemException(
            422,
            'validation_error',
            (error as Error).message,
          );
        }
        const durationMinutes = positiveInteger(
          input?.durationMinutes,
          'durationMinutes',
        );
        const capacity = positiveInteger(input?.capacity, 'capacity');
        const [row] = await db
          .insert(bookingSlots)
          .values({
            id: randomUUID(),
            tenantId: context.tenantId,
            centerId,
            activityId,
            startsAt: new Date(Number(startsAt.epochMilliseconds)),
            durationMinutes,
            capacity,
            status: 'Available',
          })
          .returning();
        if (!row) throw new Error('Slot insert returned no row');
        await this.recordMutation(uow, context, {
          action: 'booking.create',
          eventType: CATALOG_EVENT_TYPES.slotCreated,
          resourceType: 'slot',
          resourceId: row.id,
          payload: { slotId: row.id, activityId, centerId },
          idempotencyKey: `booking.slot.created:${row.id}`,
        });
        return this.slotDto(row, this.centerTimeZone(center.timeZone));
      },
    );
  }

  async setSlotStatus(
    principal: AuthenticatedPrincipal,
    handle: string | undefined,
    centerId: string,
    slotId: string,
    target: 'Closed' | 'Cancelled',
  ) {
    return this.authorized(
      principal,
      handle,
      centerId,
      'availability.manage',
      async (context, _center, uow) => {
        const db = uow.db;
        uuid(slotId, 'slotId');
        const [slot] = await db
          .select()
          .from(bookingSlots)
          .where(
            and(
              eq(bookingSlots.tenantId, context.tenantId),
              eq(bookingSlots.centerId, centerId),
              eq(bookingSlots.id, slotId),
            ),
          )
          .limit(1)
          .for('update');
        if (!slot) throw new CatalogProblemException(404, 'resource_not_found');
        if (slot.status === target) return;
        if (target === 'Closed' && !['Available', 'Full'].includes(slot.status))
          throw new CatalogProblemException(409, 'resource_state_conflict');
        if (
          target === 'Cancelled' &&
          !['Available', 'Full', 'Closed'].includes(slot.status)
        )
          throw new CatalogProblemException(409, 'resource_state_conflict');
        await db
          .update(bookingSlots)
          .set({ status: target })
          .where(
            and(
              eq(bookingSlots.tenantId, context.tenantId),
              eq(bookingSlots.centerId, centerId),
              eq(bookingSlots.id, slotId),
            ),
          );
        await this.recordMutation(uow, context, {
          action: 'booking.update',
          eventType: CATALOG_EVENT_TYPES.slotStatusChanged,
          resourceType: 'slot',
          resourceId: slotId,
          payload: {
            slotId,
            activityId: slot.activityId,
            centerId,
            status: target,
          },
          idempotencyKey: `booking.slot.status:${slotId}:${target}`,
        });
      },
    );
  }
}
