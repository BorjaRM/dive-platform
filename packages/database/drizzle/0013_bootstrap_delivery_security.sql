ALTER TABLE onboarding_app.bootstrap_invitation_audit_records
  VALIDATE CONSTRAINT bootstrap_invitation_audit_mutation_reason_required;
--> statement-breakpoint
UPDATE onboarding_app.bootstrap_invitation_command_receipts receipt
SET result = receipt.result || jsonb_build_object(
  'destinationEmail', bootstrap_grant.destination_email
)
FROM onboarding_app.tenant_bootstrap_grants bootstrap_grant
WHERE receipt.result->>'invitationId' = bootstrap_grant.id::text
  AND NOT receipt.result ? 'destinationEmail';
--> statement-breakpoint
CREATE OR REPLACE FUNCTION onboarding_app.claim_bootstrap_outbox_event()
RETURNS TABLE (
  event_id uuid,
  grant_id uuid,
  command text,
  destination_email text,
  provider_invitation_ref text,
  attempt_count integer,
  correlation_id uuid
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = onboarding_app, pg_catalog, pg_temp
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
BEGIN
  UPDATE onboarding_app.tenant_bootstrap_grants bootstrap_grant
  SET status = 'expired'
  WHERE bootstrap_grant.status = 'issued'
    AND bootstrap_grant.expires_at <= v_now;

  DELETE FROM onboarding_app.tenant_bootstrap_outbox_events event
  USING onboarding_app.tenant_bootstrap_grants bootstrap_grant
  WHERE event.grant_id = bootstrap_grant.id
    AND event.command = 'create'
    AND event.delivery_state IN ('pending', 'retrying')
    AND bootstrap_grant.status = 'expired';

  RETURN QUERY
  SELECT event.id, event.grant_id, event.command,
    bootstrap_grant.destination_email,
    bootstrap_grant.provider_invitation_ref,
    event.attempt_count, event.correlation_id
  FROM onboarding_app.tenant_bootstrap_outbox_events event
  JOIN onboarding_app.tenant_bootstrap_grants bootstrap_grant
    ON bootstrap_grant.id = event.grant_id
  WHERE event.delivery_state IN ('pending', 'retrying')
    AND event.next_attempt_at <= v_now
    AND (
      event.command = 'revoke'
      OR (
        event.command = 'create'
        AND bootstrap_grant.status = 'issued'
        AND bootstrap_grant.expires_at > v_now
        AND NOT EXISTS (
          SELECT 1
          FROM onboarding_app.tenant_bootstrap_grants previous_grant
          WHERE previous_grant.superseded_by_grant_id = bootstrap_grant.id
            AND NOT EXISTS (
              SELECT 1
              FROM onboarding_app.tenant_bootstrap_outbox_events revocation
              WHERE revocation.grant_id = previous_grant.id
                AND revocation.command = 'revoke'
                AND revocation.idempotency_key =
                  'bootstrap-revoke:' || previous_grant.id::text || ':' || bootstrap_grant.id::text
                AND revocation.delivery_state = 'succeeded'
            )
        )
      )
    )
  ORDER BY event.created_at,
    CASE event.command WHEN 'revoke' THEN 0 ELSE 1 END,
    event.id
  LIMIT 1
  FOR UPDATE OF event SKIP LOCKED;
END;
$$;