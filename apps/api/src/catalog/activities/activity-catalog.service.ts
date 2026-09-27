import { randomUUID } from 'node:crypto';
import { bookingActivities } from '@dive-center/database';
import type { AuthenticatedPrincipal } from '@dive-center/identity';
import { Inject, Injectable } from '@nestjs/common';
import type { InferSelectModel } from 'drizzle-orm';
import { and, desc, eq } from 'drizzle-orm';
import type {
  CatalogActivityInput,
  CatalogListQueryInput,
} from '../catalog.dto.js';
import { CatalogProblemException } from '../catalog.errors.js';
import {
  localized,
  pagination,
  positiveInteger,
  rejectUnknownFields,
  statusFilter,
  uuid,
} from '../catalog.validation.js';
import { CatalogAccessService } from '../catalog-access.service.js';

const ACTIVITY_EVENT_TYPES = {
  created: 'booking.activity.created.v1',
  statusChanged: 'booking.activity.status_changed.v1',
} as const;

type ActivityRow = InferSelectModel<typeof bookingActivities>;

@Injectable()
export class ActivityCatalogService {
  constructor(
    @Inject(CatalogAccessService)
    private readonly access: CatalogAccessService,
  ) {}

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

  async listActivities(
    principal: AuthenticatedPrincipal,
    handle: string | undefined,
    centerId: string,
    query: CatalogListQueryInput,
  ) {
    return this.access.authorized(
      principal,
      handle,
      centerId,
      'booking_service.read',
      async (context, _center, unitOfWork) => {
        const { page, pageSize, offset } = pagination(query);
        const status = statusFilter(query.status, [
          'Draft',
          'Published',
          'Disabled',
        ]);
        const rows = await unitOfWork.db
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
    return this.access.authorized(
      principal,
      handle,
      centerId,
      'booking_service.create',
      async (context, _center, unitOfWork) => {
        rejectUnknownFields(input, ['name', 'description', 'defaultCapacity']);
        const name = localized(input?.name, 'name', true);
        const description = localized(input?.description, 'description', false);
        const defaultCapacity =
          input?.defaultCapacity === undefined
            ? undefined
            : positiveInteger(input.defaultCapacity, 'defaultCapacity');
        const [row] = await unitOfWork.db
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
        await this.access.recordMutation(unitOfWork, context, {
          action: 'booking.create',
          eventType: ACTIVITY_EVENT_TYPES.created,
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
    return this.access.authorized(
      principal,
      handle,
      centerId,
      'booking_service.publish',
      async (context, _center, unitOfWork) => {
        uuid(activityId, 'activityId');
        const [activity] = await unitOfWork.db
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
        await unitOfWork.db
          .update(bookingActivities)
          .set({ status: target })
          .where(
            and(
              eq(bookingActivities.tenantId, context.tenantId),
              eq(bookingActivities.centerId, centerId),
              eq(bookingActivities.id, activityId),
            ),
          );
        await this.access.recordMutation(unitOfWork, context, {
          action: 'booking.update',
          eventType: ACTIVITY_EVENT_TYPES.statusChanged,
          resourceType: 'activity',
          resourceId: activityId,
          payload: { activityId, centerId, status: target },
          idempotencyKey: `booking.activity.status:${activityId}:${target}`,
        });
      },
    );
  }
}
