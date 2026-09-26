import { sql } from 'drizzle-orm';
import {
  check,
  jsonb,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

export const iamApp = pgSchema('iam_app');

export const iamTenants = iamApp.table('tenants', {
  id: uuid('id').primaryKey(),
  name: text('name').notNull(),
});

export const iamIdentities = iamApp.table('identities', {
  id: uuid('id').primaryKey(),
});

export const iamExternalIdentities = iamApp.table(
  'external_identities',
  {
    identityId: uuid('identity_id')
      .notNull()
      .references(() => iamIdentities.id),
    issuer: text('issuer').notNull(),
    subject: text('subject').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.issuer, table.subject] }),
    unique().on(table.identityId, table.issuer),
  ],
);

export const iamCenters = iamApp.table(
  'centers',
  {
    id: uuid('id').notNull(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => iamTenants.id),
    name: text('name').notNull(),
  },
  (table) => [primaryKey({ columns: [table.tenantId, table.id] })],
);

export const iamMemberships = iamApp.table(
  'memberships',
  {
    id: uuid('id').notNull(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => iamTenants.id),
    identityId: uuid('identity_id')
      .notNull()
      .references(() => iamIdentities.id),
    status: text('status').notNull(),
    roles: text('roles').array().notNull(),
    centerIds: uuid('center_ids').array(),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.id] }),
    unique().on(table.tenantId, table.identityId),
    check(
      'memberships_status_known',
      sql`status IN ('pending', 'active', 'disabled')`,
    ),
    check(
      'memberships_roles_known',
      sql`cardinality(roles) > 0 AND roles <@ ARRAY[
        'tenant_owner',
        'tenant_admin',
        'operations_lead',
        'auditor_compliance',
        'center_manager',
        'reception_booking_manager',
        'external_collaborator'
      ]::text[]`,
    ),
  ],
);

export const iamAuditRecords = iamApp.table(
  'audit_records',
  {
    id: uuid('id').notNull(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => iamTenants.id),
    actorIdentityId: uuid('actor_identity_id').notNull(),
    action: text('action').notNull(),
    resourceType: text('resource_type').notNull(),
    resourceId: uuid('resource_id').notNull(),
    result: text('result').notNull(),
    reason: text('reason'),
    correlationId: uuid('correlation_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.tenantId, table.id] })],
);

export const iamOutboxEvents = iamApp.table(
  'outbox_events',
  {
    id: uuid('id').notNull(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => iamTenants.id),
    eventType: text('event_type').notNull(),
    payload: jsonb('payload').notNull(),
    correlationId: uuid('correlation_id').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.id] }),
    unique().on(table.tenantId, table.idempotencyKey),
  ],
);
