import type { PoolClient } from 'pg';

export type BookingCatalogMutation = Readonly<{
  tenantId: string;
  actorIdentityId: string;
  action: 'booking.create' | 'booking.update' | 'booking.activity.updated';
  resourceType: 'activity' | 'slot' | 'channel' | 'catalog_settings';
  resourceId: string;
  eventType: string | null;
  payload: Record<string, unknown>;
  correlationId: string;
  idempotencyKey: string | null;
}>;

export async function recordBookingCatalogMutation(
  client: Pick<PoolClient, 'query'>,
  input: BookingCatalogMutation,
): Promise<void> {
  await client.query(
    `SELECT iam_app.record_booking_catalog_mutation(
      $1::uuid, $2::uuid, $3, $4, $5::uuid, $6, $7::jsonb, $8::uuid, $9
    )`,
    [
      input.tenantId,
      input.actorIdentityId,
      input.action,
      input.resourceType,
      input.resourceId,
      input.eventType,
      input.payload,
      input.correlationId,
      input.idempotencyKey,
    ],
  );
}
