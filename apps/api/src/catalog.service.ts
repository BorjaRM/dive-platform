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
import { DATABASE_POOL, TENANT_CONTEXT_CRYPTO } from './iam.tokens.js';
import type { TenantContextCrypto } from './tenant-context.crypto.js';

const PAGE_DEFAULT = 1;
const PAGE_SIZE_DEFAULT = 20;
const PAGE_SIZE_MAX = 50;

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

function uuid(value: string, field: string): string {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw new CatalogProblemException(
      422,
      'validation_error',
      `${field} must be a UUID`,
    );
  }
  return value;
}

function positiveInteger(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new CatalogProblemException(
      422,
      'validation_error',
      `${field} must be a positive integer`,
    );
  }
  return value;
}

function pagination(query: CatalogListQueryInput) {
  const page = query.page === undefined ? PAGE_DEFAULT : Number(query.page);
  const pageSize =
    query.pageSize === undefined ? PAGE_SIZE_DEFAULT : Number(query.pageSize);
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    !Number.isSafeInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > PAGE_SIZE_MAX
  ) {
    throw new CatalogProblemException(
      422,
      'validation_error',
      'Invalid pagination bounds',
    );
  }
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function localized(
  value: unknown,
  field: string,
  required: true,
): Record<string, string>;
function localized(
  value: unknown,
  field: string,
  required: false,
): Record<string, string> | undefined;
function localized(
  value: unknown,
  field: string,
  required: boolean,
): Record<string, string> | undefined {
  if (value === undefined && !required) return undefined;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new CatalogProblemException(
      422,
      'validation_error',
      `${field} must be an object`,
    );
  }
  const input = value as Record<string, unknown>;
  const result: Record<string, string> = {};
  for (const language of ['es', 'en']) {
    if (input[language] !== undefined) {
      if (
        typeof input[language] !== 'string' ||
        input[language].trim() === ''
      ) {
        throw new CatalogProblemException(
          422,
          'validation_error',
          `${field}.${language} must be non-empty`,
        );
      }
      result[language] = input[language];
    }
  }
  if (Object.keys(result).length === 0 && required) {
    throw new CatalogProblemException(
      422,
      'validation_error',
      `${field} must contain es or en`,
    );
  }
  if (Object.keys(input).some((key) => !['es', 'en'].includes(key))) {
    throw new CatalogProblemException(
      422,
      'validation_error',
      `${field} contains an unsupported locale`,
    );
  }
  return result;
}

function rejectUnknownFields(value: unknown, allowed: readonly string[]) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new CatalogProblemException(
      422,
      'validation_error',
      'body must be an object',
    );
  }
  const input = value as Record<string, unknown>;
  const unknown = Object.keys(input).find((key) => !allowed.includes(key));
  if (unknown) {
    throw new CatalogProblemException(
      422,
      'validation_error',
      `body contains an unsupported field: ${unknown}`,
    );
  }
}

function statusFilter(value: unknown, allowed: readonly string[]) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw new CatalogProblemException(
      422,
      'validation_error',
      'Invalid status',
    );
  }
  return value;
}

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
