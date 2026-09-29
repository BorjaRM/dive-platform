ALTER TABLE "iam_app"."audit_records" DROP CONSTRAINT "audit_action_known";--> statement-breakpoint
ALTER TABLE "iam_app"."center_entries" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "iam_app"."audit_records" ADD CONSTRAINT "audit_action_known" CHECK (action IN (
        'membership.invite',
        'membership.disable',
        'center_entry.enable',
        'center_entry.disable',
        'booking.create',
        'booking.read',
        'booking.update',
        'booking.confirm',
        'booking.cancel',
        'customer_contact.read',
        'support.tenant.read',
        'identity.webhook.apply'
      ));--> statement-breakpoint
ALTER TABLE "iam_app"."center_entries" ADD CONSTRAINT "center_entries_status_known" CHECK (status IN ('active', 'disabled'));--> statement-breakpoint
CREATE OR REPLACE FUNCTION iam_app.resolve_center_entry_command(p_center_key text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = iam_app, pg_catalog, pg_temp
AS $$
DECLARE
  resolved iam_app.center_entries%ROWTYPE;
BEGIN
  IF p_center_key IS NULL
    OR p_center_key <> btrim(p_center_key)
    OR p_center_key !~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$'
    OR p_center_key = ANY(ARRAY[
      'www', 'app', 'api', 'admin', 'mail', 'staging', 'preview', 'static', 'assets'
    ])
  THEN
    RETURN NULL;
  END IF;

  PERFORM set_config('app.center_entry_key', p_center_key, true);

  SELECT * INTO resolved
  FROM iam_app.center_entries
  WHERE center_key = p_center_key AND status = 'active'
  FOR KEY SHARE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'tenantId', resolved.tenant_id,
    'centerId', resolved.center_id
  );
END $$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION iam_app.set_center_entry_status_command(
  p_issuer text,
  p_subject text,
  p_tenant_id uuid,
  p_center_id uuid,
  p_status text,
  p_purpose text,
  p_correlation_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = iam_app, pg_catalog, pg_temp
AS $$
DECLARE
  v_actor_identity_id uuid;
  v_actor_roles text[];
  v_center_key text;
  v_previous_status text;
  v_changed boolean;
  v_action text;
  v_purpose text;
BEGIN
  IF p_issuer IS NULL
    OR NULLIF(btrim(p_issuer), '') IS NULL
    OR p_subject IS NULL
    OR NULLIF(btrim(p_subject), '') IS NULL
    OR p_tenant_id IS NULL
    OR p_center_id IS NULL
    OR p_status IS NULL
    OR p_status NOT IN ('active', 'disabled')
    OR p_purpose IS NULL
    OR NULLIF(btrim(p_purpose), '') IS NULL
    OR p_correlation_id IS NULL
  THEN
    RETURN jsonb_build_object('deniedReason', 'invariant_violation');
  END IF;
  v_purpose := btrim(p_purpose);
  v_action := CASE WHEN p_status = 'active'
    THEN 'center_entry.enable'
    ELSE 'center_entry.disable'
  END;
  PERFORM set_config('app.tenant_id', p_tenant_id::text, true);

  SELECT external_identity.identity_id, membership.roles
  INTO v_actor_identity_id, v_actor_roles
  FROM iam_app.external_identities AS external_identity
  JOIN iam_app.memberships AS membership
    ON membership.identity_id = external_identity.identity_id
    AND membership.tenant_id = p_tenant_id
    AND membership.status = 'active'
  WHERE external_identity.issuer = p_issuer
    AND external_identity.subject = p_subject;

  IF v_actor_identity_id IS NULL THEN
    INSERT INTO iam_app.audit_records (
      id, tenant_id, actor_identity_id, action, resource_type, resource_id,
      result, reason, purpose, correlation_id
    ) VALUES (
      gen_random_uuid(), p_tenant_id, NULL, v_action,
      'center_entry', p_center_id, 'denied', 'membership_missing_or_inactive',
      v_purpose, p_correlation_id
    );
    RETURN jsonb_build_object('deniedReason', 'membership_missing_or_inactive');
  END IF;
  IF v_actor_roles @> ARRAY['external_collaborator']::text[]
    OR NOT (v_actor_roles && ARRAY['tenant_owner', 'tenant_admin']::text[]) THEN
    INSERT INTO iam_app.audit_records (
      id, tenant_id, actor_identity_id, action, resource_type, resource_id,
      result, reason, purpose, correlation_id
    ) VALUES (
      gen_random_uuid(), p_tenant_id, v_actor_identity_id, v_action,
      'center_entry', p_center_id, 'denied', 'permission_missing',
      v_purpose, p_correlation_id
    );
    RETURN jsonb_build_object('deniedReason', 'permission_missing');
  END IF;

  SELECT center_key, status
  INTO v_center_key, v_previous_status
  FROM iam_app.center_entries
  WHERE tenant_id = p_tenant_id AND center_id = p_center_id
  FOR UPDATE;
  IF v_center_key IS NULL THEN
    INSERT INTO iam_app.audit_records (
      id, tenant_id, actor_identity_id, action, resource_type, resource_id,
      result, reason, purpose, correlation_id
    ) VALUES (
      gen_random_uuid(), p_tenant_id, v_actor_identity_id, v_action,
      'center_entry', p_center_id, 'denied', 'resource_missing_or_inaccessible',
      v_purpose, p_correlation_id
    );
    RETURN jsonb_build_object('deniedReason', 'resource_missing_or_inaccessible');
  END IF;

  v_changed := v_previous_status IS DISTINCT FROM p_status;
  IF v_changed THEN
    UPDATE iam_app.center_entries
    SET status = p_status
    WHERE tenant_id = p_tenant_id AND center_id = p_center_id;
  END IF;
  INSERT INTO iam_app.audit_records (
    id, tenant_id, actor_identity_id, action, resource_type, resource_id,
    result, purpose, source_metadata, correlation_id
  ) VALUES (
    gen_random_uuid(), p_tenant_id, v_actor_identity_id, v_action,
    'center_entry', p_center_id, 'success', v_purpose,
    jsonb_build_object(
      'centerKey', v_center_key,
      'previousStatus', v_previous_status,
      'newStatus', p_status,
      'changed', v_changed
    ), p_correlation_id
  );
  RETURN jsonb_build_object('status', p_status, 'changed', v_changed);
END $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION iam_app.set_center_entry_status_command(text, text, uuid, uuid, text, text, uuid) FROM PUBLIC;--> statement-breakpoint
GRANT ALL ON FUNCTION iam_app.set_center_entry_status_command(text, text, uuid, uuid, text, text, uuid) TO dive_app;