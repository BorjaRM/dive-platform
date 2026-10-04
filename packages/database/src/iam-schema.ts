import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
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
    check(
      'external_identities_issuer_normalized',
      sql`issuer = btrim(issuer) AND issuer <> ''`,
    ),
    check(
      'external_identities_subject_normalized',
      sql`subject = btrim(subject) AND subject <> ''`,
    ),
  ],
);

export const iamIdentityWebhookInbox = iamApp.table(
  'identity_webhook_inbox',
  {
    providerEventId: text('provider_event_id').notNull(),
    issuer: text('issuer').notNull(),
    eventType: text('event_type').notNull(),
    subject: text('subject'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }),
    resolvedIdentityId: uuid('resolved_identity_id').references(
      () => iamIdentities.id,
    ),
    processingResult: text('processing_result').notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.issuer, table.providerEventId] }),
    check(
      'identity_webhook_inbox_result_known',
      sql`processing_result IN ('applied', 'ignored', 'unresolved')`,
    ),
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
    timeZone: text('time_zone'),
  },
  (table) => [primaryKey({ columns: [table.tenantId, table.id] })],
);

export const iamCenterEntries = iamApp.table(
  'center_entries',
  {
    centerKey: text('center_key').primaryKey(),
    status: text('status').notNull().default('active'),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => iamTenants.id),
    centerId: uuid('center_id').notNull(),
  },
  (table) => [
    unique().on(table.tenantId, table.centerId),
    foreignKey({
      columns: [table.tenantId, table.centerId],
      foreignColumns: [iamCenters.tenantId, iamCenters.id],
    }),
    check(
      'center_entries_key_format',
      sql`center_key ~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$'`,
    ),
    check('center_entries_status_known', sql`status IN ('active', 'disabled')`),
  ],
);

export const iamMemberships = iamApp.table(
  'memberships',
  {
    id: uuid('id').notNull(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => iamTenants.id),
    identityId: uuid('identity_id').references(() => iamIdentities.id),
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

export const iamIdentityTenants = iamApp.table(
  'identity_tenants',
  {
    identityId: uuid('identity_id')
      .notNull()
      .references(() => iamIdentities.id),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => iamTenants.id),
  },
  (table) => [primaryKey({ columns: [table.identityId, table.tenantId] })],
);

export const iamIdentityPreferences = iamApp.table(
  'identity_preferences',
  {
    identityId: uuid('identity_id')
      .primaryKey()
      .references(() => iamIdentities.id),
    locale: text('locale').notNull(),
  },
  () => [
    check('identity_preferences_locale_known', sql`locale IN ('es', 'en')`),
  ],
);

export const iamTenantContexts = iamApp.table(
  'tenant_contexts',
  {
    handleHash: text('handle_hash').primaryKey(),
    identityId: uuid('identity_id')
      .notNull()
      .references(() => iamIdentities.id),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => iamTenants.id),
    sessionIdHash: text('session_id_hash').notNull(),
    issuedAt: timestamp('issued_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  () => [
    check(
      'tenant_contexts_handle_hash_format',
      sql`handle_hash ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      'tenant_contexts_session_id_hash_format',
      sql`session_id_hash ~ '^[0-9a-f]{64}$'`,
    ),
  ],
);

export const iamInvitations = iamApp.table(
  'invitations',
  {
    id: uuid('id').notNull(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => iamTenants.id),
    membershipId: uuid('membership_id').notNull(),
    targetAddress: text('target_address').notNull(),
    targetAddressCanonical: text('target_address_canonical').notNull(),
    credentialHash: text('credential_hash').notNull(),
    invitationAttemptId: uuid('invitation_attempt_id').notNull(),
    providerKind: text('provider_kind'),
    providerInvitationId: text('provider_invitation_id'),
    status: text('status').notNull(),
    deliveryStatus: text('delivery_status').notNull().default(sql`'pending'`),
    deliveryAttemptCount: integer('delivery_attempt_count')
      .notNull()
      .default(sql`0`),
    deliveryNextAttemptAt: timestamp('delivery_next_attempt_at', {
      withTimezone: true,
    }),
    providerStatus: text('provider_status'),
    supersededByInvitationId: uuid('superseded_by_invitation_id'),
    supersessionReason: text('supersession_reason'),
    idempotencyKey: text('idempotency_key').notNull(),
    issuedAt: timestamp('issued_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true })
      .notNull()
      .default(sql`now() + interval '7 days'`),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.id] }),
    uniqueIndex('invitations_pending_target_address_canonical_idx')
      .on(table.tenantId, table.targetAddressCanonical)
      .where(sql`status = 'pending' AND target_address_canonical <> ''`),
    unique().on(table.credentialHash),
    unique().on(table.invitationAttemptId),
    unique().on(table.providerInvitationId),
    unique().on(table.tenantId, table.idempotencyKey),
    foreignKey({
      columns: [table.tenantId, table.membershipId],
      foreignColumns: [iamMemberships.tenantId, iamMemberships.id],
    }),
    check(
      'invitations_status_known',
      sql`status IN ('pending', 'accepted', 'rejected', 'revoked', 'expired')`,
    ),
    check(
      'invitations_delivery_status_known',
      sql`delivery_status IN ('pending', 'retrying', 'succeeded', 'dead_letter')`,
    ),
    check(
      'invitations_delivery_attempt_count_valid',
      sql`delivery_attempt_count >= 0`,
    ),
    check(
      'invitations_provider_kind_known',
      sql`provider_kind IS NULL OR provider_kind = 'clerk'`,
    ),
    check(
      'invitations_supersession_consistent',
      sql`(superseded_by_invitation_id IS NULL AND supersession_reason IS NULL)
        OR (superseded_by_invitation_id IS NOT NULL
          AND supersession_reason IN ('latest_wins', 'explicit_reissue'))`,
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
    actorIdentityId: uuid('actor_identity_id'),
    action: text('action').notNull(),
    resourceType: text('resource_type').notNull(),
    resourceId: uuid('resource_id').notNull(),
    result: text('result').notNull(),
    reason: text('reason'),
    purpose: text('purpose'),
    sourceMetadata: jsonb('source_metadata'),
    correlationId: uuid('correlation_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.id] }),
    check(
      'audit_action_known',
      sql`action IN (
        'membership.invite',
        'membership.disable',
        'center_entry.enable',
        'center_entry.disable',
        'booking.create',
        'booking.read',
        'booking.update',
        'booking.activity.updated',
        'booking.confirm',
        'booking.cancel',
        'customer_contact.read',
        'support.tenant.read',
        'identity.webhook.apply'
      )`,
    ),
    check(
      'audit_result_reason_valid',
      sql`(result = 'success' AND reason IS NULL) OR
        (result = 'denied' AND reason IN (
          'authentication_missing_or_invalid',
          'membership_missing_or_inactive',
          'permission_missing',
          'scope_mismatch',
          'resource_missing_or_inaccessible',
          'resource_state_invalid',
          'credential_invalid_or_expired',
          'duplicate_or_replayed',
          'assurance_insufficient',
          'support_grant_invalid',
          'last_owner',
          'invariant_violation'
        ))`,
    ),
  ],
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
    deliveryStatus: text('delivery_status').notNull().default(sql`'pending'`),
    deliveryAttemptCount: integer('delivery_attempt_count')
      .notNull()
      .default(sql`0`),
    deliveryNextAttemptAt: timestamp('delivery_next_attempt_at', {
      withTimezone: true,
    }),
    providerStatus: text('provider_status'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.id] }),
    unique().on(table.tenantId, table.idempotencyKey),
    index('outbox_invitation_claim_idx')
      .on(table.createdAt, table.id)
      .where(
        sql`${table.eventType} IN ('iam.invitation.issued.v1', 'iam.invitation.revoked.v1') AND ${table.deliveryStatus} IN ('pending', 'retrying')`,
      ),
    check(
      'outbox_delivery_status_known',
      sql`delivery_status IN ('pending', 'retrying', 'succeeded', 'dead_letter')`,
    ),
    check(
      'outbox_delivery_attempt_count_valid',
      sql`delivery_attempt_count >= 0`,
    ),
  ],
);
