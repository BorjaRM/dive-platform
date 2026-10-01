import type { IamDenialReason } from '@dive-center/contracts';
import {
  type BookingReadResource,
  IamAccessDeniedError,
  recordBookingReadAudit,
  withIamAuthorizedTenant,
} from '@dive-center/database';
import {
  authorizeIamMembership,
  type IamPermission,
} from '@dive-center/identity';
import { correlationIdForCurrentContext } from '@dive-center/observability';
import { Inject, Injectable } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import type { ResolvedCenterApplicationScope } from '../../common/auth/http-admission.js';
import { DATABASE_POOL } from '../../common/database/database.tokens.js';
import { ApiProblemException } from '../../common/http/problem-details.js';
import { uuid } from '../../common/validation/request-validation.js';
import type {
  BookingPageReadDto,
  CalendarPageReadDto,
} from './booking-read.dto.js';
import {
  readBookings,
  readCalendar,
  readContact,
  resourceExists,
} from './booking-read.persistence.js';
import {
  bookingQuery,
  calendarQuery,
  contactQuery,
} from './booking-read.validation.js';

class ReadDenied extends ApiProblemException {
  constructor(readonly reason: IamDenialReason) {
    super(
      reason === 'permission_missing' ? 403 : 404,
      reason === 'permission_missing'
        ? 'permission_denied'
        : 'resource_not_found',
    );
  }
}

function validInstant(value: string): number {
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(value) ||
    !Number.isFinite(Date.parse(value))
  ) {
    throw new Error('Invalid authoritative timestamp');
  }
  return Date.parse(value);
}

function validateCalendar(page: CalendarPageReadDto): void {
  validInstant(page.asOf);
  for (const item of page.items) {
    const start = validInstant(item.startsAt);
    validInstant(item.createdAt);
    for (const value of [item.capacity, item.durationMinutes]) {
      if (!Number.isSafeInteger(value) || value <= 0)
        throw new Error('Invalid authoritative slot');
    }
    const duration = item.durationMinutes * 60_000;
    const end = start + duration;
    if (
      !Number.isSafeInteger(duration) ||
      !Number.isSafeInteger(end) ||
      !Number.isFinite(new Date(end).getTime())
    ) {
      throw new Error('Invalid authoritative execution end');
    }
    for (const value of [item.confirmedSeats, item.heldSeats]) {
      if (!Number.isSafeInteger(value) || value < 0)
        throw new Error('Invalid authoritative occupancy');
    }
    if (item.remainingSeats !== null)
      throw new Error('Blocked occupancy authority unavailable');
  }
}

function validateBookings(page: BookingPageReadDto): void {
  for (const item of page.items) {
    validInstant(item.createdAt);
    if (item.holdExpiresAt !== null) validInstant(item.holdExpiresAt);
    if (!Number.isSafeInteger(item.seats) || item.seats <= 0)
      throw new Error('Invalid authoritative seats');
  }
}

@Injectable()
export class BookingReadService {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  calendar(
    scope: ResolvedCenterApplicationScope,
    requestedCenterId: string,
    query: unknown,
  ) {
    return this.audited(
      scope,
      { type: 'center' },
      ['calendar.read'],
      requestedCenterId,
      async (client, current) => {
        const input = calendarQuery(query);
        if (
          input.activityId &&
          !(await resourceExists(client, current, 'activity', input.activityId))
        ) {
          throw new ReadDenied('resource_missing_or_inaccessible');
        }
        const page = await readCalendar(client, current, input);
        validateCalendar(page);
        return page;
      },
    );
  }

  bookings(
    scope: ResolvedCenterApplicationScope,
    requestedCenterId: string,
    requestedSlotId: string,
    query: unknown,
  ) {
    const slotId = uuid(requestedSlotId, 'slotId');
    return this.audited(
      scope,
      { type: 'slot', id: slotId },
      ['booking.read'],
      requestedCenterId,
      async (client, current) => {
        const input = bookingQuery(query);
        if (!(await resourceExists(client, current, 'slot', slotId)))
          throw new ReadDenied('resource_missing_or_inaccessible');
        const page = await readBookings(client, current, slotId, input);
        validateBookings(page);
        return page;
      },
    );
  }

  contact(
    scope: ResolvedCenterApplicationScope,
    requestedCenterId: string,
    requestedBookingId: string,
    query: unknown,
  ) {
    const bookingId = uuid(requestedBookingId, 'bookingId');
    return this.audited(
      scope,
      { type: 'booking', id: bookingId },
      ['booking.read', 'customer_contact.read'],
      requestedCenterId,
      async (client, current) => {
        contactQuery(query);
        const contact = await readContact(client, current, bookingId);
        if (!contact) throw new ReadDenied('resource_missing_or_inaccessible');
        return contact;
      },
    );
  }

  private async audited<Result>(
    scope: ResolvedCenterApplicationScope,
    resource: BookingReadResource,
    permissions: IamPermission[],
    requestedCenterId: string,
    read: (
      client: PoolClient,
      current: ResolvedCenterApplicationScope,
    ) => Promise<Result>,
  ): Promise<Result> {
    const validatedRequestedCenterId = uuid(requestedCenterId, 'centerId');
    const correlationId = correlationIdForCurrentContext();
    try {
      return await withIamAuthorizedTenant(
        this.pool,
        scope.access,
        async ({ client }, access) => {
          const current = Object.freeze({ ...scope, access });
          if (validatedRequestedCenterId !== current.centerId)
            throw new ReadDenied('scope_mismatch');
          if (
            !(await resourceExists(client, current, 'center', current.centerId))
          )
            throw new ReadDenied('resource_missing_or_inaccessible');
          for (const permission of permissions) {
            const decision = authorizeIamMembership({
              membershipStatus: 'active',
              roles: access.roles,
              centerIds: access.centerIds,
              requestedCenterId: current.centerId,
              permission,
              tenantMatches: true,
              resourceExists: true,
              resourceStateAllows: true,
            });
            if (!decision.allowed) throw new ReadDenied(decision.reason);
          }
          const result = await read(client, current);
          await recordBookingReadAudit(
            client,
            current,
            resource,
            correlationId,
          );
          return result;
        },
      );
    } catch (error) {
      if (error instanceof IamAccessDeniedError)
        throw new ApiProblemException(401, 'unauthenticated');
      if (error instanceof ReadDenied) {
        await withIamAuthorizedTenant(
          this.pool,
          scope.access,
          async ({ client }, access) => {
            await recordBookingReadAudit(
              client,
              { ...scope, access },
              resource,
              correlationId,
              error.reason,
            );
          },
        );
      }
      throw error;
    }
  }
}
