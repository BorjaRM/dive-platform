SELECT set_config('app.tenant_id', '00000000-0000-0000-0000-000000000000', true);
--> statement-breakpoint
CREATE TABLE "booking_app"."channels" (
	"id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"center_id" uuid NOT NULL,
	"public_id" text NOT NULL,
	"type" text NOT NULL,
	"activity_id" uuid NOT NULL,
	"status" text NOT NULL,
	"confirmation_mode" text NOT NULL DEFAULT 'immediate',
	"allowed_origins" text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "channels_tenant_id_id_pk" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "channels_tenant_center_id_unique" UNIQUE("tenant_id","center_id","id"),
	CONSTRAINT "channels_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "channels_type_known" CHECK (type IN ('single_activity')),
	CONSTRAINT "channels_status_known" CHECK (status IN ('Draft', 'Published', 'Disabled')),
	CONSTRAINT "channels_confirmation_mode_known" CHECK (confirmation_mode IN ('immediate', 'staff_approval')),
	CONSTRAINT "channels_allowed_origins_nonempty" CHECK (cardinality(allowed_origins) > 0 AND NOT ('*' = ANY(allowed_origins)))
);
--> statement-breakpoint
CREATE TABLE "booking_app"."bookings" (
	"id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"center_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"slot_id" uuid NOT NULL,
	"booking_channel" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"status" text NOT NULL,
	"seats" integer NOT NULL,
	"locale" text NOT NULL,
	"booker_first_name" text NOT NULL,
	"booker_last_name" text NOT NULL,
	"booker_email" text NOT NULL,
	"booker_phone" text,
	"hold_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookings_tenant_id_id_pk" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "bookings_tenant_center_id_unique" UNIQUE("tenant_id","center_id","id"),
	CONSTRAINT "bookings_tenant_channel_idempotency_unique" UNIQUE("tenant_id","channel_id","idempotency_key"),
	CONSTRAINT "bookings_channel_known" CHECK (booking_channel IN ('public_hosted')),
	CONSTRAINT "bookings_status_known" CHECK (status IN ('Pending', 'Confirmed', 'Rejected', 'Cancelled', 'Expired')),
	CONSTRAINT "bookings_seats_positive" CHECK (seats > 0),
	CONSTRAINT "bookings_locale_known" CHECK (locale IN ('es', 'en')),
	CONSTRAINT "bookings_contact_nonempty" CHECK (btrim(booker_first_name) <> '' AND btrim(booker_last_name) <> '' AND btrim(booker_email) <> '')
);
--> statement-breakpoint
CREATE TABLE "booking_app"."capability_verifiers" (
	"id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"booking_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"version" integer NOT NULL,
	"verifier_hash" text NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "capability_verifiers_tenant_id_id_pk" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "capability_verifiers_booking_purpose_version_unique" UNIQUE("tenant_id","booking_id","purpose","version"),
	CONSTRAINT "capability_verifiers_purpose_known" CHECK (purpose IN ('booking_confirmation_read', 'booking_cancel')),
	CONSTRAINT "capability_verifiers_version_positive" CHECK (version > 0),
	CONSTRAINT "capability_verifiers_hash_nonempty" CHECK (btrim(verifier_hash) <> '')
);
--> statement-breakpoint
ALTER TABLE "booking_app"."channels" ADD CONSTRAINT "channels_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "iam_app"."tenants"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "booking_app"."channels" ADD CONSTRAINT "channels_tenant_id_center_id_centers_tenant_id_id_fk" FOREIGN KEY ("tenant_id","center_id") REFERENCES "iam_app"."centers"("tenant_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "booking_app"."channels" ADD CONSTRAINT "channels_tenant_id_center_id_activity_id_activities_tenant_id_center_id_id_fk" FOREIGN KEY ("tenant_id","center_id","activity_id") REFERENCES "booking_app"."activities"("tenant_id","center_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "booking_app"."slots" ADD CONSTRAINT "slots_tenant_center_id_unique" UNIQUE("tenant_id","center_id","id");
--> statement-breakpoint
ALTER TABLE "booking_app"."bookings" ADD CONSTRAINT "bookings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "iam_app"."tenants"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "booking_app"."bookings" ADD CONSTRAINT "bookings_tenant_id_center_id_channel_id_channels_tenant_id_center_id_id_fk" FOREIGN KEY ("tenant_id","center_id","channel_id") REFERENCES "booking_app"."channels"("tenant_id","center_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "booking_app"."bookings" ADD CONSTRAINT "bookings_tenant_id_center_id_slot_id_slots_tenant_id_center_id_id_fk" FOREIGN KEY ("tenant_id","center_id","slot_id") REFERENCES "booking_app"."slots"("tenant_id","center_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "booking_app"."capability_verifiers" ADD CONSTRAINT "capability_verifiers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "iam_app"."tenants"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "booking_app"."capability_verifiers" ADD CONSTRAINT "capability_verifiers_tenant_id_booking_id_bookings_tenant_id_id_fk" FOREIGN KEY ("tenant_id","booking_id") REFERENCES "booking_app"."bookings"("tenant_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "channels_tenant_center_status_idx" ON "booking_app"."channels" USING btree ("tenant_id","center_id","status");
--> statement-breakpoint
CREATE INDEX "bookings_tenant_slot_status_idx" ON "booking_app"."bookings" USING btree ("tenant_id","slot_id","status");
--> statement-breakpoint
CREATE INDEX "bookings_tenant_channel_created_idx" ON "booking_app"."bookings" USING btree ("tenant_id","channel_id","created_at");
--> statement-breakpoint
CREATE INDEX "capability_verifiers_lookup_idx" ON "booking_app"."capability_verifiers" USING btree ("tenant_id","booking_id","purpose","verifier_hash");
--> statement-breakpoint
ALTER TABLE "iam_app"."audit_records" ALTER COLUMN "actor_identity_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "booking_app"."channels" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "booking_app"."channels" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "booking_app"."bookings" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "booking_app"."bookings" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "booking_app"."capability_verifiers" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "booking_app"."capability_verifiers" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY channels_isolation ON "booking_app"."channels"
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    OR public_id = current_setting('app.public_channel_id', true)
  )
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY bookings_isolation ON "booking_app"."bookings"
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY capability_verifiers_isolation ON "booking_app"."capability_verifiers"
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint
GRANT USAGE ON SCHEMA booking_app TO dive_app;
--> statement-breakpoint
REVOKE ALL ON booking_app.channels, booking_app.bookings, booking_app.capability_verifiers FROM dive_app;
--> statement-breakpoint
GRANT SELECT, UPDATE (confirmation_mode) ON booking_app.channels TO dive_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE (status) ON booking_app.bookings TO dive_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE (consumed_at, revoked_at) ON booking_app.capability_verifiers TO dive_app;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION booking_app.resolve_public_channel(p_public_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = booking_app, iam_app, pg_temp AS $$
DECLARE
  resolved booking_app.channels%ROWTYPE;
BEGIN
  IF p_public_id IS NULL OR btrim(p_public_id) = '' THEN
    RETURN NULL;
  END IF;

  PERFORM set_config('app.public_channel_id', p_public_id, true);
  SELECT * INTO resolved
  FROM booking_app.channels
  WHERE public_id = p_public_id
    AND status = 'Published'
    AND type = 'single_activity';

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  PERFORM set_config('app.tenant_id', resolved.tenant_id::text, true);
  IF NOT EXISTS (
    SELECT 1
    FROM booking_app.activities
    WHERE tenant_id = resolved.tenant_id
      AND center_id = resolved.center_id
      AND id = resolved.activity_id
      AND status = 'Published'
  ) THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'tenantId', resolved.tenant_id,
    'channelId', resolved.id,
    'centerId', resolved.center_id,
    'publicId', resolved.public_id,
    'type', resolved.type,
    'activityId', resolved.activity_id,
    'allowedOrigins', resolved.allowed_origins,
    'confirmationMode', resolved.confirmation_mode
  );
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION booking_app.resolve_public_channel(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION booking_app.resolve_public_channel(text) TO dive_app;
