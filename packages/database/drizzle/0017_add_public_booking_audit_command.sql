CREATE OR REPLACE FUNCTION iam_app.record_public_booking_created(
  p_tenant_id uuid,
  p_booking_id uuid,
  p_correlation_id uuid
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = iam_app, booking_app, pg_temp AS $$
DECLARE
  booking_record booking_app.bookings%ROWTYPE;
BEGIN
  IF current_setting('app.tenant_id', true) IS DISTINCT FROM p_tenant_id::text THEN
    RAISE EXCEPTION 'Tenant context mismatch' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO booking_record
  FROM booking_app.bookings
  WHERE tenant_id = p_tenant_id
    AND id = p_booking_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Public booking is not visible in tenant context' USING ERRCODE = '42501';
  END IF;

  INSERT INTO iam_app.audit_records (
    id, tenant_id, actor_identity_id, action, resource_type, resource_id,
    result, purpose, source_metadata, correlation_id
  ) VALUES (
    gen_random_uuid(), p_tenant_id, NULL, 'booking.create', 'booking',
    p_booking_id, 'success', booking_record.booking_channel,
    jsonb_build_object('channelId', booking_record.channel_id), p_correlation_id
  );

  INSERT INTO iam_app.outbox_events (
    id, tenant_id, event_type, payload, correlation_id, idempotency_key
  ) VALUES (
    gen_random_uuid(), p_tenant_id, 'booking.public_created.v1',
    jsonb_build_object(
      'bookingId', p_booking_id,
      'email', booking_record.booker_email,
      'locale', booking_record.locale,
      'status', booking_record.status,
      'purpose', 'booking_confirmation_read'
    ),
    p_correlation_id,
    'booking.public-created.email:' || p_booking_id::text
  );
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION iam_app.record_public_booking_created(uuid, uuid, uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION iam_app.record_public_booking_created(uuid, uuid, uuid) TO dive_app;