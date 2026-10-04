ALTER TABLE booking_app.activities ADD COLUMN revision bigint NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE booking_app.activities ADD CONSTRAINT activities_revision_positive CHECK (revision > 0);
--> statement-breakpoint
ALTER TABLE iam_app.audit_records DROP CONSTRAINT audit_action_known;
--> statement-breakpoint
ALTER TABLE iam_app.audit_records ADD CONSTRAINT audit_action_known CHECK (action IN (
  'membership.invite', 'membership.disable', 'center_entry.enable', 'center_entry.disable',
  'booking.create', 'booking.read', 'booking.update', 'booking.activity.updated',
  'booking.confirm', 'booking.cancel', 'customer_contact.read', 'support.tenant.read',
  'identity.webhook.apply'
));
--> statement-breakpoint
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
  IF p_action = 'booking.activity.updated' AND
    (p_resource_type IS DISTINCT FROM 'activity' OR p_event_type IS NOT NULL) THEN
    RAISE EXCEPTION 'Activity content updates are audit-only' USING ERRCODE = '42501';
  END IF;
  IF p_event_type IS NULL THEN
    IF p_idempotency_key IS NOT NULL THEN
      RAISE EXCEPTION 'Audit-only mutation cannot enqueue an event' USING ERRCODE = '42501';
    END IF;
    IF p_resource_type = 'catalog_settings' AND p_action = 'booking.update' THEN
      IF NOT EXISTS (
        SELECT 1 FROM booking_app.catalog_settings
        WHERE tenant_id = p_tenant_id AND center_id = p_resource_id
      ) THEN
        RAISE EXCEPTION 'Catalog settings not found' USING ERRCODE = '42501';
      END IF;
    ELSIF p_resource_type = 'activity' AND p_action = 'booking.activity.updated' THEN
      IF NOT EXISTS (
        SELECT 1 FROM booking_app.activities
        WHERE tenant_id = p_tenant_id AND id = p_resource_id
      ) THEN
        RAISE EXCEPTION 'Activity not found' USING ERRCODE = '42501';
      END IF;
    ELSE
      RAISE EXCEPTION 'Unsupported audit-only mutation' USING ERRCODE = '42501';
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
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION iam_app.record_booking_catalog_mutation(uuid, uuid, text, text, uuid, text, jsonb, uuid, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION iam_app.record_booking_catalog_mutation(uuid, uuid, text, text, uuid, text, jsonb, uuid, text) TO dive_app;