CREATE OR REPLACE FUNCTION iam_app.issue_membership_invitation_command(p_issuer text, p_subject text, p_tenant_id uuid, p_invitation_id uuid, p_membership_id uuid, p_target_address text, p_roles text[], p_center_ids uuid[], p_credential_hash text, p_idempotency_key text, p_reissue_invitation_id uuid, p_correlation_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'iam_app', 'pg_temp'
    AS $$
DECLARE
  v_actor_identity_id uuid;
  v_actor_roles text[];
  v_reissue_roles text[];
BEGIN
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
    RETURN jsonb_build_object('deniedReason', 'membership_missing_or_inactive');
  END IF;
  IF v_actor_roles @> ARRAY['external_collaborator']::text[]
    OR NOT (v_actor_roles && ARRAY['tenant_owner', 'tenant_admin']::text[]) THEN
    RETURN iam_app.issue_invitation_command(
      p_issuer, p_subject, p_tenant_id, p_invitation_id, p_membership_id,
      p_target_address, p_roles, p_center_ids, p_credential_hash,
      p_idempotency_key, p_reissue_invitation_id, p_correlation_id
    );
  END IF;

  IF p_roles @> ARRAY['tenant_owner']::text[] THEN
    INSERT INTO iam_app.audit_records (
      id, tenant_id, actor_identity_id, action, resource_type, resource_id,
      result, reason, correlation_id
    ) VALUES (
      gen_random_uuid(), p_tenant_id, v_actor_identity_id, 'membership.invite',
      'invitation', p_invitation_id, 'denied', 'permission_missing', p_correlation_id
    );
    RETURN jsonb_build_object('deniedReason', 'permission_missing');
  END IF;

  IF p_reissue_invitation_id IS NOT NULL THEN
    SELECT membership.roles INTO v_reissue_roles
    FROM iam_app.invitations AS invitation
    JOIN iam_app.memberships AS membership
      ON membership.tenant_id = invitation.tenant_id
      AND membership.id = invitation.membership_id
    WHERE invitation.tenant_id = p_tenant_id
      AND invitation.id = p_reissue_invitation_id
      AND invitation.status = 'pending'
    FOR UPDATE OF invitation;
    IF v_reissue_roles @> ARRAY['tenant_owner']::text[] THEN
      INSERT INTO iam_app.audit_records (
        id, tenant_id, actor_identity_id, action, resource_type, resource_id,
        result, reason, correlation_id
      ) VALUES (
        gen_random_uuid(), p_tenant_id, v_actor_identity_id, 'membership.invite',
        'invitation', p_invitation_id, 'denied', 'permission_missing', p_correlation_id
      );
      RETURN jsonb_build_object('deniedReason', 'permission_missing');
    END IF;
  END IF;

  RETURN iam_app.issue_invitation_command(
    p_issuer, p_subject, p_tenant_id, p_invitation_id, p_membership_id,
    p_target_address, p_roles, p_center_ids, p_credential_hash,
    p_idempotency_key, p_reissue_invitation_id, p_correlation_id
  );
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION iam_app.revoke_membership_invitation_command(p_issuer text, p_subject text, p_tenant_id uuid, p_invitation_id uuid, p_correlation_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'iam_app', 'pg_temp'
    AS $$
DECLARE
  v_actor_identity_id uuid;
  v_actor_roles text[];
  v_invitation_status text;
  v_invited_roles text[];
BEGIN
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
    RETURN jsonb_build_object('deniedReason', 'membership_missing_or_inactive');
  END IF;
  IF v_actor_roles @> ARRAY['external_collaborator']::text[]
    OR NOT (v_actor_roles && ARRAY['tenant_owner', 'tenant_admin']::text[]) THEN
    RETURN iam_app.revoke_invitation_command(
      p_issuer, p_subject, p_tenant_id, p_invitation_id, p_correlation_id
    );
  END IF;

  SELECT invitation.status, membership.roles
  INTO v_invitation_status, v_invited_roles
  FROM iam_app.invitations AS invitation
  JOIN iam_app.memberships AS membership
    ON membership.tenant_id = invitation.tenant_id
    AND membership.id = invitation.membership_id
  WHERE invitation.tenant_id = p_tenant_id
    AND invitation.id = p_invitation_id
  FOR UPDATE OF invitation;
  IF v_invitation_status = 'pending'
    AND v_invited_roles @> ARRAY['tenant_owner']::text[] THEN
    INSERT INTO iam_app.audit_records (
      id, tenant_id, actor_identity_id, action, resource_type, resource_id,
      result, reason, correlation_id
    ) VALUES (
      gen_random_uuid(), p_tenant_id, v_actor_identity_id, 'membership.disable',
      'invitation', p_invitation_id, 'denied', 'permission_missing', p_correlation_id
    );
    RETURN jsonb_build_object('deniedReason', 'permission_missing');
  END IF;

  RETURN iam_app.revoke_invitation_command(
    p_issuer, p_subject, p_tenant_id, p_invitation_id, p_correlation_id
  );
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION iam_app.revoke_owner_invitation_command(p_issuer text, p_subject text, p_tenant_id uuid, p_invitation_id uuid, p_correlation_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'iam_app', 'pg_temp'
    AS $$
DECLARE
  v_actor_identity_id uuid;
  v_actor_roles text[];
  v_invitation_status text;
  v_invited_roles text[];
BEGIN
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
    RETURN jsonb_build_object('deniedReason', 'membership_missing_or_inactive');
  END IF;
  IF NOT (v_actor_roles @> ARRAY['tenant_owner']::text[]) THEN
    INSERT INTO iam_app.audit_records (
      id, tenant_id, actor_identity_id, action, resource_type, resource_id,
      result, reason, correlation_id
    ) VALUES (
      gen_random_uuid(), p_tenant_id, v_actor_identity_id, 'membership.disable',
      'invitation', p_invitation_id, 'denied', 'permission_missing', p_correlation_id
    );
    RETURN jsonb_build_object('deniedReason', 'permission_missing');
  END IF;

  SELECT invitation.status, membership.roles
  INTO v_invitation_status, v_invited_roles
  FROM iam_app.invitations AS invitation
  JOIN iam_app.memberships AS membership
    ON membership.tenant_id = invitation.tenant_id
    AND membership.id = invitation.membership_id
  WHERE invitation.tenant_id = p_tenant_id
    AND invitation.id = p_invitation_id
  FOR UPDATE OF invitation;
  IF v_invitation_status = 'pending'
    AND v_invited_roles @> ARRAY['tenant_owner']::text[] THEN
    RETURN iam_app.revoke_invitation_command(
      p_issuer, p_subject, p_tenant_id, p_invitation_id, p_correlation_id
    );
  END IF;

  INSERT INTO iam_app.audit_records (
    id, tenant_id, actor_identity_id, action, resource_type, resource_id,
    result, reason, correlation_id
  ) VALUES (
    gen_random_uuid(), p_tenant_id, v_actor_identity_id, 'membership.disable',
    'invitation', p_invitation_id, 'denied', 'permission_missing', p_correlation_id
  );
  RETURN jsonb_build_object('deniedReason', 'permission_missing');
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION iam_app.issue_membership_invitation_command(
  text, text, uuid, uuid, uuid, text, text[], uuid[], text, text, uuid, uuid
) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION iam_app.issue_membership_invitation_command(
  text, text, uuid, uuid, uuid, text, text[], uuid[], text, text, uuid, uuid
) TO dive_app;
--> statement-breakpoint
REVOKE ALL ON FUNCTION iam_app.revoke_membership_invitation_command(
  text, text, uuid, uuid, uuid
) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION iam_app.revoke_membership_invitation_command(
  text, text, uuid, uuid, uuid
) TO dive_app;
--> statement-breakpoint
REVOKE ALL ON FUNCTION iam_app.revoke_owner_invitation_command(
  text, text, uuid, uuid, uuid
) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION iam_app.revoke_owner_invitation_command(
  text, text, uuid, uuid, uuid
) TO dive_app;