import { recordPublicBookingCreated } from '@dive-center/database';
import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';

export type ResolvedPublicBookingChannel = Readonly<{
  tenantId: string;
  channelId: string;
  centerId: string;
  activityId: string;
  allowedOrigins: readonly string[];
  confirmationMode: 'immediate' | 'staff_approval';
}>;

export type PersistedPublicBooking = Readonly<{
  id: string;
  status: 'Pending' | 'Confirmed' | 'Rejected' | 'Cancelled' | 'Expired';
  seats: number;
  locale: 'es' | 'en';
  request_hash: string;
}>;

type PublicBookingInsert = Readonly<{
  bookingId: string;
  channel: ResolvedPublicBookingChannel;
  holdExpiresAt: Date | null;
  idempotencyKey: string;
  locale: 'es' | 'en';
  booker: Readonly<{
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
  }>;
  requestHash: string;
  seats: number;
  slotId: string;
  status: 'Pending' | 'Confirmed';
  bookingChannel: string;
}>;

type CapabilityVerifierInsert = Readonly<{
  bookingId: string;
  expiresAt: Date;
  issuedAt: Date;
  purpose: string;
  verifierHash: string;
  verifierId: string;
}>;

@Injectable()
export class PublicBookingPersistence {
  async resolveChannel(
    client: PoolClient,
    channelPublicId: string,
  ): Promise<ResolvedPublicBookingChannel | null> {
    const result = await client.query<{
      resolved: ResolvedPublicBookingChannel | null;
    }>('SELECT booking_app.resolve_public_channel($1) AS resolved', [
      channelPublicId,
    ]);
    return result.rows[0]?.resolved ?? null;
  }

  async acquireIdempotencyLock(
    client: PoolClient,
    channel: ResolvedPublicBookingChannel,
    idempotencyKey: string,
  ): Promise<void> {
    await client.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [`${channel.tenantId}:${channel.channelId}:${idempotencyKey}`],
    );
  }

  async findExistingBooking(
    client: PoolClient,
    channel: ResolvedPublicBookingChannel,
    idempotencyKey: string,
  ): Promise<PersistedPublicBooking | null> {
    const result = await client.query<PersistedPublicBooking>(
      `SELECT id, status, seats, locale, request_hash
       FROM booking_app.bookings
       WHERE tenant_id = $1 AND channel_id = $2 AND idempotency_key = $3
       LIMIT 1`,
      [channel.tenantId, channel.channelId, idempotencyKey],
    );
    return result.rows[0] ?? null;
  }

  async lockSlot(
    client: PoolClient,
    channel: ResolvedPublicBookingChannel,
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

  async usedSeats(
    client: PoolClient,
    channel: ResolvedPublicBookingChannel,
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

  async insertBooking(
    client: PoolClient,
    booking: PublicBookingInsert,
  ): Promise<void> {
    await client.query(
      `INSERT INTO booking_app.bookings (
        id, tenant_id, center_id, channel_id, slot_id, booking_channel,
        idempotency_key, request_hash, status, seats, locale,
        booker_first_name, booker_last_name, booker_email, booker_phone,
        hold_expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
      [
        booking.bookingId,
        booking.channel.tenantId,
        booking.channel.centerId,
        booking.channel.channelId,
        booking.slotId,
        booking.bookingChannel,
        booking.idempotencyKey,
        booking.requestHash,
        booking.status,
        booking.seats,
        booking.locale,
        booking.booker.firstName,
        booking.booker.lastName,
        booking.booker.email,
        booking.booker.phone ?? null,
        booking.holdExpiresAt,
      ],
    );
  }

  async updateSlotStatus(
    client: PoolClient,
    channel: ResolvedPublicBookingChannel,
    slotId: string,
    status: 'Available' | 'Full',
  ): Promise<void> {
    await client.query(
      `UPDATE booking_app.slots
       SET status = $1
       WHERE tenant_id = $2 AND center_id = $3 AND id = $4`,
      [status, channel.tenantId, channel.centerId, slotId],
    );
  }

  async insertCapabilityVerifier(
    client: PoolClient,
    channel: ResolvedPublicBookingChannel,
    verifier: CapabilityVerifierInsert,
  ): Promise<void> {
    await client.query(
      `INSERT INTO booking_app.capability_verifiers (
        id, tenant_id, booking_id, purpose, version, verifier_hash,
        issued_at, expires_at
      ) VALUES ($1, $2, $3, $4, 1, $5, $6, $7)`,
      [
        verifier.verifierId,
        channel.tenantId,
        verifier.bookingId,
        verifier.purpose,
        verifier.verifierHash,
        verifier.issuedAt,
        verifier.expiresAt,
      ],
    );
  }

  async recordCreated(
    client: PoolClient,
    channel: ResolvedPublicBookingChannel,
    input: Readonly<{
      bookingId: string;
      correlationId: string;
    }>,
  ): Promise<void> {
    await recordPublicBookingCreated(client, {
      ...input,
      tenantId: channel.tenantId,
    });
  }
}
