import { and, eq } from 'drizzle-orm';
import type { Pool } from 'pg';
import { consumerReceipts, outboxEvents } from './schema.js';
import { withTenant } from './unit-of-work.js';

export async function processOutboxOnce(
  pool: Pool,
  tenantId: string,
  eventId: string,
  consumer: string,
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

    try {
      await db.insert(consumerReceipts).values({
        tenantId: event.tenantId,
        eventId: event.id,
        consumer,
        processedAt: new Date(),
      });
      return 'processed';
    } catch (error) {
      const code =
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        typeof error.code === 'string'
          ? error.code
          : undefined;
      if (code === '23505') {
        return 'duplicate';
      }
      throw error;
    }
  });
}
