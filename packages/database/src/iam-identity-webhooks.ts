import type { IdentityWebhookEvent } from '@dive-center/identity';
import type { Pool } from 'pg';

export type IdentityWebhookCommandResult = Readonly<{
  duplicate: boolean;
  processingResult: 'applied' | 'ignored' | 'unresolved';
  affectedTenantCount: number;
}>;

export async function applyIdentityWebhook(
  pool: Pool,
  event: IdentityWebhookEvent,
  correlationId: string,
  sessionIdHash: string | null = null,
): Promise<IdentityWebhookCommandResult> {
  const result = await pool.query<{ outcome: IdentityWebhookCommandResult }>(
    `SELECT iam_app.apply_identity_webhook_command(
      $1, $2, $3, $4, $5::timestamptz, $6::uuid, $7
    ) AS outcome`,
    [
      event.providerEventId,
      event.issuer,
      event.type,
      event.subject,
      event.occurredAt,
      correlationId,
      sessionIdHash,
    ],
  );
  const outcome = result.rows[0]?.outcome;
  if (!outcome) throw new Error('Identity webhook command returned no outcome');
  return Object.freeze(outcome);
}
