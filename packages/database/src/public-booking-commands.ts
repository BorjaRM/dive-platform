import type { PoolClient } from 'pg';

export type PublicBookingCreated = Readonly<{
  tenantId: string;
  bookingId: string;
  correlationId: string;
}>;

export async function recordPublicBookingCreated(
  client: Pick<PoolClient, 'query'>,
  input: PublicBookingCreated,
): Promise<void> {
  await client.query(
    'SELECT iam_app.record_public_booking_created($1::uuid, $2::uuid, $3::uuid)',
    [input.tenantId, input.bookingId, input.correlationId],
  );
}
