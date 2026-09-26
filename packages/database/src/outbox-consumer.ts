import { and, eq } from 'drizzle-orm';
import type { Pool } from 'pg';
import { consumerReceipts, outboxEvents } from './schema.js';
import { withTenant } from './unit-of-work.js';

export async function processOutboxOnce(
  pool: Pool,
  tenantId: string,
  eventId: string,
  consumer: string,
  onProcess?: (context: {
    correlationId: string;
    tenantId: string;
  }) => Promise<void>,
): Promise<'processed' | 'duplicate'> {
  return withTenant(pool, tenantId, async ({ db }) => {
    const event = await db
      .select({
        id: outboxEvents.id,
        tenantId: outboxEvents.tenantId,
        correlationId: outboxEvents.correlationId,
      })
      .from(outboxEvents)
      .where(
        and(eq(outboxEvents.tenantId, tenantId), eq(outboxEvents.id, eventId)),
      )
      .then((rows) => rows[0]);

    if (!event) {
      throw new Error('Outbox event not visible in tenant context');
    }

    const inserted = await db
      .insert(consumerReceipts)
      .values({
        tenantId: event.tenantId,
        eventId: event.id,
        consumer,
        processedAt: new Date(),
      })
      .onConflictDoNothing()
      .returning({
        eventId: consumerReceipts.eventId,
      });

    if (inserted.length === 0) {
      return 'duplicate';
    }
    await onProcess?.({
      correlationId: event.correlationId,
      tenantId: event.tenantId,
    });
    return 'processed';
  });
}
