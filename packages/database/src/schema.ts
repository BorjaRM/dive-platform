import {
  foreignKey,
  jsonb,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

export const mtSpike = pgSchema('mt_spike');

export const tenants = mtSpike.table('tenants', {
  id: uuid('id').primaryKey(),
});

export const identities = mtSpike.table('identities', {
  id: uuid('id').primaryKey(),
});

export const centers = mtSpike.table(
  'centers',
  {
    id: uuid('id').notNull(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    name: text('name').notNull(),
  },
  (table) => [primaryKey({ columns: [table.tenantId, table.id] })],
);

export const notes = mtSpike.table(
  'notes',
  {
    id: uuid('id').notNull(),
    tenantId: uuid('tenant_id').notNull(),
    centerId: uuid('center_id').notNull(),
    body: text('body').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.id] }),
    foreignKey({
      columns: [table.tenantId, table.centerId],
      foreignColumns: [centers.tenantId, centers.id],
    }),
  ],
);

export const outboxEvents = mtSpike.table(
  'outbox_events',
  {
    id: uuid('id').notNull(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    eventType: text('event_type').notNull(),
    payload: jsonb('payload').notNull(),
    correlationId: text('correlation_id').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.id] }),
    unique().on(table.tenantId, table.idempotencyKey),
  ],
);

export const auditRecords = mtSpike.table(
  'audit_records',
  {
    id: uuid('id').notNull(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    actor: text('actor').notNull(),
    action: text('action').notNull(),
    resource: text('resource').notNull(),
    result: text('result').notNull(),
    correlationId: text('correlation_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.tenantId, table.id] })],
);

export const consumerReceipts = mtSpike.table(
  'consumer_receipts',
  {
    tenantId: uuid('tenant_id').notNull(),
    eventId: uuid('event_id').notNull(),
    consumer: text('consumer').notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.tenantId, table.eventId, table.consumer],
    }),
    foreignKey({
      columns: [table.tenantId, table.eventId],
      foreignColumns: [outboxEvents.tenantId, outboxEvents.id],
    }),
  ],
);

export const memberships = mtSpike.table(
  'memberships',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    identityId: uuid('identity_id')
      .notNull()
      .references(() => identities.id),
    permissions: text('permissions').array().notNull(),
  },
  (table) => [primaryKey({ columns: [table.tenantId, table.identityId] })],
);
