CREATE TABLE "booking_app"."catalog_settings" (
	"tenant_id" uuid NOT NULL,
	"center_id" uuid NOT NULL,
	"default_activity_locale" text NOT NULL,
	CONSTRAINT "catalog_settings_tenant_id_center_id_pk" PRIMARY KEY("tenant_id","center_id"),
	CONSTRAINT "catalog_settings_locale_known" CHECK (default_activity_locale IN ('es', 'en')),
	CONSTRAINT "catalog_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "iam_app"."tenants"("id"),
	CONSTRAINT "catalog_settings_tenant_id_center_id_centers_tenant_id_id_fk" FOREIGN KEY ("tenant_id","center_id") REFERENCES "iam_app"."centers"("tenant_id","id")
);
--> statement-breakpoint
ALTER TABLE "booking_app"."activities" ADD COLUMN "base_locale" text NOT NULL;--> statement-breakpoint
ALTER TABLE "booking_app"."activities" ADD CONSTRAINT "activities_base_locale_known" CHECK (base_locale IN ('es', 'en'));--> statement-breakpoint
ALTER TABLE booking_app.catalog_settings ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE booking_app.catalog_settings FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY catalog_settings_isolation ON booking_app.catalog_settings
USING (tenant_id = current_setting('app.tenant_id')::uuid)
WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);--> statement-breakpoint
GRANT SELECT, INSERT ON booking_app.catalog_settings TO dive_app;--> statement-breakpoint
CREATE OR REPLACE FUNCTION iam_app.record_booking_catalog_mutation(
	p_tenant_id uuid, p_actor_identity_id uuid, p_action text,
	p_resource_type text, p_resource_id uuid, p_event_type text,
	p_payload jsonb, p_correlation_id uuid, p_idempotency_key text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = iam_app, booking_app, pg_catalog, pg_temp
AS $$
BEGIN
	IF current_setting('app.tenant_id', true) IS DISTINCT FROM p_tenant_id::text THEN
		RAISE EXCEPTION 'Tenant context mismatch' USING ERRCODE = '42501';
	END IF;
	IF NOT EXISTS (
		SELECT 1 FROM iam_app.memberships
		WHERE tenant_id = p_tenant_id
			AND identity_id = p_actor_identity_id AND status = 'active'
	) THEN
		RAISE EXCEPTION 'Catalog actor is not an active tenant member' USING ERRCODE = '42501';
	END IF;
	IF p_event_type IS NULL THEN
		IF p_resource_type IS DISTINCT FROM 'catalog_settings'
			OR p_action IS DISTINCT FROM 'booking.update'
			OR p_idempotency_key IS NOT NULL
			OR NOT EXISTS (
				SELECT 1 FROM booking_app.catalog_settings
				WHERE tenant_id = p_tenant_id AND center_id = p_resource_id
			)
		THEN
			RAISE EXCEPTION 'Audit-only mutation requires center catalog settings' USING ERRCODE = '42501';
		END IF;
	END IF;
	INSERT INTO iam_app.audit_records (
		id, tenant_id, actor_identity_id, action, resource_type, resource_id,
		result, source_metadata, correlation_id
	) VALUES (
		gen_random_uuid(), p_tenant_id, p_actor_identity_id, p_action,
		p_resource_type, p_resource_id, 'success',
		CASE WHEN p_event_type IS NULL THEN p_payload ELSE NULL END,
		p_correlation_id
	);
	IF p_event_type IS NOT NULL THEN
		INSERT INTO iam_app.outbox_events (
			id, tenant_id, event_type, payload, correlation_id, idempotency_key
		) VALUES (
			gen_random_uuid(), p_tenant_id, p_event_type, p_payload,
			p_correlation_id, p_idempotency_key
		);
	END IF;
END $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION iam_app.record_booking_catalog_mutation(uuid, uuid, text, text, uuid, text, jsonb, uuid, text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION iam_app.record_booking_catalog_mutation(uuid, uuid, text, text, uuid, text, jsonb, uuid, text) TO dive_app;