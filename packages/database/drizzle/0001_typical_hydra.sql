CREATE SCHEMA "onboarding_app";
--> statement-breakpoint
CREATE TABLE "onboarding_app"."bootstrap_invitation_audit_records" (
	"id" uuid PRIMARY KEY NOT NULL,
	"actor_principal_id" uuid,
	"action" text NOT NULL,
	"grant_id" uuid,
	"result" text NOT NULL,
	"reason" text,
	"correlation_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bootstrap_invitation_audit_action_known" CHECK (action IN (
        'tenant_bootstrap_invitation.issued',
        'tenant_bootstrap_invitation.reissued',
        'tenant_bootstrap_invitation.revoked',
        'tenant_bootstrap_invitation.delivery_failed',
        'tenant_bootstrap.denied'
      )),
	CONSTRAINT "bootstrap_invitation_audit_result_known" CHECK (result IN ('success', 'denied', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "onboarding_app"."tenant_bootstrap_grants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"destination_email" text NOT NULL,
	"status" text NOT NULL,
	"delivery_status" text NOT NULL,
	"issued_by_principal_id" uuid NOT NULL,
	"issue_reason" text NOT NULL,
	"request_fingerprint" text NOT NULL,
	"provider_invitation_ref" text,
	"provider_status" text,
	"bound_issuer" text,
	"bound_subject" text,
	"superseded_by_grant_id" uuid,
	"result_tenant_id" uuid,
	"result_center_id" uuid,
	"result_membership_id" uuid,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone DEFAULT now() + interval '7 days' NOT NULL,
	"revoked_at" timestamp with time zone,
	"consumed_at" timestamp with time zone,
	CONSTRAINT "tenant_bootstrap_grants_provider_invitation_ref_unique" UNIQUE("provider_invitation_ref"),
	CONSTRAINT "tenant_bootstrap_grants_destination_normalized" CHECK (destination_email = lower(btrim(destination_email)) AND destination_email <> ''),
	CONSTRAINT "tenant_bootstrap_grants_status_known" CHECK (status IN ('issued', 'consumed', 'revoked', 'expired', 'superseded')),
	CONSTRAINT "tenant_bootstrap_grants_delivery_status_known" CHECK (delivery_status IN ('pending', 'retrying', 'succeeded', 'dead_letter')),
	CONSTRAINT "tenant_bootstrap_grants_fingerprint_format" CHECK (request_fingerprint ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "onboarding_app"."bootstrap_invitation_command_receipts" (
	"principal_id" uuid NOT NULL,
	"command" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_fingerprint" text NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bootstrap_invitation_command_receipts_principal_id_command_idempotency_key_pk" PRIMARY KEY("principal_id","command","idempotency_key"),
	CONSTRAINT "bootstrap_invitation_command_receipts_command_known" CHECK (command IN ('issue', 'reissue', 'revoke')),
	CONSTRAINT "bootstrap_invitation_command_receipts_fingerprint_format" CHECK (request_fingerprint ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "onboarding_app"."tenant_bootstrap_outbox_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"grant_id" uuid NOT NULL,
	"command" text NOT NULL,
	"delivery_state" text NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"correlation_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "tenant_bootstrap_outbox_events_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "tenant_bootstrap_outbox_command_known" CHECK (command IN ('create', 'revoke')),
	CONSTRAINT "tenant_bootstrap_outbox_delivery_state_known" CHECK (delivery_state IN ('pending', 'retrying', 'succeeded', 'dead_letter')),
	CONSTRAINT "tenant_bootstrap_outbox_attempt_count_valid" CHECK (attempt_count BETWEEN 0 AND 8)
);
--> statement-breakpoint
CREATE TABLE "onboarding_app"."platform_principal_capabilities" (
	"principal_id" uuid NOT NULL,
	"capability" text NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "platform_principal_capabilities_principal_id_capability_pk" PRIMARY KEY("principal_id","capability"),
	CONSTRAINT "platform_principal_capabilities_known" CHECK (capability IN (
        'bootstrap_invitation.read',
        'bootstrap_invitation.issue',
        'bootstrap_invitation.reissue',
        'bootstrap_invitation.revoke'
      ))
);
--> statement-breakpoint
CREATE TABLE "onboarding_app"."platform_principals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"issuer" text NOT NULL,
	"subject" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_principals_issuer_subject_unique" UNIQUE("issuer","subject"),
	CONSTRAINT "platform_principals_issuer_normalized" CHECK (issuer = btrim(issuer) AND issuer <> ''),
	CONSTRAINT "platform_principals_subject_normalized" CHECK (subject = btrim(subject) AND subject <> '')
);
--> statement-breakpoint
ALTER TABLE "onboarding_app"."bootstrap_invitation_audit_records" ADD CONSTRAINT "bootstrap_invitation_audit_records_actor_principal_id_platform_principals_id_fk" FOREIGN KEY ("actor_principal_id") REFERENCES "onboarding_app"."platform_principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_app"."bootstrap_invitation_audit_records" ADD CONSTRAINT "bootstrap_invitation_audit_records_grant_id_tenant_bootstrap_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "onboarding_app"."tenant_bootstrap_grants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_app"."tenant_bootstrap_grants" ADD CONSTRAINT "tenant_bootstrap_grants_issued_by_principal_id_platform_principals_id_fk" FOREIGN KEY ("issued_by_principal_id") REFERENCES "onboarding_app"."platform_principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_app"."bootstrap_invitation_command_receipts" ADD CONSTRAINT "bootstrap_invitation_command_receipts_principal_id_platform_principals_id_fk" FOREIGN KEY ("principal_id") REFERENCES "onboarding_app"."platform_principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_app"."tenant_bootstrap_outbox_events" ADD CONSTRAINT "tenant_bootstrap_outbox_events_grant_id_tenant_bootstrap_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "onboarding_app"."tenant_bootstrap_grants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_app"."platform_principal_capabilities" ADD CONSTRAINT "platform_principal_capabilities_principal_id_platform_principals_id_fk" FOREIGN KEY ("principal_id") REFERENCES "onboarding_app"."platform_principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bootstrap_invitation_audit_actor_created_idx" ON "onboarding_app"."bootstrap_invitation_audit_records" USING btree ("actor_principal_id","created_at");--> statement-breakpoint
CREATE INDEX "tenant_bootstrap_grants_destination_status_idx" ON "onboarding_app"."tenant_bootstrap_grants" USING btree ("destination_email","status");--> statement-breakpoint
CREATE INDEX "tenant_bootstrap_outbox_claim_idx" ON "onboarding_app"."tenant_bootstrap_outbox_events" USING btree ("delivery_state","next_attempt_at","created_at");