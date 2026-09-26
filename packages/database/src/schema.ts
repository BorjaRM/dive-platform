import { jsonb, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const mtSpike = pgSchema('mt_spike');

export const tenants = mtSpike.table('tenants', {
  id: uuid('id').primaryKey(),
});

export const centers = mtSpike.table('centers', {
  id: uuid('id').notNull(),
  tenantId: uuid('tenant_id').notNull(),
  name: text('name').notNull(),
});

export const notes = mtSpike.table('notes', {
  id: uuid('id').notNull(),
  tenantId: uuid('tenant_id').notNull(),
  centerId: uuid('center_id').notNull(),
  body: text('body').notNull(),
});

export const outboxEvents = mtSpike.table('outbox_events', {
  id: uuid('id').notNull(),
  tenantId: uuid('tenant_id').notNull(),
  eventType: text('event_type').notNull(),
  payload: jsonb('payload').notNull(),
  correlationId: text('correlation_id').notNull(),
  idempotencyKey: text('idempotency_key').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
});

export const auditRecords = mtSpike.table('audit_records', {
  id: uuid('id').notNull(),
  tenantId: uuid('tenant_id').notNull(),
  actor: text('actor').notNull(),
  action: text('action').notNull(),
  resource: text('resource').notNull(),
  result: text('result').notNull(),
  correlationId: text('correlation_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
});

export const consumerReceipts = mtSpike.table('consumer_receipts', {
  tenantId: uuid('tenant_id').notNull(),
  eventId: uuid('event_id').notNull(),
  consumer: text('consumer').notNull(),
  processedAt: timestamp('processed_at', { withTimezone: true }).notNull(),
});
