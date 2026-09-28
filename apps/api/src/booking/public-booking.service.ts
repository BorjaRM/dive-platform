import { createHash, randomUUID } from 'node:crypto';
import { correlationIdForCurrentContext } from '@dive-center/observability';
import {
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import { CatalogProblemException } from '../catalog/catalog.errors.js';
import { DATABASE_POOL } from '../common/database/database.tokens.js';
import {
  PUBLIC_BOOKING_CAPABILITY_CRYPTO,
  type PublicBookingCapabilityCrypto,
} from './public-booking.crypto.js';
import type {
  PublicBookingInput,
  PublicBookingResponseDto,
} from './public-booking.dto.js';

type ResolvedChannel = Readonly<{
  tenantId: string;
  channelId: string;
  centerId: string;
  activityId: string;
  allowedOrigins: readonly string[];
  confirmationMode: 'immediate' | 'staff_approval';
}>;

type BookingRow = Readonly<{
  id: string;
  status: 'Pending' | 'Confirmed' | 'Rejected' | 'Cancelled' | 'Expired';
  seats: number;
  locale: 'es' | 'en';
  request_hash: string;
}>;

type PublicBookingResult = Readonly<{
  response: PublicBookingResponseDto;
  replayed: boolean;
}>;

const PENDING_HOLD_MILLIS = 15 * 60 * 1_000;
const CAPABILITY_TTL_MILLIS = 72 * 60 * 60 * 1_000;
const BOOKING_CHANNEL = 'public_hosted';
const CONFIRMATION_PURPOSE = 'booking_confirmation_read';
const CANCELLATION_PURPOSE = 'booking_cancel';

@Injectable()
export class PublicBookingService {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
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
      const channel = await this.resolveChannel(client, channelPublicId);
      if (!channel || !origin || !channel.allowedOrigins.includes(origin)) {
        throw new CatalogProblemException(404, 'resource_not_found');
      }

      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [`${channel.tenantId}:${channel.channelId}:${key}`],
      );
      const existing = await this.existingBooking(client, channel, key);
      if (existing) {
        if (existing.request_hash !== requestHash) {
          throw new CatalogProblemException(409, 'idempotency_conflict');
        }
        const response = this.bookingResponse(existing);
        await client.query('COMMIT');
        client.release();
        return { response, replayed: true };
      }

      const slot = await this.lockSlot(client, channel, input.slotId);
      if (!slot) throw new CatalogProblemException(404, 'resource_not_found');
      if (slot.status !== 'Available' && slot.status !== 'Full') {
        throw new CatalogProblemException(409, 'slot_unavailable');
      }

      const usedSeats = await this.usedSeats(client, channel, input.slotId);
      if (usedSeats + input.seats > slot.capacity) {
        throw new CatalogProblemException(409, 'slot_unavailable');
      }

      const bookingId = randomUUID();
      const status =
        channel.confirmationMode === 'immediate' ? 'Confirmed' : 'Pending';
      const holdExpiresAt =
        status === 'Pending'
          ? new Date(Date.now() + PENDING_HOLD_MILLIS)
          : null;
      await client.query(
        `INSERT INTO booking_app.bookings (
          id, tenant_id, center_id, channel_id, slot_id, booking_channel,
          idempotency_key, request_hash, status, seats, locale,
          booker_first_name, booker_last_name, booker_email, booker_phone,
          hold_expires_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
        [
          bookingId,
          channel.tenantId,
          channel.centerId,
          channel.channelId,
          input.slotId,
          BOOKING_CHANNEL,
          key,
          requestHash,
          status,
          input.seats,
          input.locale,
          input.booker.firstName,
          input.booker.lastName,
          input.booker.email,
          input.booker.phone ?? null,
          holdExpiresAt,
        ],
      );

      const totalSeats = usedSeats + input.seats;
      await client.query(
        `UPDATE booking_app.slots
         SET status = $1
         WHERE tenant_id = $2 AND center_id = $3 AND id = $4`,
        [
          totalSeats >= slot.capacity ? 'Full' : 'Available',
          channel.tenantId,
          channel.centerId,
          input.slotId,
        ],
      );

      const issuedAt = new Date();
      const expiresAt = new Date(issuedAt.getTime() + CAPABILITY_TTL_MILLIS);
      for (const [purpose, verifierId] of [
        [CONFIRMATION_PURPOSE, randomUUID()],
        [CANCELLATION_PURPOSE, randomUUID()],
      ] as const) {
        const token = this.capabilities.token(bookingId, purpose, 1);
        await client.query(
          `INSERT INTO booking_app.capability_verifiers (
            id, tenant_id, booking_id, purpose, version, verifier_hash,
            issued_at, expires_at
          ) VALUES ($1, $2, $3, $4, 1, $5, $6, $7)`,
          [
            verifierId,
            channel.tenantId,
            bookingId,
            purpose,
            this.capabilities.verifierHash(token),
            issuedAt,
            expiresAt,
          ],
        );
      }

      const correlationId = correlationIdForCurrentContext();
      await client.query(
        `INSERT INTO iam_app.audit_records (
          id, tenant_id, actor_identity_id, action, resource_type, resource_id,
          result, purpose, source_metadata, correlation_id
        ) VALUES ($1, $2, NULL, 'booking.create', 'booking', $3, 'success', $4, $5::jsonb, $6)`,
        [
          randomUUID(),
          channel.tenantId,
          bookingId,
          BOOKING_CHANNEL,
          JSON.stringify({ channelId: channel.channelId }),
          correlationId,
        ],
      );
      await client.query(
        `INSERT INTO iam_app.outbox_events (
          id, tenant_id, event_type, payload, correlation_id, idempotency_key
        ) VALUES ($1, $2, 'booking.public_created.v1', $3::jsonb, $4, $5)`,
        [
          randomUUID(),
          channel.tenantId,
          JSON.stringify({
            bookingId,
            email: input.booker.email,
            locale: input.locale,
            status,
            purpose: CONFIRMATION_PURPOSE,
          }),
          correlationId,
          `booking.public-created.email:${bookingId}`,
        ],
      );

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
      try {
        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
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
      const channel = await this.resolveChannel(client, channelPublicId);
      await client.query('ROLLBACK');
      client.release();
      return channel?.allowedOrigins.includes(origin) ?? false;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
      throw error;
    }
  }

  private async resolveChannel(
    client: PoolClient,
    channelPublicId: string,
  ): Promise<ResolvedChannel | null> {
    if (
      typeof channelPublicId !== 'string' ||
      channelPublicId.length === 0 ||
      channelPublicId.length > 200 ||
      !/^[A-Za-z0-9._~-]+$/.test(channelPublicId)
    ) {
      return null;
    }
    const result = await client.query<{ resolved: ResolvedChannel | null }>(
      'SELECT booking_app.resolve_public_channel($1) AS resolved',
      [channelPublicId],
    );
    return result.rows[0]?.resolved ?? null;
  }

  private async existingBooking(
    client: PoolClient,
    channel: ResolvedChannel,
    idempotencyKey: string,
  ): Promise<BookingRow | null> {
    const result = await client.query<BookingRow>(
      `SELECT id, status, seats, locale, request_hash
       FROM booking_app.bookings
       WHERE tenant_id = $1 AND channel_id = $2 AND idempotency_key = $3
       LIMIT 1`,
      [channel.tenantId, channel.channelId, idempotencyKey],
    );
    return result.rows[0] ?? null;
  }

  private async lockSlot(
    client: PoolClient,
    channel: ResolvedChannel,
    slotId: string,
  ): Promise<{ capacity: number; status: string } | null> {
    const result = await client.query<{
      capacity: number;
      status: string;
    }>(
      `SELECT slot.capacity, slot.status
       FROM booking_app.slots AS slot
       JOIN booking_app.activities AS activity
         ON activity.tenant_id = slot.tenant_id
        AND activity.center_id = slot.center_id
        AND activity.id = slot.activity_id
       WHERE slot.tenant_id = $1
         AND slot.center_id = $2
         AND slot.id = $3
         AND slot.activity_id = $4
         AND activity.status = 'Published'
       FOR UPDATE OF slot`,
      [channel.tenantId, channel.centerId, slotId, channel.activityId],
    );
    return result.rows[0] ?? null;
  }

  private async usedSeats(
    client: PoolClient,
    channel: ResolvedChannel,
    slotId: string,
  ): Promise<number> {
    const result = await client.query<{ seats: number | string }>(
      `SELECT COALESCE(
         SUM(seats) FILTER (
           WHERE status = 'Confirmed'
              OR (status = 'Pending' AND hold_expires_at > now())
         ), 0
       )::int AS seats
       FROM booking_app.bookings
       WHERE tenant_id = $1 AND slot_id = $2`,
      [channel.tenantId, slotId],
    );
    return Number(result.rows[0]?.seats ?? 0);
  }

  private bookingResponse(row: BookingRow): PublicBookingResponseDto {
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
        CONFIRMATION_PURPOSE,
        1,
      ),
      cancelToken: this.capabilities.token(row.id, CANCELLATION_PURPOSE, 1),
    };
  }

  private requestHash(input: PublicBookingInput): string {
    return createHash('sha256')
      .update(
        JSON.stringify({
          slotId: input.slotId,
          seats: input.seats,
          locale: input.locale,
          booker: input.booker,
        }),
        'utf8',
      )
      .digest('hex');
  }

  private idempotencyKey(value: string | undefined): string {
    if (
      value === undefined ||
      !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)
    ) {
      throw new CatalogProblemException(422, 'validation_error');
    }
    return value;
  }
}
