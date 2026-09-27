CREATE OR REPLACE FUNCTION iam_app.record_booking_catalog_mutation(
  p_tenant_id uuid,
  p_actor_identity_id uuid,
  p_action text,
  p_resource_type text,
  p_resource_id uuid,
  p_event_type text,
  p_payload jsonb,
  p_correlation_id uuid,
  p_idempotency_key text
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = iam_app, pg_temp AS $$
BEGIN
  IF current_setting('app.tenant_id', true) IS DISTINCT FROM p_tenant_id::text THEN
    RAISE EXCEPTION 'Tenant context mismatch' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM iam_app.memberships
    WHERE tenant_id = p_tenant_id
      AND identity_id = p_actor_identity_id
      AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Catalog actor is not an active tenant member' USING ERRCODE = '42501';
  END IF;

  INSERT INTO iam_app.audit_records (
    id, tenant_id, actor_identity_id, action, resource_type, resource_id,
    result, correlation_id
  ) VALUES (
    gen_random_uuid(), p_tenant_id, p_actor_identity_id, p_action,
    p_resource_type, p_resource_id, 'success', p_correlation_id
  );

  INSERT INTO iam_app.outbox_events (
    id, tenant_id, event_type, payload, correlation_id, idempotency_key
  ) VALUES (
    gen_random_uuid(), p_tenant_id, p_event_type, p_payload,
    p_correlation_id, p_idempotency_key
  );
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION iam_app.record_booking_catalog_mutation(uuid, uuid, text, text, uuid, text, jsonb, uuid, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION iam_app.record_booking_catalog_mutation(uuid, uuid, text, text, uuid, text, jsonb, uuid, text) TO dive_app;
