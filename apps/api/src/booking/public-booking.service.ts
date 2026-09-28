import { randomUUID } from 'node:crypto';
import { rollbackAndReleaseClient } from '@dive-center/database';
import { correlationIdForCurrentContext } from '@dive-center/observability';
import {
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import type { Pool } from 'pg';
import { DATABASE_POOL } from '../common/database/database.tokens.js';
import { ApiProblemException } from '../common/http/problem-details.js';
import {
  PUBLIC_BOOKING_CAPABILITY_CRYPTO,
  type PublicBookingCapabilityCrypto,
} from './public-booking.crypto.js';
import type {
  PublicBookingInput,
  PublicBookingResponseDto,
} from './public-booking.dto.js';
import {
  type PersistedPublicBooking,
  PublicBookingPersistence,
} from './public-booking.persistence.js';
import {
  canAcceptPublicBooking,
  hashPublicBookingRequest,
  isPublicBookingIdempotencyKeyValid,
  isPublicChannelIdValid,
  PUBLIC_BOOKING_CANCELLATION_PURPOSE,
  PUBLIC_BOOKING_CAPABILITY_TTL_MILLIS,
  PUBLIC_BOOKING_CHANNEL,
  PUBLIC_BOOKING_CONFIRMATION_PURPOSE,
  publicBookingState,
  publicSlotStatusAfterBooking,
} from './public-booking.rules.js';

type PublicBookingResult = Readonly<{
  response: PublicBookingResponseDto;
  replayed: boolean;
}>;

@Injectable()
export class PublicBookingService {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    @Inject(PublicBookingPersistence)
    private readonly persistence: PublicBookingPersistence,
    @Inject(PUBLIC_BOOKING_CAPABILITY_CRYPTO)
    private readonly capabilities: PublicBookingCapabilityCrypto,
  ) {}

  async create(
    channelPublicId: string,
    origin: string | undefined,
    idempotencyKey: string | undefined,
    input: PublicBookingInput,
  ): Promise<PublicBookingResult> {
    const key = this.idempotencyKey(idempotencyKey);
    const requestHash = this.requestHash(input);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const channel = isPublicChannelIdValid(channelPublicId)
        ? await this.persistence.resolveChannel(client, channelPublicId)
        : null;
      if (!channel || !origin || !channel.allowedOrigins.includes(origin)) {
        throw new ApiProblemException(404, 'resource_not_found');
      }

      await this.persistence.acquireIdempotencyLock(client, channel, key);
      const existing = await this.persistence.findExistingBooking(
        client,
        channel,
        key,
      );
      if (existing) {
        if (existing.request_hash !== requestHash) {
          throw new ApiProblemException(409, 'idempotency_conflict');
        }
        const response = this.bookingResponse(existing);
        await client.query('COMMIT');
        client.release();
        return { response, replayed: true };
      }

      const slot = await this.persistence.lockSlot(
        client,
        channel,
        input.slotId,
      );
      if (!slot) throw new ApiProblemException(404, 'resource_not_found');
      if (slot.status !== 'Available' && slot.status !== 'Full') {
        throw new ApiProblemException(409, 'slot_unavailable');
      }

      const usedSeats = await this.persistence.usedSeats(
        client,
        channel,
        input.slotId,
      );
      if (!canAcceptPublicBooking(usedSeats, input.seats, slot.capacity)) {
        throw new ApiProblemException(409, 'slot_unavailable');
      }

      const bookingId = randomUUID();
      const { holdExpiresAt, status } = publicBookingState(
        channel.confirmationMode,
        new Date(),
      );
      await this.persistence.insertBooking(client, {
        bookingId,
        bookingChannel: PUBLIC_BOOKING_CHANNEL,
        booker: input.booker,
        channel,
        holdExpiresAt,
        idempotencyKey: key,
        locale: input.locale,
        requestHash,
        seats: input.seats,
        slotId: input.slotId,
        status,
      });

      await this.persistence.updateSlotStatus(
        client,
        channel,
        input.slotId,
        publicSlotStatusAfterBooking(usedSeats, input.seats, slot.capacity),
      );

      const issuedAt = new Date();
      const expiresAt = new Date(
        issuedAt.getTime() + PUBLIC_BOOKING_CAPABILITY_TTL_MILLIS,
      );
      for (const [purpose, verifierId] of [
        [PUBLIC_BOOKING_CONFIRMATION_PURPOSE, randomUUID()],
        [PUBLIC_BOOKING_CANCELLATION_PURPOSE, randomUUID()],
      ] as const) {
        const token = this.capabilities.token(bookingId, purpose, 1);
        await this.persistence.insertCapabilityVerifier(client, channel, {
          bookingId,
          expiresAt,
          issuedAt,
          purpose,
          verifierHash: this.capabilities.verifierHash(token),
          verifierId,
        });
      }

      const correlationId = correlationIdForCurrentContext();
      await this.persistence.recordCreated(client, channel, {
        bookingId,
        correlationId,
      });

      const response = this.bookingResponse({
        id: bookingId,
        status,
        seats: input.seats,
        locale: input.locale,
        request_hash: requestHash,
      });
      await client.query('COMMIT');
      client.release();
      return { response, replayed: false };
    } catch (error) {
      await rollbackAndReleaseClient(client);
      throw error;
    }
  }

  async isOriginAllowed(
    channelPublicId: string,
    origin: string,
  ): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const channel = isPublicChannelIdValid(channelPublicId)
        ? await this.persistence.resolveChannel(client, channelPublicId)
        : null;
      await client.query('COMMIT');
      client.release();
      return channel?.allowedOrigins.includes(origin) ?? false;
    } catch (error) {
      await rollbackAndReleaseClient(client);
      throw error;
    }
  }

  private bookingResponse(
    row: PersistedPublicBooking,
  ): PublicBookingResponseDto {
    if (row.status !== 'Pending' && row.status !== 'Confirmed') {
      throw new InternalServerErrorException('Invalid public booking state');
    }
    return {
      bookingId: row.id,
      status: row.status,
      seats: row.seats,
      locale: row.locale,
      confirmationReadToken: this.capabilities.token(
        row.id,
        PUBLIC_BOOKING_CONFIRMATION_PURPOSE,
        1,
      ),
      cancelToken: this.capabilities.token(
        row.id,
        PUBLIC_BOOKING_CANCELLATION_PURPOSE,
        1,
      ),
    };
  }

  private requestHash(input: PublicBookingInput): string {
    return hashPublicBookingRequest(input);
  }

  private idempotencyKey(value: string | undefined): string {
    if (!isPublicBookingIdempotencyKeyValid(value)) {
      throw new ApiProblemException(422, 'validation_error');
    }
    return value;
  }
}
