--
-- PostgreSQL database dump
--


-- Dumped from database version 18.6 (Debian 18.6-1.pgdg13+2)
-- Dumped by pg_dump version 18.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: booking_app; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA booking_app;


--
-- Name: iam_app; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA iam_app;


--
-- Name: resolve_public_channel(text); Type: FUNCTION; Schema: booking_app; Owner: -
--

CREATE FUNCTION booking_app.resolve_public_channel(p_public_id text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'booking_app', 'iam_app', 'pg_temp'
    AS $$
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


--
-- Name: apply_identity_webhook_command(text, text, text, text, timestamp with time zone, uuid, text); Type: FUNCTION; Schema: iam_app; Owner: -
--

CREATE FUNCTION iam_app.apply_identity_webhook_command(p_provider_event_id text, p_issuer text, p_event_type text, p_subject text, p_occurred_at timestamp with time zone, p_correlation_id uuid, p_session_id_hash text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'iam_app', 'pg_temp'
    AS $_$
DECLARE
	v_identity_id uuid;
	v_processing_result text;
	v_inserted_count integer;
	v_updated_count integer;
	v_affected_tenant_count integer := 0;
	v_tenant_id uuid;
	v_previous_tenant_id text := current_setting('app.tenant_id', true);
BEGIN
	IF NULLIF(btrim(p_provider_event_id), '') IS NULL
		OR NULLIF(btrim(p_issuer), '') IS NULL
		OR NULLIF(btrim(p_event_type), '') IS NULL THEN
		RAISE EXCEPTION 'Invalid identity webhook envelope' USING ERRCODE = '22023';
	END IF;

	INSERT INTO iam_app.identity_webhook_inbox (
		provider_event_id, issuer, event_type, subject, occurred_at, processing_result
	) VALUES (
		p_provider_event_id, p_issuer, p_event_type, p_subject, p_occurred_at, 'ignored'
	) ON CONFLICT (issuer, provider_event_id) DO NOTHING;
	GET DIAGNOSTICS v_inserted_count = ROW_COUNT;

	IF v_inserted_count = 0 THEN
		SELECT processing_result INTO v_processing_result
		FROM iam_app.identity_webhook_inbox
		WHERE issuer = p_issuer AND provider_event_id = p_provider_event_id;
		RETURN jsonb_build_object(
			'duplicate', true,
			'processingResult', v_processing_result,
			'affectedTenantCount', 0
		);
	END IF;

	IF p_subject IS NOT NULL THEN
		SELECT identity_id INTO v_identity_id
		FROM iam_app.external_identities
		WHERE issuer = p_issuer AND subject = p_subject;
	END IF;

	IF p_subject IS NOT NULL AND v_identity_id IS NULL THEN
		UPDATE iam_app.identity_webhook_inbox SET processing_result = 'unresolved'
		WHERE issuer = p_issuer AND provider_event_id = p_provider_event_id;
		RETURN jsonb_build_object(
			'duplicate', false,
			'processingResult', 'unresolved',
			'affectedTenantCount', 0
		);
	END IF;

	IF p_event_type IN ('session.revoked', 'session.ended', 'session.removed')
		AND v_identity_id IS NOT NULL
		AND p_session_id_hash IS NOT NULL
		AND p_session_id_hash ~ '^[0-9a-f]{64}$' THEN
		FOR v_tenant_id IN
			SELECT tenant_link.tenant_id
			FROM iam_app.identity_tenants AS tenant_link
			WHERE tenant_link.identity_id = v_identity_id
			ORDER BY tenant_link.tenant_id
		LOOP
			PERFORM set_config('app.tenant_id', v_tenant_id::text, true);
			UPDATE iam_app.tenant_contexts
			SET revoked_at = clock_timestamp()
			WHERE tenant_id = v_tenant_id
				AND identity_id = v_identity_id
				AND session_id_hash = p_session_id_hash
				AND revoked_at IS NULL;
			GET DIAGNOSTICS v_updated_count = ROW_COUNT;
			IF v_updated_count > 0 THEN
				v_affected_tenant_count := v_affected_tenant_count + 1;
			END IF;
		END LOOP;
		PERFORM set_config('app.tenant_id', COALESCE(v_previous_tenant_id, ''), true);
		UPDATE iam_app.identity_webhook_inbox
		SET resolved_identity_id = v_identity_id, processing_result = 'applied'
		WHERE issuer = p_issuer AND provider_event_id = p_provider_event_id;
		RETURN jsonb_build_object(
			'duplicate', false,
			'processingResult', 'applied',
			'affectedTenantCount', v_affected_tenant_count
		);
	END IF;

	IF p_event_type <> 'user.deleted' OR v_identity_id IS NULL THEN
		UPDATE iam_app.identity_webhook_inbox
		SET resolved_identity_id = v_identity_id, processing_result = 'ignored'
		WHERE issuer = p_issuer AND provider_event_id = p_provider_event_id;
		RETURN jsonb_build_object(
			'duplicate', false,
			'processingResult', 'ignored',
			'affectedTenantCount', 0
		);
	END IF;

	FOR v_tenant_id IN
		SELECT tenant_link.tenant_id
		FROM iam_app.identity_tenants AS tenant_link
		WHERE tenant_link.identity_id = v_identity_id
		ORDER BY tenant_link.tenant_id
	LOOP
		PERFORM set_config('app.tenant_id', v_tenant_id::text, true);
		INSERT INTO iam_app.audit_records (
			id, tenant_id, actor_identity_id, action, resource_type, resource_id,
			result, source_metadata, correlation_id
		) VALUES (
			gen_random_uuid(), v_tenant_id, v_identity_id,
			'identity.webhook.apply', 'identity', v_identity_id, 'success',
			jsonb_build_object(
				'provider', 'clerk',
				'eventType', p_event_type,
				'providerEventId', p_provider_event_id
			),
			p_correlation_id
		);
		INSERT INTO iam_app.outbox_events (
			id, tenant_id, event_type, payload, correlation_id, idempotency_key
		) VALUES (
			gen_random_uuid(), v_tenant_id, 'iam.identity.provider_deletion_recorded.v1',
			jsonb_build_object(
				'identityId', v_identity_id,
				'providerEventId', p_provider_event_id
			),
			p_correlation_id,
			'identity.webhook:' || p_issuer || ':' || p_provider_event_id
		);
		v_affected_tenant_count := v_affected_tenant_count + 1;
	END LOOP;
	PERFORM set_config('app.tenant_id', COALESCE(v_previous_tenant_id, ''), true);

	UPDATE iam_app.identity_webhook_inbox
	SET resolved_identity_id = v_identity_id, processing_result = 'applied'
	WHERE issuer = p_issuer AND provider_event_id = p_provider_event_id;
	RETURN jsonb_build_object(
		'duplicate', false,
		'processingResult', 'applied',
		'affectedTenantCount', v_affected_tenant_count
	);
END $_$;


--
-- Name: cleanup_revoked_tenant_contexts_command(); Type: FUNCTION; Schema: iam_app; Owner: -
--

CREATE FUNCTION iam_app.cleanup_revoked_tenant_contexts_command() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'iam_app', 'pg_temp'
    AS $$
DECLARE
	v_deleted_count integer;
	v_tenant_deleted_count integer;
	v_tenant_id uuid;
	v_previous_tenant_id text := current_setting('app.tenant_id', true);
BEGIN
	v_deleted_count := 0;
	FOR v_tenant_id IN
		SELECT DISTINCT tenant_link.tenant_id
		FROM iam_app.identity_tenants AS tenant_link
		ORDER BY tenant_link.tenant_id
	LOOP
		PERFORM set_config('app.tenant_id', v_tenant_id::text, true);
		DELETE FROM iam_app.tenant_contexts
		WHERE tenant_id = v_tenant_id
			AND revoked_at IS NOT NULL
			AND revoked_at < clock_timestamp() - interval '30 days';
		GET DIAGNOSTICS v_tenant_deleted_count = ROW_COUNT;
		v_deleted_count := v_deleted_count + v_tenant_deleted_count;
	END LOOP;
	PERFORM set_config('app.tenant_id', COALESCE(v_previous_tenant_id, ''), true);
	RETURN v_deleted_count;
END $$;


--
-- Name: disable_membership_command(text, text, uuid, uuid, uuid); Type: FUNCTION; Schema: iam_app; Owner: -
--

CREATE FUNCTION iam_app.disable_membership_command(p_issuer text, p_subject text, p_tenant_id uuid, p_membership_id uuid, p_correlation_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'iam_app', 'pg_temp'
    AS $$
DECLARE
  v_actor_identity_id uuid;
  v_actor_roles text[];
  v_target_roles text[];
  v_target_status text;
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
    INSERT INTO iam_app.audit_records (
      id, tenant_id, actor_identity_id, action, resource_type, resource_id,
      result, reason, correlation_id
    ) VALUES (
      gen_random_uuid(), p_tenant_id, v_actor_identity_id, 'membership.disable',
      'membership', p_membership_id, 'denied', 'permission_missing', p_correlation_id
    );
    RETURN jsonb_build_object('deniedReason', 'permission_missing');
  END IF;

  SELECT roles, status INTO v_target_roles, v_target_status
  FROM iam_app.memberships
  WHERE tenant_id = p_tenant_id AND id = p_membership_id
  FOR UPDATE;
  IF v_target_status IS DISTINCT FROM 'active' THEN
    INSERT INTO iam_app.audit_records (
      id, tenant_id, actor_identity_id, action, resource_type, resource_id,
      result, reason, correlation_id
    ) VALUES (
      gen_random_uuid(), p_tenant_id, v_actor_identity_id, 'membership.disable',
      'membership', p_membership_id, 'denied', 'resource_missing_or_inaccessible', p_correlation_id
    );
    RETURN jsonb_build_object('deniedReason', 'resource_missing_or_inaccessible');
  END IF;

  IF v_target_roles @> ARRAY['tenant_owner']::text[] THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text, 0));
    IF (
      SELECT count(*) FROM iam_app.memberships
      WHERE tenant_id = p_tenant_id
        AND status = 'active'
        AND roles @> ARRAY['tenant_owner']::text[]
    ) <= 1 THEN
      INSERT INTO iam_app.audit_records (
        id, tenant_id, actor_identity_id, action, resource_type, resource_id,
        result, reason, correlation_id
      ) VALUES (
        gen_random_uuid(), p_tenant_id, v_actor_identity_id, 'membership.disable',
        'membership', p_membership_id, 'denied', 'last_owner', p_correlation_id
      );
      RETURN jsonb_build_object('deniedReason', 'last_owner');
    END IF;
  END IF;

  UPDATE iam_app.memberships SET status = 'disabled'
  WHERE tenant_id = p_tenant_id AND id = p_membership_id;
  INSERT INTO iam_app.audit_records (
    id, tenant_id, actor_identity_id, action, resource_type, resource_id,
    result, correlation_id
  ) VALUES (
    gen_random_uuid(), p_tenant_id, v_actor_identity_id, 'membership.disable',
    'membership', p_membership_id, 'success', p_correlation_id
  );
  INSERT INTO iam_app.outbox_events (
    id, tenant_id, event_type, payload, correlation_id, idempotency_key
  ) VALUES (
    gen_random_uuid(), p_tenant_id, 'iam.membership.disabled.v1',
    jsonb_build_object('membershipId', p_membership_id), p_correlation_id,
    'membership.disable:' || p_membership_id::text
  );
  RETURN jsonb_build_object('status', 'disabled');
END $$;


--
-- Name: enforce_invitation_transition(); Type: FUNCTION; Schema: iam_app; Owner: -
--

CREATE FUNCTION iam_app.enforce_invitation_transition() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'iam_app', 'pg_temp'
    AS $$
BEGIN
  IF OLD.tenant_id IS DISTINCT FROM NEW.tenant_id
    OR OLD.membership_id IS DISTINCT FROM NEW.membership_id
    OR OLD.target_address IS DISTINCT FROM NEW.target_address
    OR OLD.credential_hash IS DISTINCT FROM NEW.credential_hash
    OR OLD.idempotency_key IS DISTINCT FROM NEW.idempotency_key
    OR OLD.issued_at IS DISTINCT FROM NEW.issued_at
    OR OLD.expires_at IS DISTINCT FROM NEW.expires_at THEN
    RAISE EXCEPTION 'Invitation proposal is immutable' USING ERRCODE = '23514';
  END IF;
  IF OLD.status IS DISTINCT FROM NEW.status
    AND (OLD.status <> 'pending' OR NEW.status NOT IN ('accepted', 'rejected', 'revoked', 'expired')) THEN
    RAISE EXCEPTION 'Invalid invitation transition' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;


--
-- Name: enforce_membership_lifecycle(); Type: FUNCTION; Schema: iam_app; Owner: -
--

CREATE FUNCTION iam_app.enforce_membership_lifecycle() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'iam_app', 'pg_temp'
    AS $$
BEGIN
  IF NEW.status IN ('pending', 'active')
    AND NEW.roles @> ARRAY['external_collaborator']::text[] THEN
    RAISE EXCEPTION 'External collaborator assignments are disabled' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'INSERT' AND NEW.status = 'pending' AND NEW.identity_id IS NOT NULL THEN
    RAISE EXCEPTION 'Pending membership must be unbound' USING ERRCODE = '23514';
  END IF;
  IF NEW.status = 'active' AND NEW.identity_id IS NULL THEN
    RAISE EXCEPTION 'Active membership must be bound' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'pending' AND (
    OLD.tenant_id IS DISTINCT FROM NEW.tenant_id
    OR OLD.roles IS DISTINCT FROM NEW.roles
    OR OLD.center_ids IS DISTINCT FROM NEW.center_ids
  ) THEN
    RAISE EXCEPTION 'Pending membership proposal is immutable' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'pending' AND NEW.status = 'pending'
    AND OLD.identity_id IS DISTINCT FROM NEW.identity_id THEN
    RAISE EXCEPTION 'Pending membership cannot be bound before acceptance' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;


--
-- Name: issue_invitation_command(text, text, uuid, uuid, uuid, text, text[], uuid[], text, text, uuid, uuid); Type: FUNCTION; Schema: iam_app; Owner: -
--

CREATE FUNCTION iam_app.issue_invitation_command(p_issuer text, p_subject text, p_tenant_id uuid, p_invitation_id uuid, p_membership_id uuid, p_target_address text, p_roles text[], p_center_ids uuid[], p_credential_hash text, p_idempotency_key text, p_reissue_invitation_id uuid, p_correlation_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'iam_app', 'pg_temp'
    AS $$
DECLARE
	v_actor_identity_id uuid;
	v_actor_roles text[];
	v_existing iam_app.invitations%ROWTYPE;
	v_existing_roles text[];
	v_existing_center_ids uuid[];
	v_reissue iam_app.invitations%ROWTYPE;
	v_issued iam_app.invitations%ROWTYPE;
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
		INSERT INTO iam_app.audit_records (
			id, tenant_id, actor_identity_id, action, resource_type, resource_id,
			result, reason, correlation_id
		) VALUES (
			gen_random_uuid(), p_tenant_id, v_actor_identity_id, 'membership.invite',
			'invitation', p_invitation_id, 'denied', 'permission_missing', p_correlation_id
		);
		RETURN jsonb_build_object('deniedReason', 'permission_missing');
	END IF;

	PERFORM pg_advisory_xact_lock(
		hashtextextended(p_tenant_id::text || E'\n' || p_idempotency_key, 0)
	);
	SELECT invitation.* INTO v_existing FROM iam_app.invitations AS invitation
	WHERE tenant_id = p_tenant_id AND idempotency_key = p_idempotency_key;
	IF FOUND THEN
		SELECT roles, center_ids INTO v_existing_roles, v_existing_center_ids
		FROM iam_app.memberships
		WHERE tenant_id = p_tenant_id AND id = v_existing.membership_id;
		IF v_existing.target_address IS DISTINCT FROM p_target_address
			OR v_existing_roles IS DISTINCT FROM p_roles
			OR v_existing_center_ids IS DISTINCT FROM p_center_ids THEN
			INSERT INTO iam_app.audit_records (
				id, tenant_id, actor_identity_id, action, resource_type, resource_id,
				result, reason, correlation_id
			) VALUES (
				gen_random_uuid(), p_tenant_id, v_actor_identity_id, 'membership.invite',
				'invitation', v_existing.id, 'denied', 'invariant_violation', p_correlation_id
			);
			RETURN jsonb_build_object('deniedReason', 'invariant_violation');
		END IF;
		RETURN jsonb_build_object(
			'invitationId', v_existing.id,
			'membershipId', v_existing.membership_id,
			'status', v_existing.status,
			'deliveryStatus', 'queued',
			'expiresAt', v_existing.expires_at,
			'created', false
		);
	END IF;

	IF cardinality(p_roles) = 0
		OR p_roles IS NULL
		OR p_center_ids IS NULL
		OR NOT (p_roles <@ ARRAY[
			'tenant_owner', 'tenant_admin', 'operations_lead', 'auditor_compliance',
			'center_manager', 'reception_booking_manager'
		]::text[]) THEN
		INSERT INTO iam_app.audit_records (
			id, tenant_id, actor_identity_id, action, resource_type, resource_id,
			result, reason, correlation_id
		) VALUES (
			gen_random_uuid(), p_tenant_id, v_actor_identity_id, 'membership.invite',
			'invitation', p_invitation_id, 'denied', 'invariant_violation', p_correlation_id
		);
		RETURN jsonb_build_object('deniedReason', 'invariant_violation');
	END IF;

	IF EXISTS (
		SELECT 1
		FROM unnest(p_center_ids) AS assigned(center_id)
		LEFT JOIN iam_app.centers AS center
			ON center.tenant_id = p_tenant_id AND center.id = assigned.center_id
		WHERE center.id IS NULL
	) THEN
		INSERT INTO iam_app.audit_records (
			id, tenant_id, actor_identity_id, action, resource_type, resource_id,
			result, reason, correlation_id
		) VALUES (
			gen_random_uuid(), p_tenant_id, v_actor_identity_id, 'membership.invite',
			'invitation', p_invitation_id, 'denied', 'resource_missing_or_inaccessible', p_correlation_id
		);
		RETURN jsonb_build_object('deniedReason', 'resource_missing_or_inaccessible');
	END IF;

	IF p_reissue_invitation_id IS NOT NULL THEN
		SELECT * INTO v_reissue FROM iam_app.invitations
		WHERE tenant_id = p_tenant_id AND id = p_reissue_invitation_id
		FOR UPDATE;
		IF v_reissue.status IS DISTINCT FROM 'pending' THEN
			INSERT INTO iam_app.audit_records (
				id, tenant_id, actor_identity_id, action, resource_type, resource_id,
				result, reason, correlation_id
			) VALUES (
				gen_random_uuid(), p_tenant_id, v_actor_identity_id, 'membership.invite',
				'invitation', p_invitation_id, 'denied', 'resource_missing_or_inaccessible', p_correlation_id
			);
			RETURN jsonb_build_object('deniedReason', 'resource_missing_or_inaccessible');
		END IF;
		UPDATE iam_app.invitations SET status = 'revoked'
		WHERE tenant_id = p_tenant_id AND id = v_reissue.id;
		UPDATE iam_app.memberships SET status = 'disabled'
		WHERE tenant_id = p_tenant_id AND id = v_reissue.membership_id;
		INSERT INTO iam_app.outbox_events (
			id, tenant_id, event_type, payload, correlation_id, idempotency_key
		) VALUES (
			gen_random_uuid(), p_tenant_id, 'iam.invitation.revoked.v1',
			jsonb_build_object('invitationId', v_reissue.id, 'membershipId', v_reissue.membership_id),
			p_correlation_id, 'invitation.reissue.revoked:' || v_reissue.id::text
		);
	END IF;

	INSERT INTO iam_app.memberships (
		id, tenant_id, identity_id, status, roles, center_ids
	) VALUES (
		p_membership_id, p_tenant_id, NULL, 'pending', p_roles, p_center_ids
	);
	INSERT INTO iam_app.invitations (
		id, tenant_id, membership_id, target_address, credential_hash, status, idempotency_key
	) VALUES (
		p_invitation_id, p_tenant_id, p_membership_id, p_target_address,
		p_credential_hash, 'pending', p_idempotency_key
	) RETURNING * INTO v_issued;
	INSERT INTO iam_app.audit_records (
		id, tenant_id, actor_identity_id, action, resource_type, resource_id,
		result, correlation_id
	) VALUES (
		gen_random_uuid(), p_tenant_id, v_actor_identity_id, 'membership.invite',
		'invitation', p_invitation_id, 'success', p_correlation_id
	);
	INSERT INTO iam_app.outbox_events (
		id, tenant_id, event_type, payload, correlation_id, idempotency_key
	) VALUES (
		gen_random_uuid(), p_tenant_id, 'iam.invitation.issued.v1',
		jsonb_build_object('invitationId', p_invitation_id, 'membershipId', p_membership_id),
		p_correlation_id, 'invitation.issued:' || p_invitation_id::text
	);
	RETURN jsonb_build_object(
		'invitationId', v_issued.id,
		'membershipId', v_issued.membership_id,
		'status', v_issued.status,
		'deliveryStatus', 'queued',
		'expiresAt', v_issued.expires_at,
		'created', true
	);
END $$;


--
-- Name: issue_tenant_context_command(text, text, text, uuid, text); Type: FUNCTION; Schema: iam_app; Owner: -
--

CREATE FUNCTION iam_app.issue_tenant_context_command(p_issuer text, p_subject text, p_session_id_hash text, p_tenant_id uuid, p_handle_hash text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'iam_app', 'pg_temp'
    AS $_$
DECLARE
	v_identity_id uuid;
	v_issued_at timestamptz;
	v_live_count integer := 0;
	v_recent_count integer := 0;
	v_tenant_live_count integer;
	v_tenant_recent_count integer;
	v_candidate_tenant_id uuid;
	v_previous_tenant_id text := current_setting('app.tenant_id', true);
BEGIN
	IF NULLIF(btrim(p_issuer), '') IS NULL
		OR NULLIF(btrim(p_subject), '') IS NULL
		OR p_session_id_hash !~ '^[0-9a-f]{64}$'
		OR p_handle_hash !~ '^[0-9a-f]{64}$'
		OR p_tenant_id IS NULL THEN
		RETURN jsonb_build_object('deniedReason', 'invariant_violation');
	END IF;

	PERFORM set_config('app.tenant_id', p_tenant_id::text, true);
	SELECT identity_id INTO v_identity_id
	FROM iam_app.external_identities
	WHERE issuer = p_issuer AND subject = p_subject;
	IF v_identity_id IS NULL OR NOT EXISTS (
		SELECT 1 FROM iam_app.memberships
		WHERE identity_id = v_identity_id
			AND tenant_id = p_tenant_id
			AND status = 'active'
	) THEN
		PERFORM set_config('app.tenant_id', COALESCE(v_previous_tenant_id, ''), true);
		RETURN jsonb_build_object('deniedReason', 'membership_missing_or_inactive');
	END IF;

	PERFORM pg_advisory_xact_lock(
		hashtextextended(v_identity_id::text || E'\n' || p_session_id_hash, 0)
	);
	FOR v_candidate_tenant_id IN
		SELECT tenant_link.tenant_id
		FROM iam_app.identity_tenants AS tenant_link
		WHERE tenant_link.identity_id = v_identity_id
		ORDER BY tenant_link.tenant_id
	LOOP
		PERFORM set_config('app.tenant_id', v_candidate_tenant_id::text, true);
		SELECT
			count(*) FILTER (
				WHERE issued_at >= clock_timestamp() - interval '1 minute'
			)::integer,
			count(*) FILTER (WHERE revoked_at IS NULL)::integer
		INTO v_tenant_recent_count, v_tenant_live_count
		FROM iam_app.tenant_contexts
		WHERE tenant_id = v_candidate_tenant_id
			AND identity_id = v_identity_id
			AND session_id_hash = p_session_id_hash;
		v_recent_count := v_recent_count + v_tenant_recent_count;
		v_live_count := v_live_count + v_tenant_live_count;
	END LOOP;
	IF v_recent_count >= 10 OR v_live_count >= 20 THEN
		PERFORM set_config('app.tenant_id', COALESCE(v_previous_tenant_id, ''), true);
		RETURN jsonb_build_object('deniedReason', 'invariant_violation');
	END IF;

	PERFORM set_config('app.tenant_id', p_tenant_id::text, true);
	v_issued_at := clock_timestamp();
	INSERT INTO iam_app.tenant_contexts (
		handle_hash, identity_id, tenant_id, session_id_hash, issued_at
	) VALUES (
		p_handle_hash, v_identity_id, p_tenant_id, p_session_id_hash, v_issued_at
	);
	PERFORM set_config('app.tenant_id', COALESCE(v_previous_tenant_id, ''), true);
	RETURN jsonb_build_object(
		'tenantId', p_tenant_id,
		'issuedAt', v_issued_at
	);
END $_$;


--
-- Name: list_operators_command(text, text); Type: FUNCTION; Schema: iam_app; Owner: -
--

CREATE FUNCTION iam_app.list_operators_command(p_issuer text, p_subject text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'iam_app', 'pg_temp'
    AS $$
DECLARE
	v_identity_id uuid;
	v_operators jsonb;
	v_operator jsonb;
	v_tenant_id uuid;
BEGIN
	SELECT identity_id INTO v_identity_id
	FROM iam_app.external_identities
	WHERE issuer = p_issuer AND subject = p_subject;

	v_operators := '[]'::jsonb;
	FOR v_tenant_id IN
		SELECT tenant_link.tenant_id
		FROM iam_app.identity_tenants AS tenant_link
		WHERE tenant_link.identity_id = v_identity_id
		ORDER BY tenant_link.tenant_id
	LOOP
		PERFORM set_config('app.tenant_id', v_tenant_id::text, true);
		SELECT jsonb_build_object(
			'identityId', v_identity_id,
			'tenantId', membership.tenant_id,
			'displayName', tenant.name
		) INTO v_operator
		FROM iam_app.memberships AS membership
		JOIN iam_app.tenants AS tenant ON tenant.id = membership.tenant_id
		WHERE membership.identity_id = v_identity_id
			AND membership.tenant_id = v_tenant_id
			AND membership.status = 'active';
		IF v_operator IS NOT NULL THEN
			v_operators := v_operators || jsonb_build_array(v_operator);
		END IF;
	END LOOP;

	RETURN jsonb_build_object(
		'identityId', v_identity_id,
		'operators', v_operators
	);
END $$;


--
-- Name: prevent_last_owner_removal(); Type: FUNCTION; Schema: iam_app; Owner: -
--

CREATE FUNCTION iam_app.prevent_last_owner_removal() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'iam_app', 'pg_temp'
    AS $$
BEGIN
	IF OLD.status = 'active'
		AND OLD.roles @> ARRAY['tenant_owner']::text[]
		AND (
			NEW.status <> 'active'
			OR NOT (NEW.roles @> ARRAY['tenant_owner']::text[])
		) THEN
		PERFORM pg_advisory_xact_lock(hashtextextended(NEW.tenant_id::text, 0));
		IF (
			SELECT count(*)
			FROM iam_app.memberships
			WHERE tenant_id = NEW.tenant_id
				AND status = 'active'
				AND roles @> ARRAY['tenant_owner']::text[]
		) <= 1 THEN
			RAISE EXCEPTION 'Cannot remove last tenant owner' USING ERRCODE = '23514';
		END IF;
	END IF;
	RETURN NEW;
END $$;


--
-- Name: record_booking_catalog_mutation(uuid, uuid, text, text, uuid, text, jsonb, uuid, text); Type: FUNCTION; Schema: iam_app; Owner: -
--

CREATE FUNCTION iam_app.record_booking_catalog_mutation(p_tenant_id uuid, p_actor_identity_id uuid, p_action text, p_resource_type text, p_resource_id uuid, p_event_type text, p_payload jsonb, p_correlation_id uuid, p_idempotency_key text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'iam_app', 'pg_temp'
    AS $$
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


--
-- Name: record_public_booking_created(uuid, uuid, uuid); Type: FUNCTION; Schema: iam_app; Owner: -
--

CREATE FUNCTION iam_app.record_public_booking_created(p_tenant_id uuid, p_booking_id uuid, p_correlation_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'iam_app', 'booking_app', 'pg_temp'
    AS $$
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


--
-- Name: resolve_access(text, text, uuid); Type: FUNCTION; Schema: iam_app; Owner: -
--

CREATE FUNCTION iam_app.resolve_access(p_issuer text, p_subject text, p_tenant uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'iam_app', 'pg_temp'
    AS $$
DECLARE result jsonb;
BEGIN
	PERFORM set_config('app.tenant_id', p_tenant::text, true);
	SELECT jsonb_build_object(
		'identityId', identity.id,
		'membershipId', membership.id,
		'tenantId', membership.tenant_id,
		'roles', membership.roles,
		'centerIds', membership.center_ids
	) INTO result
	FROM iam_app.external_identities AS external_identity
	JOIN iam_app.identities AS identity ON identity.id = external_identity.identity_id
	JOIN iam_app.memberships AS membership
		ON membership.identity_id = identity.id AND membership.tenant_id = p_tenant
	WHERE external_identity.issuer = p_issuer
		AND external_identity.subject = p_subject
		AND membership.status = 'active';
	RETURN result;
END $$;


--
-- Name: resolve_tenant_context_command(text, text, text, text); Type: FUNCTION; Schema: iam_app; Owner: -
--

CREATE FUNCTION iam_app.resolve_tenant_context_command(p_issuer text, p_subject text, p_session_id_hash text, p_handle_hash text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'iam_app', 'pg_temp'
    AS $_$
DECLARE
	v_identity_id uuid;
	v_tenant_id uuid;
	v_context jsonb;
	v_previous_tenant_id text := current_setting('app.tenant_id', true);
BEGIN
	IF NULLIF(btrim(p_issuer), '') IS NULL
		OR NULLIF(btrim(p_subject), '') IS NULL
		OR p_session_id_hash !~ '^[0-9a-f]{64}$'
		OR p_handle_hash !~ '^[0-9a-f]{64}$' THEN
		RETURN NULL;
	END IF;

	SELECT identity_id INTO v_identity_id
	FROM iam_app.external_identities
	WHERE issuer = p_issuer AND subject = p_subject;
	IF v_identity_id IS NULL THEN RETURN NULL; END IF;

	FOR v_tenant_id IN
		SELECT tenant_link.tenant_id
		FROM iam_app.identity_tenants AS tenant_link
		WHERE tenant_link.identity_id = v_identity_id
		ORDER BY tenant_link.tenant_id
	LOOP
		PERFORM set_config('app.tenant_id', v_tenant_id::text, true);
		SELECT jsonb_build_object(
			'identityId', v_identity_id,
			'tenantId', context.tenant_id
		) INTO v_context
		FROM iam_app.tenant_contexts AS context
		WHERE context.tenant_id = v_tenant_id
			AND context.handle_hash = p_handle_hash
			AND context.identity_id = v_identity_id
			AND context.session_id_hash = p_session_id_hash
			AND context.revoked_at IS NULL;
		IF v_context IS NOT NULL THEN EXIT; END IF;
	END LOOP;

	PERFORM set_config('app.tenant_id', COALESCE(v_previous_tenant_id, ''), true);
	RETURN v_context;
END $_$;


--
-- Name: respond_invitation_command(text, text, text[], uuid, text, text, uuid, uuid); Type: FUNCTION; Schema: iam_app; Owner: -
--

CREATE FUNCTION iam_app.respond_invitation_command(p_issuer text, p_subject text, p_verified_addresses text[], p_tenant_id uuid, p_credential_hash text, p_decision text, p_new_identity_id uuid, p_correlation_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'iam_app', 'pg_temp'
    AS $$
DECLARE
	v_invitation iam_app.invitations%ROWTYPE;
	v_identity_id uuid;
BEGIN
	IF NULLIF(btrim(p_issuer), '') IS NULL
		OR p_issuer IS DISTINCT FROM btrim(p_issuer)
		OR NULLIF(btrim(p_subject), '') IS NULL
		OR p_subject IS DISTINCT FROM btrim(p_subject) THEN
		RETURN jsonb_build_object('deniedReason', 'authentication_missing_or_invalid');
	END IF;
	IF p_verified_addresses IS NULL
		OR cardinality(p_verified_addresses) = 0
		OR EXISTS (
			SELECT 1 FROM unnest(p_verified_addresses) AS verified(address)
			WHERE NULLIF(btrim(verified.address), '') IS NULL
				OR verified.address IS DISTINCT FROM btrim(verified.address)
		) THEN
		RETURN jsonb_build_object('deniedReason', 'credential_invalid_or_expired');
	END IF;

	PERFORM set_config('app.tenant_id', p_tenant_id::text, true);
	SELECT * INTO v_invitation FROM iam_app.invitations
	WHERE tenant_id = p_tenant_id AND credential_hash = p_credential_hash
	FOR UPDATE;
	IF v_invitation.id IS NULL THEN
		RETURN jsonb_build_object('deniedReason', 'credential_invalid_or_expired');
	END IF;
	IF NOT (v_invitation.target_address = ANY(p_verified_addresses)) THEN
		RETURN jsonb_build_object('deniedReason', 'credential_invalid_or_expired');
	END IF;

	PERFORM pg_advisory_xact_lock(hashtextextended(p_issuer || E'\n' || p_subject, 0));
	SELECT identity_id INTO v_identity_id
	FROM iam_app.external_identities
	WHERE issuer = p_issuer AND subject = p_subject;
	IF v_identity_id IS NULL THEN
		INSERT INTO iam_app.identities (id) VALUES (p_new_identity_id);
		INSERT INTO iam_app.external_identities (identity_id, issuer, subject)
		VALUES (p_new_identity_id, p_issuer, p_subject);
		v_identity_id := p_new_identity_id;
	END IF;
	IF v_invitation.status <> 'pending' THEN
		INSERT INTO iam_app.audit_records (
			id, tenant_id, actor_identity_id, action, resource_type, resource_id,
			result, reason, correlation_id
		) VALUES (
			gen_random_uuid(), p_tenant_id, v_identity_id, 'membership.invite',
			'invitation', v_invitation.id, 'denied', 'duplicate_or_replayed', p_correlation_id
		);
		RETURN jsonb_build_object('deniedReason', 'duplicate_or_replayed');
	END IF;
	IF v_invitation.expires_at <= clock_timestamp() THEN
		UPDATE iam_app.invitations SET status = 'expired'
		WHERE tenant_id = p_tenant_id AND id = v_invitation.id;
		UPDATE iam_app.memberships SET status = 'disabled'
		WHERE tenant_id = p_tenant_id AND id = v_invitation.membership_id;
		INSERT INTO iam_app.audit_records (
			id, tenant_id, actor_identity_id, action, resource_type, resource_id,
			result, reason, correlation_id
		) VALUES (
			gen_random_uuid(), p_tenant_id, v_identity_id, 'membership.invite',
			'invitation', v_invitation.id, 'denied', 'credential_invalid_or_expired', p_correlation_id
		);
		INSERT INTO iam_app.outbox_events (
			id, tenant_id, event_type, payload, correlation_id, idempotency_key
		) VALUES (
			gen_random_uuid(), p_tenant_id, 'iam.invitation.expired.v1',
			jsonb_build_object('invitationId', v_invitation.id, 'membershipId', v_invitation.membership_id),
			p_correlation_id, 'invitation.expired:' || v_invitation.id::text
		);
		RETURN jsonb_build_object('deniedReason', 'credential_invalid_or_expired');
	END IF;
	IF p_decision NOT IN ('accepted', 'rejected') THEN
		INSERT INTO iam_app.audit_records (
			id, tenant_id, actor_identity_id, action, resource_type, resource_id,
			result, reason, correlation_id
		) VALUES (
			gen_random_uuid(), p_tenant_id, v_identity_id, 'membership.invite',
			'invitation', v_invitation.id, 'denied', 'invariant_violation', p_correlation_id
		);
		RETURN jsonb_build_object('deniedReason', 'invariant_violation');
	END IF;

	IF p_decision = 'accepted' AND EXISTS (
		SELECT 1 FROM iam_app.memberships
		WHERE tenant_id = p_tenant_id
			AND identity_id = v_identity_id
			AND id <> v_invitation.membership_id
	) THEN
		INSERT INTO iam_app.audit_records (
			id, tenant_id, actor_identity_id, action, resource_type, resource_id,
			result, reason, correlation_id
		) VALUES (
			gen_random_uuid(), p_tenant_id, v_identity_id, 'membership.invite',
			'invitation', v_invitation.id, 'denied', 'invariant_violation', p_correlation_id
		);
		RETURN jsonb_build_object('deniedReason', 'invariant_violation');
	END IF;

	IF p_decision = 'accepted' THEN
		UPDATE iam_app.memberships SET identity_id = v_identity_id, status = 'active'
		WHERE tenant_id = p_tenant_id AND id = v_invitation.membership_id;
	ELSE
		UPDATE iam_app.memberships SET status = 'disabled'
		WHERE tenant_id = p_tenant_id AND id = v_invitation.membership_id;
	END IF;
	UPDATE iam_app.invitations SET status = p_decision
	WHERE tenant_id = p_tenant_id AND id = v_invitation.id;
	INSERT INTO iam_app.audit_records (
		id, tenant_id, actor_identity_id, action, resource_type, resource_id,
		result, correlation_id
	) VALUES (
		gen_random_uuid(), p_tenant_id, v_identity_id,
		CASE WHEN p_decision = 'accepted' THEN 'membership.invite' ELSE 'membership.disable' END,
		'invitation', v_invitation.id, 'success', p_correlation_id
	);
	INSERT INTO iam_app.outbox_events (
		id, tenant_id, event_type, payload, correlation_id, idempotency_key
	) VALUES (
		gen_random_uuid(), p_tenant_id, 'iam.invitation.' || p_decision || '.v1',
		jsonb_build_object('invitationId', v_invitation.id, 'membershipId', v_invitation.membership_id),
		p_correlation_id, 'invitation.' || p_decision || ':' || v_invitation.id::text
	);
	RETURN jsonb_build_object(
		'invitationId', v_invitation.id,
		'membershipId', v_invitation.membership_id,
		'status', p_decision
	);
END $$;


--
-- Name: revoke_invitation_command(text, text, uuid, uuid, uuid); Type: FUNCTION; Schema: iam_app; Owner: -
--

CREATE FUNCTION iam_app.revoke_invitation_command(p_issuer text, p_subject text, p_tenant_id uuid, p_invitation_id uuid, p_correlation_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'iam_app', 'pg_temp'
    AS $$
DECLARE
  v_actor_identity_id uuid;
  v_actor_roles text[];
  v_invitation iam_app.invitations%ROWTYPE;
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
    INSERT INTO iam_app.audit_records (
      id, tenant_id, actor_identity_id, action, resource_type, resource_id,
      result, reason, correlation_id
    ) VALUES (
      gen_random_uuid(), p_tenant_id, v_actor_identity_id, 'membership.disable',
      'invitation', p_invitation_id, 'denied', 'permission_missing', p_correlation_id
    );
    RETURN jsonb_build_object('deniedReason', 'permission_missing');
  END IF;

  SELECT * INTO v_invitation FROM iam_app.invitations
  WHERE tenant_id = p_tenant_id AND id = p_invitation_id
  FOR UPDATE;
  IF v_invitation.status IS DISTINCT FROM 'pending' THEN
    INSERT INTO iam_app.audit_records (
      id, tenant_id, actor_identity_id, action, resource_type, resource_id,
      result, reason, correlation_id
    ) VALUES (
      gen_random_uuid(), p_tenant_id, v_actor_identity_id, 'membership.disable',
      'invitation', p_invitation_id, 'denied', 'duplicate_or_replayed', p_correlation_id
    );
    RETURN jsonb_build_object('deniedReason', 'duplicate_or_replayed');
  END IF;
  UPDATE iam_app.invitations SET status = 'revoked'
  WHERE tenant_id = p_tenant_id AND id = p_invitation_id;
  UPDATE iam_app.memberships SET status = 'disabled'
  WHERE tenant_id = p_tenant_id AND id = v_invitation.membership_id;
  INSERT INTO iam_app.audit_records (
    id, tenant_id, actor_identity_id, action, resource_type, resource_id,
    result, correlation_id
  ) VALUES (
    gen_random_uuid(), p_tenant_id, v_actor_identity_id, 'membership.disable',
    'invitation', p_invitation_id, 'success', p_correlation_id
  );
  INSERT INTO iam_app.outbox_events (
    id, tenant_id, event_type, payload, correlation_id, idempotency_key
  ) VALUES (
    gen_random_uuid(), p_tenant_id, 'iam.invitation.revoked.v1',
    jsonb_build_object('invitationId', p_invitation_id, 'membershipId', v_invitation.membership_id),
    p_correlation_id, 'invitation.revoked:' || p_invitation_id::text
  );
  RETURN jsonb_build_object(
    'invitationId', p_invitation_id,
    'membershipId', v_invitation.membership_id,
    'status', 'revoked'
  );
END $$;


--
-- Name: revoke_tenant_context_command(text, text, text, text); Type: FUNCTION; Schema: iam_app; Owner: -
--

CREATE FUNCTION iam_app.revoke_tenant_context_command(p_issuer text, p_subject text, p_session_id_hash text, p_handle_hash text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'iam_app', 'pg_temp'
    AS $_$
DECLARE
	v_identity_id uuid;
	v_tenant_id uuid;
	v_updated_count integer;
	v_previous_tenant_id text := current_setting('app.tenant_id', true);
BEGIN
	IF NULLIF(btrim(p_issuer), '') IS NULL
		OR NULLIF(btrim(p_subject), '') IS NULL
		OR p_session_id_hash !~ '^[0-9a-f]{64}$'
		OR p_handle_hash !~ '^[0-9a-f]{64}$' THEN
		RETURN jsonb_build_object('deniedReason', 'invariant_violation');
	END IF;

	SELECT identity_id INTO v_identity_id
	FROM iam_app.external_identities
	WHERE issuer = p_issuer AND subject = p_subject;
	FOR v_tenant_id IN
		SELECT tenant_link.tenant_id
		FROM iam_app.identity_tenants AS tenant_link
		WHERE tenant_link.identity_id = v_identity_id
		ORDER BY tenant_link.tenant_id
	LOOP
		PERFORM set_config('app.tenant_id', v_tenant_id::text, true);
		UPDATE iam_app.tenant_contexts
		SET revoked_at = COALESCE(revoked_at, clock_timestamp())
		WHERE tenant_id = v_tenant_id
			AND handle_hash = p_handle_hash
			AND identity_id = v_identity_id
			AND session_id_hash = p_session_id_hash;
		GET DIAGNOSTICS v_updated_count = ROW_COUNT;
		IF v_updated_count > 0 THEN
			PERFORM set_config('app.tenant_id', COALESCE(v_previous_tenant_id, ''), true);
			RETURN jsonb_build_object('revoked', true);
		END IF;
	END LOOP;

	PERFORM set_config('app.tenant_id', COALESCE(v_previous_tenant_id, ''), true);
	RETURN jsonb_build_object('deniedReason', 'membership_missing_or_inactive');
END $_$;


--
-- Name: sync_identity_tenant_binding(); Type: FUNCTION; Schema: iam_app; Owner: -
--

CREATE FUNCTION iam_app.sync_identity_tenant_binding() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'iam_app', 'pg_temp'
    AS $$
BEGIN
	IF NEW.identity_id IS NOT NULL THEN
		INSERT INTO iam_app.identity_tenants (identity_id, tenant_id)
		VALUES (NEW.identity_id, NEW.tenant_id)
		ON CONFLICT DO NOTHING;
	END IF;
	RETURN NEW;
END $$;


--
-- Name: validate_membership_centers(); Type: FUNCTION; Schema: iam_app; Owner: -
--

CREATE FUNCTION iam_app.validate_membership_centers() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'iam_app', 'pg_temp'
    AS $$
BEGIN
  IF NEW.center_ids IS NOT NULL AND EXISTS (
    SELECT 1
    FROM unnest(NEW.center_ids) AS assigned(center_id)
    LEFT JOIN iam_app.centers AS center
      ON center.tenant_id = NEW.tenant_id AND center.id = assigned.center_id
    WHERE center.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Invalid membership center scope' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END $$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: activities; Type: TABLE; Schema: booking_app; Owner: -
--

CREATE TABLE booking_app.activities (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    center_id uuid NOT NULL,
    name jsonb NOT NULL,
    description jsonb,
    default_capacity integer,
    status text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT activities_default_capacity_positive CHECK (((default_capacity IS NULL) OR (default_capacity > 0))),
    CONSTRAINT activities_status_known CHECK ((status = ANY (ARRAY['Draft'::text, 'Published'::text, 'Disabled'::text])))
);

ALTER TABLE ONLY booking_app.activities FORCE ROW LEVEL SECURITY;


--
-- Name: bookings; Type: TABLE; Schema: booking_app; Owner: -
--

CREATE TABLE booking_app.bookings (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    center_id uuid NOT NULL,
    channel_id uuid NOT NULL,
    slot_id uuid NOT NULL,
    booking_channel text NOT NULL,
    idempotency_key text NOT NULL,
    request_hash text NOT NULL,
    status text NOT NULL,
    seats integer NOT NULL,
    locale text NOT NULL,
    booker_first_name text NOT NULL,
    booker_last_name text NOT NULL,
    booker_email text NOT NULL,
    booker_phone text,
    hold_expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT bookings_channel_known CHECK ((booking_channel = 'public_hosted'::text)),
    CONSTRAINT bookings_contact_nonempty CHECK (((btrim(booker_first_name) <> ''::text) AND (btrim(booker_last_name) <> ''::text) AND (btrim(booker_email) <> ''::text))),
    CONSTRAINT bookings_locale_known CHECK ((locale = ANY (ARRAY['es'::text, 'en'::text]))),
    CONSTRAINT bookings_seats_positive CHECK ((seats > 0)),
    CONSTRAINT bookings_status_known CHECK ((status = ANY (ARRAY['Pending'::text, 'Confirmed'::text, 'Rejected'::text, 'Cancelled'::text, 'Expired'::text])))
);

ALTER TABLE ONLY booking_app.bookings FORCE ROW LEVEL SECURITY;


--
-- Name: capability_verifiers; Type: TABLE; Schema: booking_app; Owner: -
--

CREATE TABLE booking_app.capability_verifiers (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    booking_id uuid NOT NULL,
    purpose text NOT NULL,
    version integer NOT NULL,
    verifier_hash text NOT NULL,
    issued_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    consumed_at timestamp with time zone,
    revoked_at timestamp with time zone,
    CONSTRAINT capability_verifiers_hash_nonempty CHECK ((btrim(verifier_hash) <> ''::text)),
    CONSTRAINT capability_verifiers_purpose_known CHECK ((purpose = ANY (ARRAY['booking_confirmation_read'::text, 'booking_cancel'::text]))),
    CONSTRAINT capability_verifiers_version_positive CHECK ((version > 0))
);

ALTER TABLE ONLY booking_app.capability_verifiers FORCE ROW LEVEL SECURITY;


--
-- Name: channels; Type: TABLE; Schema: booking_app; Owner: -
--

CREATE TABLE booking_app.channels (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    center_id uuid NOT NULL,
    public_id text NOT NULL,
    type text NOT NULL,
    activity_id uuid NOT NULL,
    status text NOT NULL,
    confirmation_mode text DEFAULT 'immediate'::text NOT NULL,
    allowed_origins text[] NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT channels_allowed_origins_nonempty CHECK (((cardinality(allowed_origins) > 0) AND (NOT ('*'::text = ANY (allowed_origins))))),
    CONSTRAINT channels_confirmation_mode_known CHECK ((confirmation_mode = ANY (ARRAY['immediate'::text, 'staff_approval'::text]))),
    CONSTRAINT channels_status_known CHECK ((status = ANY (ARRAY['Draft'::text, 'Published'::text, 'Disabled'::text]))),
    CONSTRAINT channels_type_known CHECK ((type = 'single_activity'::text))
);

ALTER TABLE ONLY booking_app.channels FORCE ROW LEVEL SECURITY;


--
-- Name: slots; Type: TABLE; Schema: booking_app; Owner: -
--

CREATE TABLE booking_app.slots (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    center_id uuid NOT NULL,
    activity_id uuid NOT NULL,
    starts_at timestamp with time zone NOT NULL,
    duration_minutes integer NOT NULL,
    capacity integer NOT NULL,
    status text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT slots_capacity_positive CHECK ((capacity > 0)),
    CONSTRAINT slots_duration_minutes_positive CHECK ((duration_minutes > 0)),
    CONSTRAINT slots_status_known CHECK ((status = ANY (ARRAY['Available'::text, 'Full'::text, 'Closed'::text, 'Cancelled'::text])))
);

ALTER TABLE ONLY booking_app.slots FORCE ROW LEVEL SECURITY;


--
-- Name: audit_records; Type: TABLE; Schema: iam_app; Owner: -
--

CREATE TABLE iam_app.audit_records (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    actor_identity_id uuid,
    action text NOT NULL,
    resource_type text NOT NULL,
    resource_id uuid NOT NULL,
    result text NOT NULL,
    reason text,
    correlation_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    purpose text,
    source_metadata jsonb,
    CONSTRAINT audit_action_known CHECK ((action = ANY (ARRAY['membership.invite'::text, 'membership.disable'::text, 'booking.create'::text, 'booking.read'::text, 'booking.update'::text, 'booking.confirm'::text, 'booking.cancel'::text, 'customer_contact.read'::text, 'support.tenant.read'::text, 'identity.webhook.apply'::text]))),
    CONSTRAINT audit_result_reason_valid CHECK ((((result = 'success'::text) AND (reason IS NULL)) OR ((result = 'denied'::text) AND (reason = ANY (ARRAY['authentication_missing_or_invalid'::text, 'membership_missing_or_inactive'::text, 'permission_missing'::text, 'scope_mismatch'::text, 'resource_missing_or_inaccessible'::text, 'resource_state_invalid'::text, 'credential_invalid_or_expired'::text, 'duplicate_or_replayed'::text, 'assurance_insufficient'::text, 'support_grant_invalid'::text, 'last_owner'::text, 'invariant_violation'::text])))))
);

ALTER TABLE ONLY iam_app.audit_records FORCE ROW LEVEL SECURITY;


--
-- Name: centers; Type: TABLE; Schema: iam_app; Owner: -
--

CREATE TABLE iam_app.centers (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    time_zone text
);

ALTER TABLE ONLY iam_app.centers FORCE ROW LEVEL SECURITY;


--
-- Name: external_identities; Type: TABLE; Schema: iam_app; Owner: -
--

CREATE TABLE iam_app.external_identities (
    identity_id uuid NOT NULL,
    issuer text NOT NULL,
    subject text NOT NULL,
    CONSTRAINT external_identities_issuer_normalized CHECK (((issuer = btrim(issuer)) AND (issuer <> ''::text))),
    CONSTRAINT external_identities_subject_normalized CHECK (((subject = btrim(subject)) AND (subject <> ''::text)))
);


--
-- Name: identities; Type: TABLE; Schema: iam_app; Owner: -
--

CREATE TABLE iam_app.identities (
    id uuid NOT NULL
);


--
-- Name: identity_tenants; Type: TABLE; Schema: iam_app; Owner: -
--

CREATE TABLE iam_app.identity_tenants (
    identity_id uuid NOT NULL,
    tenant_id uuid NOT NULL
);


--
-- Name: identity_webhook_inbox; Type: TABLE; Schema: iam_app; Owner: -
--

CREATE TABLE iam_app.identity_webhook_inbox (
    provider_event_id text NOT NULL,
    issuer text NOT NULL,
    event_type text NOT NULL,
    subject text,
    occurred_at timestamp with time zone,
    resolved_identity_id uuid,
    processing_result text NOT NULL,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT identity_webhook_inbox_result_known CHECK ((processing_result = ANY (ARRAY['applied'::text, 'ignored'::text, 'unresolved'::text])))
);


--
-- Name: invitations; Type: TABLE; Schema: iam_app; Owner: -
--

CREATE TABLE iam_app.invitations (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    membership_id uuid NOT NULL,
    target_address text NOT NULL,
    credential_hash text NOT NULL,
    status text NOT NULL,
    idempotency_key text NOT NULL,
    issued_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '7 days'::interval) NOT NULL,
    CONSTRAINT invitations_status_known CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'rejected'::text, 'revoked'::text, 'expired'::text])))
);

ALTER TABLE ONLY iam_app.invitations FORCE ROW LEVEL SECURITY;


--
-- Name: memberships; Type: TABLE; Schema: iam_app; Owner: -
--

CREATE TABLE iam_app.memberships (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    identity_id uuid,
    status text NOT NULL,
    roles text[] NOT NULL,
    center_ids uuid[],
    CONSTRAINT memberships_roles_known CHECK (((cardinality(roles) > 0) AND (roles <@ ARRAY['tenant_owner'::text, 'tenant_admin'::text, 'operations_lead'::text, 'auditor_compliance'::text, 'center_manager'::text, 'reception_booking_manager'::text, 'external_collaborator'::text]))),
    CONSTRAINT memberships_status_known CHECK ((status = ANY (ARRAY['pending'::text, 'active'::text, 'disabled'::text])))
);

ALTER TABLE ONLY iam_app.memberships FORCE ROW LEVEL SECURITY;


--
-- Name: outbox_events; Type: TABLE; Schema: iam_app; Owner: -
--

CREATE TABLE iam_app.outbox_events (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    event_type text NOT NULL,
    payload jsonb NOT NULL,
    correlation_id uuid NOT NULL,
    idempotency_key text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY iam_app.outbox_events FORCE ROW LEVEL SECURITY;


--
-- Name: tenant_contexts; Type: TABLE; Schema: iam_app; Owner: -
--

CREATE TABLE iam_app.tenant_contexts (
    handle_hash text NOT NULL,
    identity_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    session_id_hash text NOT NULL,
    issued_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone,
    CONSTRAINT tenant_contexts_handle_hash_format CHECK ((handle_hash ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT tenant_contexts_session_id_hash_format CHECK ((session_id_hash ~ '^[0-9a-f]{64}$'::text))
);

ALTER TABLE ONLY iam_app.tenant_contexts FORCE ROW LEVEL SECURITY;


--
-- Name: tenants; Type: TABLE; Schema: iam_app; Owner: -
--

CREATE TABLE iam_app.tenants (
    id uuid NOT NULL,
    name text NOT NULL
);

ALTER TABLE ONLY iam_app.tenants FORCE ROW LEVEL SECURITY;


--
-- Name: activities activities_tenant_center_id_unique; Type: CONSTRAINT; Schema: booking_app; Owner: -
--

ALTER TABLE ONLY booking_app.activities
    ADD CONSTRAINT activities_tenant_center_id_unique UNIQUE (tenant_id, center_id, id);


--
-- Name: activities activities_tenant_id_id_pk; Type: CONSTRAINT; Schema: booking_app; Owner: -
--

ALTER TABLE ONLY booking_app.activities
    ADD CONSTRAINT activities_tenant_id_id_pk PRIMARY KEY (tenant_id, id);


--
-- Name: bookings bookings_tenant_center_id_unique; Type: CONSTRAINT; Schema: booking_app; Owner: -
--

ALTER TABLE ONLY booking_app.bookings
    ADD CONSTRAINT bookings_tenant_center_id_unique UNIQUE (tenant_id, center_id, id);


--
-- Name: bookings bookings_tenant_channel_idempotency_unique; Type: CONSTRAINT; Schema: booking_app; Owner: -
--

ALTER TABLE ONLY booking_app.bookings
    ADD CONSTRAINT bookings_tenant_channel_idempotency_unique UNIQUE (tenant_id, channel_id, idempotency_key);


--
-- Name: bookings bookings_tenant_id_id_pk; Type: CONSTRAINT; Schema: booking_app; Owner: -
--

ALTER TABLE ONLY booking_app.bookings
    ADD CONSTRAINT bookings_tenant_id_id_pk PRIMARY KEY (tenant_id, id);


--
-- Name: capability_verifiers capability_verifiers_booking_purpose_version_unique; Type: CONSTRAINT; Schema: booking_app; Owner: -
--

ALTER TABLE ONLY booking_app.capability_verifiers
    ADD CONSTRAINT capability_verifiers_booking_purpose_version_unique UNIQUE (tenant_id, booking_id, purpose, version);


--
-- Name: capability_verifiers capability_verifiers_tenant_id_id_pk; Type: CONSTRAINT; Schema: booking_app; Owner: -
--

ALTER TABLE ONLY booking_app.capability_verifiers
    ADD CONSTRAINT capability_verifiers_tenant_id_id_pk PRIMARY KEY (tenant_id, id);


--
-- Name: channels channels_public_id_unique; Type: CONSTRAINT; Schema: booking_app; Owner: -
--

ALTER TABLE ONLY booking_app.channels
    ADD CONSTRAINT channels_public_id_unique UNIQUE (public_id);


--
-- Name: channels channels_tenant_center_id_unique; Type: CONSTRAINT; Schema: booking_app; Owner: -
--

ALTER TABLE ONLY booking_app.channels
    ADD CONSTRAINT channels_tenant_center_id_unique UNIQUE (tenant_id, center_id, id);


--
-- Name: channels channels_tenant_id_id_pk; Type: CONSTRAINT; Schema: booking_app; Owner: -
--

ALTER TABLE ONLY booking_app.channels
    ADD CONSTRAINT channels_tenant_id_id_pk PRIMARY KEY (tenant_id, id);


--
-- Name: slots slots_tenant_center_id_unique; Type: CONSTRAINT; Schema: booking_app; Owner: -
--

ALTER TABLE ONLY booking_app.slots
    ADD CONSTRAINT slots_tenant_center_id_unique UNIQUE (tenant_id, center_id, id);


--
-- Name: slots slots_tenant_id_id_pk; Type: CONSTRAINT; Schema: booking_app; Owner: -
--

ALTER TABLE ONLY booking_app.slots
    ADD CONSTRAINT slots_tenant_id_id_pk PRIMARY KEY (tenant_id, id);


--
-- Name: audit_records audit_records_tenant_id_id_pk; Type: CONSTRAINT; Schema: iam_app; Owner: -
--

ALTER TABLE ONLY iam_app.audit_records
    ADD CONSTRAINT audit_records_tenant_id_id_pk PRIMARY KEY (tenant_id, id);


--
-- Name: centers centers_tenant_id_id_pk; Type: CONSTRAINT; Schema: iam_app; Owner: -
--

ALTER TABLE ONLY iam_app.centers
    ADD CONSTRAINT centers_tenant_id_id_pk PRIMARY KEY (tenant_id, id);


--
-- Name: external_identities external_identities_identity_id_issuer_unique; Type: CONSTRAINT; Schema: iam_app; Owner: -
--

ALTER TABLE ONLY iam_app.external_identities
    ADD CONSTRAINT external_identities_identity_id_issuer_unique UNIQUE (identity_id, issuer);


--
-- Name: external_identities external_identities_issuer_subject_pk; Type: CONSTRAINT; Schema: iam_app; Owner: -
--

ALTER TABLE ONLY iam_app.external_identities
    ADD CONSTRAINT external_identities_issuer_subject_pk PRIMARY KEY (issuer, subject);


--
-- Name: identities identities_pkey; Type: CONSTRAINT; Schema: iam_app; Owner: -
--

ALTER TABLE ONLY iam_app.identities
    ADD CONSTRAINT identities_pkey PRIMARY KEY (id);


--
-- Name: identity_tenants identity_tenants_identity_id_tenant_id_pk; Type: CONSTRAINT; Schema: iam_app; Owner: -
--

ALTER TABLE ONLY iam_app.identity_tenants
    ADD CONSTRAINT identity_tenants_identity_id_tenant_id_pk PRIMARY KEY (identity_id, tenant_id);


--
-- Name: identity_webhook_inbox identity_webhook_inbox_issuer_provider_event_id_pk; Type: CONSTRAINT; Schema: iam_app; Owner: -
--

ALTER TABLE ONLY iam_app.identity_webhook_inbox
    ADD CONSTRAINT identity_webhook_inbox_issuer_provider_event_id_pk PRIMARY KEY (issuer, provider_event_id);


--
-- Name: invitations invitations_credential_hash_unique; Type: CONSTRAINT; Schema: iam_app; Owner: -
--

ALTER TABLE ONLY iam_app.invitations
    ADD CONSTRAINT invitations_credential_hash_unique UNIQUE (credential_hash);


--
-- Name: invitations invitations_tenant_id_id_pk; Type: CONSTRAINT; Schema: iam_app; Owner: -
--

ALTER TABLE ONLY iam_app.invitations
    ADD CONSTRAINT invitations_tenant_id_id_pk PRIMARY KEY (tenant_id, id);


--
-- Name: invitations invitations_tenant_id_idempotency_key_unique; Type: CONSTRAINT; Schema: iam_app; Owner: -
--

ALTER TABLE ONLY iam_app.invitations
    ADD CONSTRAINT invitations_tenant_id_idempotency_key_unique UNIQUE (tenant_id, idempotency_key);


--
-- Name: memberships memberships_tenant_id_id_pk; Type: CONSTRAINT; Schema: iam_app; Owner: -
--

ALTER TABLE ONLY iam_app.memberships
    ADD CONSTRAINT memberships_tenant_id_id_pk PRIMARY KEY (tenant_id, id);


--
-- Name: memberships memberships_tenant_id_identity_id_unique; Type: CONSTRAINT; Schema: iam_app; Owner: -
--

ALTER TABLE ONLY iam_app.memberships
    ADD CONSTRAINT memberships_tenant_id_identity_id_unique UNIQUE (tenant_id, identity_id);


--
-- Name: outbox_events outbox_events_tenant_id_id_pk; Type: CONSTRAINT; Schema: iam_app; Owner: -
--

ALTER TABLE ONLY iam_app.outbox_events
    ADD CONSTRAINT outbox_events_tenant_id_id_pk PRIMARY KEY (tenant_id, id);


--
-- Name: outbox_events outbox_events_tenant_id_idempotency_key_unique; Type: CONSTRAINT; Schema: iam_app; Owner: -
--

ALTER TABLE ONLY iam_app.outbox_events
    ADD CONSTRAINT outbox_events_tenant_id_idempotency_key_unique UNIQUE (tenant_id, idempotency_key);


--
-- Name: tenant_contexts tenant_contexts_pkey; Type: CONSTRAINT; Schema: iam_app; Owner: -
--

ALTER TABLE ONLY iam_app.tenant_contexts
    ADD CONSTRAINT tenant_contexts_pkey PRIMARY KEY (handle_hash);


--
-- Name: tenants tenants_pkey; Type: CONSTRAINT; Schema: iam_app; Owner: -
--

ALTER TABLE ONLY iam_app.tenants
    ADD CONSTRAINT tenants_pkey PRIMARY KEY (id);


--
-- Name: activities_center_created_id_idx; Type: INDEX; Schema: booking_app; Owner: -
--

CREATE INDEX activities_center_created_id_idx ON booking_app.activities USING btree (tenant_id, center_id, created_at DESC NULLS LAST, id DESC NULLS LAST);


--
-- Name: activities_center_status_created_id_idx; Type: INDEX; Schema: booking_app; Owner: -
--

CREATE INDEX activities_center_status_created_id_idx ON booking_app.activities USING btree (tenant_id, center_id, status, created_at DESC NULLS LAST, id DESC NULLS LAST);


--
-- Name: bookings_tenant_channel_created_idx; Type: INDEX; Schema: booking_app; Owner: -
--

CREATE INDEX bookings_tenant_channel_created_idx ON booking_app.bookings USING btree (tenant_id, channel_id, created_at);


--
-- Name: bookings_tenant_slot_status_idx; Type: INDEX; Schema: booking_app; Owner: -
--

CREATE INDEX bookings_tenant_slot_status_idx ON booking_app.bookings USING btree (tenant_id, slot_id, status);


--
-- Name: capability_verifiers_lookup_idx; Type: INDEX; Schema: booking_app; Owner: -
--

CREATE INDEX capability_verifiers_lookup_idx ON booking_app.capability_verifiers USING btree (tenant_id, booking_id, purpose, verifier_hash);


--
-- Name: channels_tenant_center_status_idx; Type: INDEX; Schema: booking_app; Owner: -
--

CREATE INDEX channels_tenant_center_status_idx ON booking_app.channels USING btree (tenant_id, center_id, status);


--
-- Name: slots_activity_starts_id_idx; Type: INDEX; Schema: booking_app; Owner: -
--

CREATE INDEX slots_activity_starts_id_idx ON booking_app.slots USING btree (tenant_id, center_id, activity_id, starts_at, id);


--
-- Name: slots_activity_status_starts_id_idx; Type: INDEX; Schema: booking_app; Owner: -
--

CREATE INDEX slots_activity_status_starts_id_idx ON booking_app.slots USING btree (tenant_id, center_id, activity_id, status, starts_at, id);


--
-- Name: tenant_contexts_identity_session_active_idx; Type: INDEX; Schema: iam_app; Owner: -
--

CREATE INDEX tenant_contexts_identity_session_active_idx ON iam_app.tenant_contexts USING btree (identity_id, session_id_hash) WHERE (revoked_at IS NULL);


--
-- Name: tenant_contexts_revoked_at_idx; Type: INDEX; Schema: iam_app; Owner: -
--

CREATE INDEX tenant_contexts_revoked_at_idx ON iam_app.tenant_contexts USING btree (revoked_at) WHERE (revoked_at IS NOT NULL);


--
-- Name: invitations invitations_transition_guard; Type: TRIGGER; Schema: iam_app; Owner: -
--

CREATE TRIGGER invitations_transition_guard BEFORE UPDATE ON iam_app.invitations FOR EACH ROW EXECUTE FUNCTION iam_app.enforce_invitation_transition();


--
-- Name: memberships memberships_centers_same_tenant; Type: TRIGGER; Schema: iam_app; Owner: -
--

CREATE TRIGGER memberships_centers_same_tenant BEFORE INSERT OR UPDATE OF tenant_id, center_ids ON iam_app.memberships FOR EACH ROW EXECUTE FUNCTION iam_app.validate_membership_centers();


--
-- Name: memberships memberships_identity_tenant_sync; Type: TRIGGER; Schema: iam_app; Owner: -
--

CREATE TRIGGER memberships_identity_tenant_sync AFTER INSERT OR UPDATE OF identity_id, tenant_id ON iam_app.memberships FOR EACH ROW EXECUTE FUNCTION iam_app.sync_identity_tenant_binding();


--
-- Name: memberships memberships_last_owner_guard; Type: TRIGGER; Schema: iam_app; Owner: -
--

CREATE TRIGGER memberships_last_owner_guard BEFORE UPDATE OF status, roles ON iam_app.memberships FOR EACH ROW EXECUTE FUNCTION iam_app.prevent_last_owner_removal();


--
-- Name: memberships memberships_lifecycle_guard; Type: TRIGGER; Schema: iam_app; Owner: -
--

CREATE TRIGGER memberships_lifecycle_guard BEFORE INSERT OR UPDATE OF tenant_id, identity_id, status, roles, center_ids ON iam_app.memberships FOR EACH ROW EXECUTE FUNCTION iam_app.enforce_membership_lifecycle();


--
-- Name: activities activities_tenant_id_center_id_centers_tenant_id_id_fk; Type: FK CONSTRAINT; Schema: booking_app; Owner: -
--

ALTER TABLE ONLY booking_app.activities
    ADD CONSTRAINT activities_tenant_id_center_id_centers_tenant_id_id_fk FOREIGN KEY (tenant_id, center_id) REFERENCES iam_app.centers(tenant_id, id);


--
-- Name: activities activities_tenant_id_tenants_id_fk; Type: FK CONSTRAINT; Schema: booking_app; Owner: -
--

ALTER TABLE ONLY booking_app.activities
    ADD CONSTRAINT activities_tenant_id_tenants_id_fk FOREIGN KEY (tenant_id) REFERENCES iam_app.tenants(id);


--
-- Name: bookings bookings_tenant_id_center_id_channel_id_channels_tenant_id_cent; Type: FK CONSTRAINT; Schema: booking_app; Owner: -
--

ALTER TABLE ONLY booking_app.bookings
    ADD CONSTRAINT bookings_tenant_id_center_id_channel_id_channels_tenant_id_cent FOREIGN KEY (tenant_id, center_id, channel_id) REFERENCES booking_app.channels(tenant_id, center_id, id);


--
-- Name: bookings bookings_tenant_id_center_id_slot_id_slots_tenant_id_center_id_; Type: FK CONSTRAINT; Schema: booking_app; Owner: -
--

ALTER TABLE ONLY booking_app.bookings
    ADD CONSTRAINT bookings_tenant_id_center_id_slot_id_slots_tenant_id_center_id_ FOREIGN KEY (tenant_id, center_id, slot_id) REFERENCES booking_app.slots(tenant_id, center_id, id);


--
-- Name: bookings bookings_tenant_id_tenants_id_fk; Type: FK CONSTRAINT; Schema: booking_app; Owner: -
--

ALTER TABLE ONLY booking_app.bookings
    ADD CONSTRAINT bookings_tenant_id_tenants_id_fk FOREIGN KEY (tenant_id) REFERENCES iam_app.tenants(id);


--
-- Name: capability_verifiers capability_verifiers_tenant_id_booking_id_bookings_tenant_id_id; Type: FK CONSTRAINT; Schema: booking_app; Owner: -
--

ALTER TABLE ONLY booking_app.capability_verifiers
    ADD CONSTRAINT capability_verifiers_tenant_id_booking_id_bookings_tenant_id_id FOREIGN KEY (tenant_id, booking_id) REFERENCES booking_app.bookings(tenant_id, id);


--
-- Name: capability_verifiers capability_verifiers_tenant_id_tenants_id_fk; Type: FK CONSTRAINT; Schema: booking_app; Owner: -
--

ALTER TABLE ONLY booking_app.capability_verifiers
    ADD CONSTRAINT capability_verifiers_tenant_id_tenants_id_fk FOREIGN KEY (tenant_id) REFERENCES iam_app.tenants(id);


--
-- Name: channels channels_tenant_id_center_id_activity_id_activities_tenant_id_c; Type: FK CONSTRAINT; Schema: booking_app; Owner: -
--

ALTER TABLE ONLY booking_app.channels
    ADD CONSTRAINT channels_tenant_id_center_id_activity_id_activities_tenant_id_c FOREIGN KEY (tenant_id, center_id, activity_id) REFERENCES booking_app.activities(tenant_id, center_id, id);


--
-- Name: channels channels_tenant_id_center_id_centers_tenant_id_id_fk; Type: FK CONSTRAINT; Schema: booking_app; Owner: -
--

ALTER TABLE ONLY booking_app.channels
    ADD CONSTRAINT channels_tenant_id_center_id_centers_tenant_id_id_fk FOREIGN KEY (tenant_id, center_id) REFERENCES iam_app.centers(tenant_id, id);


--
-- Name: channels channels_tenant_id_tenants_id_fk; Type: FK CONSTRAINT; Schema: booking_app; Owner: -
--

ALTER TABLE ONLY booking_app.channels
    ADD CONSTRAINT channels_tenant_id_tenants_id_fk FOREIGN KEY (tenant_id) REFERENCES iam_app.tenants(id);


--
-- Name: slots slots_tenant_id_center_id_activity_id_activities_tenant_id_cent; Type: FK CONSTRAINT; Schema: booking_app; Owner: -
--

ALTER TABLE ONLY booking_app.slots
    ADD CONSTRAINT slots_tenant_id_center_id_activity_id_activities_tenant_id_cent FOREIGN KEY (tenant_id, center_id, activity_id) REFERENCES booking_app.activities(tenant_id, center_id, id);


--
-- Name: slots slots_tenant_id_center_id_centers_tenant_id_id_fk; Type: FK CONSTRAINT; Schema: booking_app; Owner: -
--

ALTER TABLE ONLY booking_app.slots
    ADD CONSTRAINT slots_tenant_id_center_id_centers_tenant_id_id_fk FOREIGN KEY (tenant_id, center_id) REFERENCES iam_app.centers(tenant_id, id);


--
-- Name: slots slots_tenant_id_tenants_id_fk; Type: FK CONSTRAINT; Schema: booking_app; Owner: -
--

ALTER TABLE ONLY booking_app.slots
    ADD CONSTRAINT slots_tenant_id_tenants_id_fk FOREIGN KEY (tenant_id) REFERENCES iam_app.tenants(id);


--
-- Name: audit_records audit_records_tenant_id_tenants_id_fk; Type: FK CONSTRAINT; Schema: iam_app; Owner: -
--

ALTER TABLE ONLY iam_app.audit_records
    ADD CONSTRAINT audit_records_tenant_id_tenants_id_fk FOREIGN KEY (tenant_id) REFERENCES iam_app.tenants(id);


--
-- Name: centers centers_tenant_id_tenants_id_fk; Type: FK CONSTRAINT; Schema: iam_app; Owner: -
--

ALTER TABLE ONLY iam_app.centers
    ADD CONSTRAINT centers_tenant_id_tenants_id_fk FOREIGN KEY (tenant_id) REFERENCES iam_app.tenants(id);


--
-- Name: external_identities external_identities_identity_id_identities_id_fk; Type: FK CONSTRAINT; Schema: iam_app; Owner: -
--

ALTER TABLE ONLY iam_app.external_identities
    ADD CONSTRAINT external_identities_identity_id_identities_id_fk FOREIGN KEY (identity_id) REFERENCES iam_app.identities(id);


--
-- Name: identity_tenants identity_tenants_identity_id_identities_id_fk; Type: FK CONSTRAINT; Schema: iam_app; Owner: -
--

ALTER TABLE ONLY iam_app.identity_tenants
    ADD CONSTRAINT identity_tenants_identity_id_identities_id_fk FOREIGN KEY (identity_id) REFERENCES iam_app.identities(id);


--
-- Name: identity_tenants identity_tenants_tenant_id_tenants_id_fk; Type: FK CONSTRAINT; Schema: iam_app; Owner: -
--

ALTER TABLE ONLY iam_app.identity_tenants
    ADD CONSTRAINT identity_tenants_tenant_id_tenants_id_fk FOREIGN KEY (tenant_id) REFERENCES iam_app.tenants(id);


--
-- Name: identity_webhook_inbox identity_webhook_inbox_resolved_identity_id_identities_id_fk; Type: FK CONSTRAINT; Schema: iam_app; Owner: -
--

ALTER TABLE ONLY iam_app.identity_webhook_inbox
    ADD CONSTRAINT identity_webhook_inbox_resolved_identity_id_identities_id_fk FOREIGN KEY (resolved_identity_id) REFERENCES iam_app.identities(id);


--
-- Name: invitations invitations_tenant_id_membership_id_memberships_tenant_id_id_fk; Type: FK CONSTRAINT; Schema: iam_app; Owner: -
--

ALTER TABLE ONLY iam_app.invitations
    ADD CONSTRAINT invitations_tenant_id_membership_id_memberships_tenant_id_id_fk FOREIGN KEY (tenant_id, membership_id) REFERENCES iam_app.memberships(tenant_id, id);


--
-- Name: invitations invitations_tenant_id_tenants_id_fk; Type: FK CONSTRAINT; Schema: iam_app; Owner: -
--

ALTER TABLE ONLY iam_app.invitations
    ADD CONSTRAINT invitations_tenant_id_tenants_id_fk FOREIGN KEY (tenant_id) REFERENCES iam_app.tenants(id);


--
-- Name: memberships memberships_identity_id_identities_id_fk; Type: FK CONSTRAINT; Schema: iam_app; Owner: -
--

ALTER TABLE ONLY iam_app.memberships
    ADD CONSTRAINT memberships_identity_id_identities_id_fk FOREIGN KEY (identity_id) REFERENCES iam_app.identities(id);


--
-- Name: memberships memberships_tenant_id_tenants_id_fk; Type: FK CONSTRAINT; Schema: iam_app; Owner: -
--

ALTER TABLE ONLY iam_app.memberships
    ADD CONSTRAINT memberships_tenant_id_tenants_id_fk FOREIGN KEY (tenant_id) REFERENCES iam_app.tenants(id);


--
-- Name: outbox_events outbox_events_tenant_id_tenants_id_fk; Type: FK CONSTRAINT; Schema: iam_app; Owner: -
--

ALTER TABLE ONLY iam_app.outbox_events
    ADD CONSTRAINT outbox_events_tenant_id_tenants_id_fk FOREIGN KEY (tenant_id) REFERENCES iam_app.tenants(id);


--
-- Name: tenant_contexts tenant_contexts_identity_id_identities_id_fk; Type: FK CONSTRAINT; Schema: iam_app; Owner: -
--

ALTER TABLE ONLY iam_app.tenant_contexts
    ADD CONSTRAINT tenant_contexts_identity_id_identities_id_fk FOREIGN KEY (identity_id) REFERENCES iam_app.identities(id);


--
-- Name: tenant_contexts tenant_contexts_tenant_id_tenants_id_fk; Type: FK CONSTRAINT; Schema: iam_app; Owner: -
--

ALTER TABLE ONLY iam_app.tenant_contexts
    ADD CONSTRAINT tenant_contexts_tenant_id_tenants_id_fk FOREIGN KEY (tenant_id) REFERENCES iam_app.tenants(id);


--
-- Name: activities; Type: ROW SECURITY; Schema: booking_app; Owner: -
--

ALTER TABLE booking_app.activities ENABLE ROW LEVEL SECURITY;

--
-- Name: activities activities_isolation; Type: POLICY; Schema: booking_app; Owner: -
--

CREATE POLICY activities_isolation ON booking_app.activities USING ((tenant_id = (current_setting('app.tenant_id'::text))::uuid)) WITH CHECK ((tenant_id = (current_setting('app.tenant_id'::text))::uuid));


--
-- Name: bookings; Type: ROW SECURITY; Schema: booking_app; Owner: -
--

ALTER TABLE booking_app.bookings ENABLE ROW LEVEL SECURITY;

--
-- Name: bookings bookings_isolation; Type: POLICY; Schema: booking_app; Owner: -
--

CREATE POLICY bookings_isolation ON booking_app.bookings USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: capability_verifiers; Type: ROW SECURITY; Schema: booking_app; Owner: -
--

ALTER TABLE booking_app.capability_verifiers ENABLE ROW LEVEL SECURITY;

--
-- Name: capability_verifiers capability_verifiers_isolation; Type: POLICY; Schema: booking_app; Owner: -
--

CREATE POLICY capability_verifiers_isolation ON booking_app.capability_verifiers USING ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: channels; Type: ROW SECURITY; Schema: booking_app; Owner: -
--

ALTER TABLE booking_app.channels ENABLE ROW LEVEL SECURITY;

--
-- Name: channels channels_isolation; Type: POLICY; Schema: booking_app; Owner: -
--

CREATE POLICY channels_isolation ON booking_app.channels USING (((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid) OR (public_id = current_setting('app.public_channel_id'::text, true)))) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


--
-- Name: slots; Type: ROW SECURITY; Schema: booking_app; Owner: -
--

ALTER TABLE booking_app.slots ENABLE ROW LEVEL SECURITY;

--
-- Name: slots slots_isolation; Type: POLICY; Schema: booking_app; Owner: -
--

CREATE POLICY slots_isolation ON booking_app.slots USING ((tenant_id = (current_setting('app.tenant_id'::text))::uuid)) WITH CHECK ((tenant_id = (current_setting('app.tenant_id'::text))::uuid));


--
-- Name: audit_records audit_isolation; Type: POLICY; Schema: iam_app; Owner: -
--

CREATE POLICY audit_isolation ON iam_app.audit_records USING ((tenant_id = (current_setting('app.tenant_id'::text))::uuid)) WITH CHECK ((tenant_id = (current_setting('app.tenant_id'::text))::uuid));


--
-- Name: audit_records; Type: ROW SECURITY; Schema: iam_app; Owner: -
--

ALTER TABLE iam_app.audit_records ENABLE ROW LEVEL SECURITY;

--
-- Name: centers; Type: ROW SECURITY; Schema: iam_app; Owner: -
--

ALTER TABLE iam_app.centers ENABLE ROW LEVEL SECURITY;

--
-- Name: centers centers_isolation; Type: POLICY; Schema: iam_app; Owner: -
--

CREATE POLICY centers_isolation ON iam_app.centers USING ((tenant_id = (current_setting('app.tenant_id'::text))::uuid)) WITH CHECK ((tenant_id = (current_setting('app.tenant_id'::text))::uuid));


--
-- Name: invitations; Type: ROW SECURITY; Schema: iam_app; Owner: -
--

ALTER TABLE iam_app.invitations ENABLE ROW LEVEL SECURITY;

--
-- Name: invitations invitations_isolation; Type: POLICY; Schema: iam_app; Owner: -
--

CREATE POLICY invitations_isolation ON iam_app.invitations USING ((tenant_id = (current_setting('app.tenant_id'::text))::uuid)) WITH CHECK ((tenant_id = (current_setting('app.tenant_id'::text))::uuid));


--
-- Name: memberships; Type: ROW SECURITY; Schema: iam_app; Owner: -
--

ALTER TABLE iam_app.memberships ENABLE ROW LEVEL SECURITY;

--
-- Name: memberships memberships_isolation; Type: POLICY; Schema: iam_app; Owner: -
--

CREATE POLICY memberships_isolation ON iam_app.memberships USING ((tenant_id = (current_setting('app.tenant_id'::text))::uuid)) WITH CHECK ((tenant_id = (current_setting('app.tenant_id'::text))::uuid));


--
-- Name: outbox_events; Type: ROW SECURITY; Schema: iam_app; Owner: -
--

ALTER TABLE iam_app.outbox_events ENABLE ROW LEVEL SECURITY;

--
-- Name: outbox_events outbox_isolation; Type: POLICY; Schema: iam_app; Owner: -
--

CREATE POLICY outbox_isolation ON iam_app.outbox_events USING ((tenant_id = (current_setting('app.tenant_id'::text))::uuid)) WITH CHECK ((tenant_id = (current_setting('app.tenant_id'::text))::uuid));


--
-- Name: tenant_contexts; Type: ROW SECURITY; Schema: iam_app; Owner: -
--

ALTER TABLE iam_app.tenant_contexts ENABLE ROW LEVEL SECURITY;

--
-- Name: tenant_contexts tenant_contexts_isolation; Type: POLICY; Schema: iam_app; Owner: -
--

CREATE POLICY tenant_contexts_isolation ON iam_app.tenant_contexts USING ((tenant_id = (current_setting('app.tenant_id'::text))::uuid)) WITH CHECK ((tenant_id = (current_setting('app.tenant_id'::text))::uuid));


--
-- Name: tenants; Type: ROW SECURITY; Schema: iam_app; Owner: -
--

ALTER TABLE iam_app.tenants ENABLE ROW LEVEL SECURITY;

--
-- Name: tenants tenants_isolation; Type: POLICY; Schema: iam_app; Owner: -
--

CREATE POLICY tenants_isolation ON iam_app.tenants USING ((id = (current_setting('app.tenant_id'::text))::uuid)) WITH CHECK ((id = (current_setting('app.tenant_id'::text))::uuid));


--
-- Name: SCHEMA booking_app; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA booking_app TO dive_app;


--
-- Name: SCHEMA iam_app; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA iam_app TO dive_app;


--
-- Name: FUNCTION resolve_public_channel(p_public_id text); Type: ACL; Schema: booking_app; Owner: -
--

REVOKE ALL ON FUNCTION booking_app.resolve_public_channel(p_public_id text) FROM PUBLIC;
GRANT ALL ON FUNCTION booking_app.resolve_public_channel(p_public_id text) TO dive_app;


--
-- Name: FUNCTION apply_identity_webhook_command(p_provider_event_id text, p_issuer text, p_event_type text, p_subject text, p_occurred_at timestamp with time zone, p_correlation_id uuid, p_session_id_hash text); Type: ACL; Schema: iam_app; Owner: -
--

REVOKE ALL ON FUNCTION iam_app.apply_identity_webhook_command(p_provider_event_id text, p_issuer text, p_event_type text, p_subject text, p_occurred_at timestamp with time zone, p_correlation_id uuid, p_session_id_hash text) FROM PUBLIC;
GRANT ALL ON FUNCTION iam_app.apply_identity_webhook_command(p_provider_event_id text, p_issuer text, p_event_type text, p_subject text, p_occurred_at timestamp with time zone, p_correlation_id uuid, p_session_id_hash text) TO dive_app;


--
-- Name: FUNCTION cleanup_revoked_tenant_contexts_command(); Type: ACL; Schema: iam_app; Owner: -
--

REVOKE ALL ON FUNCTION iam_app.cleanup_revoked_tenant_contexts_command() FROM PUBLIC;
GRANT ALL ON FUNCTION iam_app.cleanup_revoked_tenant_contexts_command() TO dive_app;


--
-- Name: FUNCTION disable_membership_command(p_issuer text, p_subject text, p_tenant_id uuid, p_membership_id uuid, p_correlation_id uuid); Type: ACL; Schema: iam_app; Owner: -
--

REVOKE ALL ON FUNCTION iam_app.disable_membership_command(p_issuer text, p_subject text, p_tenant_id uuid, p_membership_id uuid, p_correlation_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION iam_app.disable_membership_command(p_issuer text, p_subject text, p_tenant_id uuid, p_membership_id uuid, p_correlation_id uuid) TO dive_app;


--
-- Name: FUNCTION enforce_invitation_transition(); Type: ACL; Schema: iam_app; Owner: -
--

REVOKE ALL ON FUNCTION iam_app.enforce_invitation_transition() FROM PUBLIC;


--
-- Name: FUNCTION enforce_membership_lifecycle(); Type: ACL; Schema: iam_app; Owner: -
--

REVOKE ALL ON FUNCTION iam_app.enforce_membership_lifecycle() FROM PUBLIC;


--
-- Name: FUNCTION issue_invitation_command(p_issuer text, p_subject text, p_tenant_id uuid, p_invitation_id uuid, p_membership_id uuid, p_target_address text, p_roles text[], p_center_ids uuid[], p_credential_hash text, p_idempotency_key text, p_reissue_invitation_id uuid, p_correlation_id uuid); Type: ACL; Schema: iam_app; Owner: -
--

REVOKE ALL ON FUNCTION iam_app.issue_invitation_command(p_issuer text, p_subject text, p_tenant_id uuid, p_invitation_id uuid, p_membership_id uuid, p_target_address text, p_roles text[], p_center_ids uuid[], p_credential_hash text, p_idempotency_key text, p_reissue_invitation_id uuid, p_correlation_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION iam_app.issue_invitation_command(p_issuer text, p_subject text, p_tenant_id uuid, p_invitation_id uuid, p_membership_id uuid, p_target_address text, p_roles text[], p_center_ids uuid[], p_credential_hash text, p_idempotency_key text, p_reissue_invitation_id uuid, p_correlation_id uuid) TO dive_app;


--
-- Name: FUNCTION issue_tenant_context_command(p_issuer text, p_subject text, p_session_id_hash text, p_tenant_id uuid, p_handle_hash text); Type: ACL; Schema: iam_app; Owner: -
--

REVOKE ALL ON FUNCTION iam_app.issue_tenant_context_command(p_issuer text, p_subject text, p_session_id_hash text, p_tenant_id uuid, p_handle_hash text) FROM PUBLIC;
GRANT ALL ON FUNCTION iam_app.issue_tenant_context_command(p_issuer text, p_subject text, p_session_id_hash text, p_tenant_id uuid, p_handle_hash text) TO dive_app;


--
-- Name: FUNCTION list_operators_command(p_issuer text, p_subject text); Type: ACL; Schema: iam_app; Owner: -
--

REVOKE ALL ON FUNCTION iam_app.list_operators_command(p_issuer text, p_subject text) FROM PUBLIC;
GRANT ALL ON FUNCTION iam_app.list_operators_command(p_issuer text, p_subject text) TO dive_app;


--
-- Name: FUNCTION prevent_last_owner_removal(); Type: ACL; Schema: iam_app; Owner: -
--

REVOKE ALL ON FUNCTION iam_app.prevent_last_owner_removal() FROM PUBLIC;


--
-- Name: FUNCTION record_booking_catalog_mutation(p_tenant_id uuid, p_actor_identity_id uuid, p_action text, p_resource_type text, p_resource_id uuid, p_event_type text, p_payload jsonb, p_correlation_id uuid, p_idempotency_key text); Type: ACL; Schema: iam_app; Owner: -
--

REVOKE ALL ON FUNCTION iam_app.record_booking_catalog_mutation(p_tenant_id uuid, p_actor_identity_id uuid, p_action text, p_resource_type text, p_resource_id uuid, p_event_type text, p_payload jsonb, p_correlation_id uuid, p_idempotency_key text) FROM PUBLIC;
GRANT ALL ON FUNCTION iam_app.record_booking_catalog_mutation(p_tenant_id uuid, p_actor_identity_id uuid, p_action text, p_resource_type text, p_resource_id uuid, p_event_type text, p_payload jsonb, p_correlation_id uuid, p_idempotency_key text) TO dive_app;


--
-- Name: FUNCTION record_public_booking_created(p_tenant_id uuid, p_booking_id uuid, p_correlation_id uuid); Type: ACL; Schema: iam_app; Owner: -
--

REVOKE ALL ON FUNCTION iam_app.record_public_booking_created(p_tenant_id uuid, p_booking_id uuid, p_correlation_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION iam_app.record_public_booking_created(p_tenant_id uuid, p_booking_id uuid, p_correlation_id uuid) TO dive_app;


--
-- Name: FUNCTION resolve_access(p_issuer text, p_subject text, p_tenant uuid); Type: ACL; Schema: iam_app; Owner: -
--

REVOKE ALL ON FUNCTION iam_app.resolve_access(p_issuer text, p_subject text, p_tenant uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION iam_app.resolve_access(p_issuer text, p_subject text, p_tenant uuid) TO dive_app;


--
-- Name: FUNCTION resolve_tenant_context_command(p_issuer text, p_subject text, p_session_id_hash text, p_handle_hash text); Type: ACL; Schema: iam_app; Owner: -
--

REVOKE ALL ON FUNCTION iam_app.resolve_tenant_context_command(p_issuer text, p_subject text, p_session_id_hash text, p_handle_hash text) FROM PUBLIC;
GRANT ALL ON FUNCTION iam_app.resolve_tenant_context_command(p_issuer text, p_subject text, p_session_id_hash text, p_handle_hash text) TO dive_app;


--
-- Name: FUNCTION respond_invitation_command(p_issuer text, p_subject text, p_verified_addresses text[], p_tenant_id uuid, p_credential_hash text, p_decision text, p_new_identity_id uuid, p_correlation_id uuid); Type: ACL; Schema: iam_app; Owner: -
--

REVOKE ALL ON FUNCTION iam_app.respond_invitation_command(p_issuer text, p_subject text, p_verified_addresses text[], p_tenant_id uuid, p_credential_hash text, p_decision text, p_new_identity_id uuid, p_correlation_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION iam_app.respond_invitation_command(p_issuer text, p_subject text, p_verified_addresses text[], p_tenant_id uuid, p_credential_hash text, p_decision text, p_new_identity_id uuid, p_correlation_id uuid) TO dive_app;


--
-- Name: FUNCTION revoke_invitation_command(p_issuer text, p_subject text, p_tenant_id uuid, p_invitation_id uuid, p_correlation_id uuid); Type: ACL; Schema: iam_app; Owner: -
--

REVOKE ALL ON FUNCTION iam_app.revoke_invitation_command(p_issuer text, p_subject text, p_tenant_id uuid, p_invitation_id uuid, p_correlation_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION iam_app.revoke_invitation_command(p_issuer text, p_subject text, p_tenant_id uuid, p_invitation_id uuid, p_correlation_id uuid) TO dive_app;


--
-- Name: FUNCTION revoke_tenant_context_command(p_issuer text, p_subject text, p_session_id_hash text, p_handle_hash text); Type: ACL; Schema: iam_app; Owner: -
--

REVOKE ALL ON FUNCTION iam_app.revoke_tenant_context_command(p_issuer text, p_subject text, p_session_id_hash text, p_handle_hash text) FROM PUBLIC;
GRANT ALL ON FUNCTION iam_app.revoke_tenant_context_command(p_issuer text, p_subject text, p_session_id_hash text, p_handle_hash text) TO dive_app;


--
-- Name: FUNCTION sync_identity_tenant_binding(); Type: ACL; Schema: iam_app; Owner: -
--

REVOKE ALL ON FUNCTION iam_app.sync_identity_tenant_binding() FROM PUBLIC;


--
-- Name: FUNCTION validate_membership_centers(); Type: ACL; Schema: iam_app; Owner: -
--

REVOKE ALL ON FUNCTION iam_app.validate_membership_centers() FROM PUBLIC;


--
-- Name: TABLE activities; Type: ACL; Schema: booking_app; Owner: -
--

GRANT SELECT,INSERT ON TABLE booking_app.activities TO dive_app;


--
-- Name: COLUMN activities.name; Type: ACL; Schema: booking_app; Owner: -
--

GRANT UPDATE(name) ON TABLE booking_app.activities TO dive_app;


--
-- Name: COLUMN activities.description; Type: ACL; Schema: booking_app; Owner: -
--

GRANT UPDATE(description) ON TABLE booking_app.activities TO dive_app;


--
-- Name: COLUMN activities.default_capacity; Type: ACL; Schema: booking_app; Owner: -
--

GRANT UPDATE(default_capacity) ON TABLE booking_app.activities TO dive_app;


--
-- Name: COLUMN activities.status; Type: ACL; Schema: booking_app; Owner: -
--

GRANT UPDATE(status) ON TABLE booking_app.activities TO dive_app;


--
-- Name: TABLE bookings; Type: ACL; Schema: booking_app; Owner: -
--

GRANT SELECT,INSERT ON TABLE booking_app.bookings TO dive_app;


--
-- Name: COLUMN bookings.status; Type: ACL; Schema: booking_app; Owner: -
--

GRANT UPDATE(status) ON TABLE booking_app.bookings TO dive_app;


--
-- Name: TABLE capability_verifiers; Type: ACL; Schema: booking_app; Owner: -
--

GRANT SELECT,INSERT ON TABLE booking_app.capability_verifiers TO dive_app;


--
-- Name: COLUMN capability_verifiers.consumed_at; Type: ACL; Schema: booking_app; Owner: -
--

GRANT UPDATE(consumed_at) ON TABLE booking_app.capability_verifiers TO dive_app;


--
-- Name: COLUMN capability_verifiers.revoked_at; Type: ACL; Schema: booking_app; Owner: -
--

GRANT UPDATE(revoked_at) ON TABLE booking_app.capability_verifiers TO dive_app;


--
-- Name: TABLE channels; Type: ACL; Schema: booking_app; Owner: -
--

GRANT SELECT ON TABLE booking_app.channels TO dive_app;


--
-- Name: COLUMN channels.confirmation_mode; Type: ACL; Schema: booking_app; Owner: -
--

GRANT UPDATE(confirmation_mode) ON TABLE booking_app.channels TO dive_app;


--
-- Name: TABLE slots; Type: ACL; Schema: booking_app; Owner: -
--

GRANT SELECT,INSERT ON TABLE booking_app.slots TO dive_app;


--
-- Name: COLUMN slots.status; Type: ACL; Schema: booking_app; Owner: -
--

GRANT UPDATE(status) ON TABLE booking_app.slots TO dive_app;


--
-- Name: TABLE centers; Type: ACL; Schema: iam_app; Owner: -
--

GRANT SELECT ON TABLE iam_app.centers TO dive_app;


--
-- Name: TABLE tenants; Type: ACL; Schema: iam_app; Owner: -
--

GRANT SELECT ON TABLE iam_app.tenants TO dive_app;


--
-- PostgreSQL database dump complete
--
