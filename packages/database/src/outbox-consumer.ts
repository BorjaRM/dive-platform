import { and, eq } from 'drizzle-orm';
import type { Pool } from 'pg';
import { consumerReceipts, outboxEvents } from './schema.js';
import { type TenantUnitOfWork, withTenant } from './unit-of-work.js';

type OutboxDatabaseEffect = (context: {
  correlationId: string;
  db: TenantUnitOfWork['db'];
  tenantId: string;
}) => Promise<void>;

/** Applies only PostgreSQL work through `db`; external delivery is intentionally outside this prototype. */
export async function processOutboxOnce(
  pool: Pool,
  tenantId: string,
  eventId: string,
  consumer: string,
  applyDatabaseEffect?: OutboxDatabaseEffect,
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
    await applyDatabaseEffect?.({
      correlationId: event.correlationId,
      db,
      tenantId: event.tenantId,
    });
    return 'processed';
  });
}
