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
  uuid,
} from 'drizzle-orm/pg-core';

export const onboardingApp = pgSchema('onboarding_app');

export const onboardingPlatformPrincipals = onboardingApp.table(
  'platform_principals',
  {
    id: uuid('id').primaryKey(),
    issuer: text('issuer').notNull(),
    subject: text('subject').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique().on(table.issuer, table.subject),
    check(
      'platform_principals_issuer_normalized',
      sql`issuer = btrim(issuer) AND issuer <> ''`,
    ),
    check(
      'platform_principals_subject_normalized',
      sql`subject = btrim(subject) AND subject <> ''`,
    ),
  ],
);

export const onboardingPlatformCapabilities = onboardingApp.table(
  'platform_principal_capabilities',
  {
    principalId: uuid('principal_id')
      .notNull()
      .references(() => onboardingPlatformPrincipals.id),
    capability: text('capability').notNull(),
    grantedAt: timestamp('granted_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.principalId, table.capability] }),
    check(
      'platform_principal_capabilities_known',
      sql`capability IN (
        'bootstrap_invitation.read',
        'bootstrap_invitation.issue',
        'bootstrap_invitation.reissue',
        'bootstrap_invitation.revoke'
      )`,
    ),
  ],
);

export const onboardingBootstrapRateLimits = onboardingApp.table(
  'bootstrap_invitation_rate_limits',
  {
    principalId: uuid('principal_id')
      .primaryKey()
      .references(() => onboardingPlatformPrincipals.id),
    attemptedAt: timestamp('attempted_at', { withTimezone: true })
      .array()
      .notNull()
      .default(sql`ARRAY[]::timestamptz[]`),
  },
);

export const onboardingBootstrapRedemptionRateLimits = onboardingApp.table(
  'bootstrap_redemption_rate_limits',
  {
    issuer: text('issuer').notNull(),
    subject: text('subject').notNull(),
    sessionIdHash: text('session_id_hash').notNull(),
    attemptedAt: timestamp('attempted_at', { withTimezone: true })
      .array()
      .notNull()
      .default(sql`ARRAY[]::timestamptz[]`),
  },
  (table) => [
    primaryKey({ columns: [table.issuer, table.subject, table.sessionIdHash] }),
    check(
      'bootstrap_redemption_rate_limits_principal_normalized',
      sql`issuer = btrim(issuer) AND issuer <> '' AND subject = btrim(subject) AND subject <> ''`,
    ),
    check(
      'bootstrap_redemption_rate_limits_session_hash_format',
      sql`session_id_hash ~ '^[0-9a-f]{64}$'`,
    ),
  ],
);

export const onboardingBootstrapGrants = onboardingApp.table(
  'tenant_bootstrap_grants',
  {
    id: uuid('id').primaryKey(),
    destinationEmail: text('destination_email').notNull(),
    status: text('status').notNull(),
    deliveryStatus: text('delivery_status').notNull(),
    issuedByPrincipalId: uuid('issued_by_principal_id')
      .notNull()
      .references(() => onboardingPlatformPrincipals.id),
    issueReason: text('issue_reason').notNull(),
    requestFingerprint: text('request_fingerprint').notNull(),
    providerInvitationRef: text('provider_invitation_ref'),
    providerStatus: text('provider_status'),
    boundIssuer: text('bound_issuer'),
    boundSubject: text('bound_subject'),
    supersededByGrantId: uuid('superseded_by_grant_id'),
    resultTenantId: uuid('result_tenant_id'),
    resultCenterId: uuid('result_center_id'),
    resultMembershipId: uuid('result_membership_id'),
    completionFingerprint: text('completion_fingerprint'),
    issuedAt: timestamp('issued_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true })
      .notNull()
      .default(sql`now() + interval '7 days'`),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
  },
  (table) => [
    unique().on(table.providerInvitationRef),
    foreignKey({
      columns: [table.supersededByGrantId],
      foreignColumns: [table.id],
    }),
    index('tenant_bootstrap_grants_destination_status_idx').on(
      table.destinationEmail,
      table.status,
    ),
    check(
      'tenant_bootstrap_grants_destination_normalized',
      sql`destination_email = lower(btrim(destination_email)) AND destination_email <> ''`,
    ),
    check(
      'tenant_bootstrap_grants_status_known',
      sql`status IN ('issued', 'consumed', 'revoked', 'expired', 'superseded')`,
    ),
    check(
      'tenant_bootstrap_grants_delivery_status_known',
      sql`delivery_status IN ('pending', 'retrying', 'succeeded', 'dead_letter')`,
    ),
    check(
      'tenant_bootstrap_grants_fingerprint_format',
      sql`request_fingerprint ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      'tenant_bootstrap_grants_completion_fingerprint_format',
      sql`completion_fingerprint IS NULL OR completion_fingerprint ~ '^[0-9a-f]{64}$'`,
    ),
  ],
);

export const onboardingCommandReceipts = onboardingApp.table(
  'bootstrap_invitation_command_receipts',
  {
    principalId: uuid('principal_id')
      .notNull()
      .references(() => onboardingPlatformPrincipals.id),
    command: text('command').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    requestFingerprint: text('request_fingerprint').notNull(),
    result: jsonb('result').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      columns: [table.principalId, table.command, table.idempotencyKey],
    }),
    check(
      'bootstrap_invitation_command_receipts_command_known',
      sql`command IN ('issue', 'reissue', 'revoke')`,
    ),
    check(
      'bootstrap_invitation_command_receipts_fingerprint_format',
      sql`request_fingerprint ~ '^[0-9a-f]{64}$'`,
    ),
  ],
);

export const onboardingAuditRecords = onboardingApp.table(
  'bootstrap_invitation_audit_records',
  {
    id: uuid('id').primaryKey(),
    actorPrincipalId: uuid('actor_principal_id').references(
      () => onboardingPlatformPrincipals.id,
    ),
    action: text('action').notNull(),
    grantId: uuid('grant_id').references(() => onboardingBootstrapGrants.id),
    result: text('result').notNull(),
    reason: text('reason'),
    correlationId: uuid('correlation_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('bootstrap_invitation_audit_actor_created_idx').on(
      table.actorPrincipalId,
      table.createdAt,
    ),
    check(
      'bootstrap_invitation_audit_action_known',
      sql`action IN (
        'tenant_bootstrap_invitation.issued',
        'tenant_bootstrap_invitation.reissued',
        'tenant_bootstrap_invitation.revoked',
        'tenant_bootstrap_invitation.delivery_failed',
        'tenant_bootstrap.completed',
        'tenant_bootstrap.denied'
      )`,
    ),
    check(
      'bootstrap_invitation_audit_result_known',
      sql`result IN ('success', 'denied', 'failed')`,
    ),
  ],
);

export const onboardingOutboxEvents = onboardingApp.table(
  'tenant_bootstrap_outbox_events',
  {
    id: uuid('id').primaryKey(),
    grantId: uuid('grant_id')
      .notNull()
      .references(() => onboardingBootstrapGrants.id),
    command: text('command').notNull(),
    deliveryState: text('delivery_state').notNull(),
    attemptCount: integer('attempt_count').notNull().default(0),
    correlationId: uuid('correlation_id').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => [
    unique().on(table.idempotencyKey),
    index('tenant_bootstrap_outbox_claim_idx').on(
      table.deliveryState,
      table.nextAttemptAt,
      table.createdAt,
    ),
    check(
      'tenant_bootstrap_outbox_command_known',
      sql`command IN ('create', 'revoke')`,
    ),
    check(
      'tenant_bootstrap_outbox_delivery_state_known',
      sql`delivery_state IN ('pending', 'retrying', 'succeeded', 'dead_letter')`,
    ),
    check(
      'tenant_bootstrap_outbox_attempt_count_valid',
      sql`attempt_count BETWEEN 0 AND 8`,
    ),
  ],
);
