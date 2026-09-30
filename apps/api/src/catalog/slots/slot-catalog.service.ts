import { randomUUID } from 'node:crypto';
import {
  bookingActivities,
  bookingBookings,
  bookingCapabilityVerifiers,
  bookingSlots,
  type TenantUnitOfWork,
} from '@dive-center/database';
import type { AuthenticatedPrincipal } from '@dive-center/identity';
import { Inject, Injectable } from '@nestjs/common';
import type { InferSelectModel } from 'drizzle-orm';
import { and, asc, eq, gte, inArray, isNull, lt } from 'drizzle-orm';
import type {
  CatalogListQueryInput,
  CatalogSlotInput,
} from '../catalog.dto.js';
import { CatalogProblemException } from '../catalog.errors.js';
import { formatCatalogInstant } from '../catalog.time.js';
import {
  pagination,
  parseCatalogInputInstant,
  positiveInteger,
  rejectUnknownFields,
  statusFilter,
  uuid,
} from '../catalog.validation.js';
import { CatalogAccessService } from '../catalog-access.service.js';

const SLOT_EVENT_TYPES = {
  created: 'booking.slot.created.v1',
  statusChanged: 'booking.slot.status_changed.v1',
} as const;

type SlotRow = InferSelectModel<typeof bookingSlots>;

@Injectable()
export class SlotCatalogService {
  constructor(
    @Inject(CatalogAccessService)
    private readonly access: CatalogAccessService,
  ) {}

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

  async listSlots(
    principal: AuthenticatedPrincipal,
    handle: string | undefined,
    centerId: string,
    activityId: string,
    query: CatalogListQueryInput,
  ) {
    return this.access.authorized(
      principal,
      handle,
      centerId,
      'availability.read',
      async ({ context, center, db }) => {
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
        const timeZone = this.access.centerTimeZone(center.timeZone);
        const { page, pageSize, offset } = pagination(query);
        const status = statusFilter(query.status, [
          'Available',
          'Full',
          'Closed',
          'Cancelled',
        ]);
        const from =
          query.from === undefined
            ? undefined
            : parseCatalogInputInstant(query.from, 'from');
        const to =
          query.to === undefined
            ? undefined
            : parseCatalogInputInstant(query.to, 'to');
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
    return this.access.authorized(
      principal,
      handle,
      centerId,
      'availability.manage',
      async ({ context, center, db, recordMutation }) => {
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
        const startsAt = parseCatalogInputInstant(input?.startsAt, 'startsAt');
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
        await recordMutation({
          action: 'booking.create',
          eventType: SLOT_EVENT_TYPES.created,
          resourceType: 'slot',
          resourceId: row.id,
          payload: { slotId: row.id, activityId, centerId },
          idempotencyKey: `booking.slot.created:${row.id}`,
        });
        return this.slotDto(row, this.access.centerTimeZone(center.timeZone));
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
    return this.access.authorized(
      principal,
      handle,
      centerId,
      'availability.manage',
      async ({ context, db, recordMutation }) => {
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
        if (target === 'Cancelled') {
          await this.cancelActiveBookingsForSlot(db, slot);
        }
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
        await recordMutation({
          action: 'booking.update',
          eventType: SLOT_EVENT_TYPES.statusChanged,
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

  private async cancelActiveBookingsForSlot(
    db: TenantUnitOfWork['db'],
    slot: SlotRow,
  ) {
    const activeBookings = await db
      .select({ id: bookingBookings.id })
      .from(bookingBookings)
      .where(
        and(
          eq(bookingBookings.tenantId, slot.tenantId),
          eq(bookingBookings.centerId, slot.centerId),
          eq(bookingBookings.slotId, slot.id),
          inArray(bookingBookings.status, ['Pending', 'Confirmed']),
        ),
      )
      .orderBy(asc(bookingBookings.id))
      .for('update');
    const bookingIds = activeBookings.map((booking) => booking.id);
    if (bookingIds.length === 0) return;

    await db
      .update(bookingBookings)
      .set({ status: 'Cancelled' })
      .where(
        and(
          eq(bookingBookings.tenantId, slot.tenantId),
          eq(bookingBookings.centerId, slot.centerId),
          eq(bookingBookings.slotId, slot.id),
          inArray(bookingBookings.id, bookingIds),
          inArray(bookingBookings.status, ['Pending', 'Confirmed']),
        ),
      );
    await db
      .update(bookingCapabilityVerifiers)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(bookingCapabilityVerifiers.tenantId, slot.tenantId),
          inArray(bookingCapabilityVerifiers.bookingId, bookingIds),
          eq(bookingCapabilityVerifiers.purpose, 'booking_cancel'),
          isNull(bookingCapabilityVerifiers.revokedAt),
        ),
      );
  }
}
