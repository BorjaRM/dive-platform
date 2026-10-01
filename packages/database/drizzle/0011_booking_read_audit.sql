CREATE FUNCTION iam_app.record_booking_read(
  p_tenant_id uuid, p_actor_identity_id uuid, p_center_id uuid,
  p_resource_type text, p_resource_id uuid, p_result text,
  p_reason text, p_correlation_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = iam_app, booking_app, pg_catalog, pg_temp
AS $$
DECLARE
  related_slot_id uuid;
BEGIN
  IF current_setting('app.tenant_id', true) IS DISTINCT FROM p_tenant_id::text THEN
    RAISE EXCEPTION 'Tenant context mismatch' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM iam_app.memberships
    WHERE tenant_id = p_tenant_id AND identity_id = p_actor_identity_id AND status = 'active'
  ) OR NOT EXISTS (
    SELECT 1 FROM iam_app.centers WHERE tenant_id = p_tenant_id AND id = p_center_id
  ) THEN
    RAISE EXCEPTION 'Read audit scope is inaccessible' USING ERRCODE = '42501';
  END IF;
  IF p_resource_type IS NULL OR p_resource_type NOT IN ('center', 'slot', 'booking') OR
     p_result IS NULL OR p_result NOT IN ('success', 'denied') OR
     (p_result = 'success' AND p_reason IS NOT NULL) OR
     (p_result = 'denied' AND p_reason IS NULL) THEN
    RAISE EXCEPTION 'Invalid read audit' USING ERRCODE = '42501';
  END IF;
  IF p_result = 'success' THEN
    IF p_resource_type = 'center' THEN
      IF p_resource_id IS DISTINCT FROM p_center_id THEN
        RAISE EXCEPTION 'Read audit resource is inaccessible' USING ERRCODE = '42501';
      END IF;
    ELSIF p_resource_type = 'slot' THEN
      IF NOT EXISTS (
        SELECT 1 FROM booking_app.slots
        WHERE tenant_id = p_tenant_id AND center_id = p_center_id AND id = p_resource_id
      ) THEN
        RAISE EXCEPTION 'Read audit resource is inaccessible' USING ERRCODE = '42501';
      END IF;
    ELSE
      SELECT slot_id INTO related_slot_id FROM booking_app.bookings
      WHERE tenant_id = p_tenant_id AND center_id = p_center_id AND id = p_resource_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Read audit resource is inaccessible' USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;
  INSERT INTO iam_app.audit_records (
    id, tenant_id, actor_identity_id, action, resource_type, resource_id,
    result, reason, purpose, source_metadata, correlation_id
  ) VALUES (
    gen_random_uuid(), p_tenant_id, p_actor_identity_id,
    CASE WHEN p_resource_type = 'booking' THEN 'customer_contact.read' ELSE 'booking.read' END,
    p_resource_type, p_resource_id, p_result, p_reason,
    CASE WHEN p_resource_type = 'center' THEN 'calendar_operations' ELSE 'booking_operations' END,
    jsonb_strip_nulls(jsonb_build_object('centerId', p_center_id, 'slotId', related_slot_id)),
    p_correlation_id
  );
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION iam_app.record_booking_read(uuid, uuid, uuid, text, uuid, text, text, uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION iam_app.record_booking_read(uuid, uuid, uuid, text, uuid, text, text, uuid) TO dive_app;