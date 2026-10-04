CREATE OR REPLACE FUNCTION onboarding_app.revoke_bootstrap_invitation_command(
  p_issuer text,
  p_subject text,
  p_grant_id uuid,
  p_reason text,
  p_idempotency_key text,
  p_request_fingerprint text,
  p_correlation_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = onboarding_app, pg_catalog, pg_temp
AS $$
DECLARE
  v_principal_id uuid;
  v_existing onboarding_app.bootstrap_invitation_command_receipts%ROWTYPE;
  v_grant onboarding_app.tenant_bootstrap_grants%ROWTYPE;
  v_result jsonb;
BEGIN
  SELECT principal.id INTO v_principal_id
  FROM onboarding_app.platform_principals principal
  JOIN onboarding_app.platform_principal_capabilities capability
    ON capability.principal_id = principal.id
   AND capability.capability = 'bootstrap_invitation.revoke'
   AND capability.revoked_at IS NULL
  WHERE principal.issuer = btrim(p_issuer)
    AND principal.subject = btrim(p_subject);
  IF v_principal_id IS NULL THEN
    RETURN jsonb_build_object('deniedReason', 'resource_missing_or_inaccessible');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    v_principal_id::text || E'\nrevoke\n' || p_idempotency_key,
    0
  ));

  SELECT * INTO v_existing
  FROM onboarding_app.bootstrap_invitation_command_receipts receipt
  WHERE receipt.principal_id = v_principal_id
    AND receipt.command = 'revoke'
    AND receipt.idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_existing.request_fingerprint <> p_request_fingerprint THEN
      RETURN jsonb_build_object('deniedReason', 'idempotency_conflict');
    END IF;
    RETURN v_existing.result;
  END IF;

  SELECT * INTO v_grant
  FROM onboarding_app.tenant_bootstrap_grants bootstrap_grant
  WHERE bootstrap_grant.id = p_grant_id
  FOR UPDATE;
  IF NOT FOUND OR v_grant.status <> 'issued' THEN
    RETURN jsonb_build_object('deniedReason', 'resource_missing_or_inaccessible');
  END IF;

  UPDATE onboarding_app.tenant_bootstrap_grants
  SET status = 'revoked', delivery_status = 'pending', revoked_at = now()
  WHERE id = p_grant_id;
  DELETE FROM onboarding_app.tenant_bootstrap_outbox_events
  WHERE grant_id = p_grant_id
    AND command = 'create'
    AND delivery_state IN ('pending', 'retrying');
  INSERT INTO onboarding_app.tenant_bootstrap_outbox_events (
    id, grant_id, command, delivery_state, correlation_id, idempotency_key
  ) VALUES (
    gen_random_uuid(), p_grant_id, 'revoke', 'pending', p_correlation_id,
    'bootstrap-revoke:' || p_grant_id::text
  );
  INSERT INTO onboarding_app.bootstrap_invitation_audit_records (
    id, actor_principal_id, action, grant_id, result, reason, correlation_id
  ) VALUES (
    gen_random_uuid(), v_principal_id, 'tenant_bootstrap_invitation.revoked',
    p_grant_id, 'success', NULLIF(btrim(p_reason), ''), p_correlation_id
  );

  v_result := jsonb_build_object(
    'invitationId', p_grant_id,
    'destinationEmail', v_grant.destination_email,
    'status', 'revoked',
    'deliveryStatus', 'pending'
  );
  INSERT INTO onboarding_app.bootstrap_invitation_command_receipts (
    principal_id, command, idempotency_key, request_fingerprint, result
  ) VALUES (
    v_principal_id, 'revoke', p_idempotency_key, p_request_fingerprint, v_result
  );
  RETURN v_result;
END;
$$;
