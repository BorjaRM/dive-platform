import type { IamDenialReason } from '@dive-center/contracts';
import type { PoolClient } from 'pg';
import type { IamAccessContext } from './iam-authorize.js';

export type BookingReadResource =
  | Readonly<{ type: 'center' }>
  | Readonly<{ type: 'slot' | 'booking'; id: string }>;

export async function recordBookingReadAudit(
  client: Pick<PoolClient, 'query'>,
  scope: Readonly<{ access: IamAccessContext; centerId: string }>,
  resource: BookingReadResource,
  correlationId: string,
  reason?: IamDenialReason,
): Promise<void> {
  await client.query(
    'SELECT iam_app.record_booking_read($1::uuid, $2::uuid, $3::uuid, $4, $5::uuid, $6, $7, $8::uuid)',
    [
      scope.access.tenantId,
      scope.access.identityId,
      scope.centerId,
      resource.type,
      resource.type === 'center' ? scope.centerId : resource.id,
      reason ? 'denied' : 'success',
      reason ?? null,
      correlationId,
    ],
  );
}
