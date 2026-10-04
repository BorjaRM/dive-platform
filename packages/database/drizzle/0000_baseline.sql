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
-- Name: onboarding_app; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA onboarding_app;


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
-- Name: claim_invitation_outbox_event(); Type: FUNCTION; Schema: iam_app; Owner: -
--

CREATE FUNCTION iam_app.claim_invitation_outbox_event() RETURNS TABLE(event_id uuid, tenant_id uuid, invitation_id uuid, command text, target_address text, invitation_attempt_id uuid, provider_invitation_ref text, invitation_status text, attempt_count integer, correlation_id uuid)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'iam_app', 'pg_temp'
    AS $$
DECLARE
  v_candidate record;
  v_event record;
  v_invitation record;
	v_invitation_id uuid;
  v_previous_tenant_id text := current_setting('app.tenant_id', true);
  v_claimed boolean := false;
BEGIN
  FOR v_candidate IN
    SELECT event.id, event.tenant_id
    FROM iam_app.outbox_events AS event
    WHERE event.event_type IN ('iam.invitation.issued.v1', 'iam.invitation.revoked.v1')
      AND event.delivery_status IN ('pending', 'retrying')
      AND (event.delivery_next_attempt_at IS NULL OR event.delivery_next_attempt_at <= now())
    ORDER BY event.created_at, event.id
  LOOP
    PERFORM set_config('app.tenant_id', v_candidate.tenant_id::text, true);
    SELECT event.id, event.tenant_id, event.event_type, event.payload,
         event.delivery_attempt_count, event.correlation_id
    INTO v_event
    FROM iam_app.outbox_events AS event
    WHERE event.tenant_id = v_candidate.tenant_id AND event.id = v_candidate.id
      AND event.event_type IN ('iam.invitation.issued.v1', 'iam.invitation.revoked.v1')
      AND event.delivery_status IN ('pending', 'retrying')
      AND (event.delivery_next_attempt_at IS NULL OR event.delivery_next_attempt_at <= now())
    FOR UPDATE SKIP LOCKED;
    IF FOUND THEN
      v_claimed := true;
      EXIT;
    END IF;
  END LOOP;
  IF NOT v_claimed THEN
    PERFORM set_config('app.tenant_id', COALESCE(v_previous_tenant_id, ''), true);
    RETURN;
  END IF;

	v_invitation_id := NULLIF(v_event.payload->>'invitationId', '')::uuid;
  SELECT invitation.id, invitation.target_address, invitation.invitation_attempt_id,
       invitation.provider_invitation_id, invitation.status
	INTO v_invitation
	FROM iam_app.invitations AS invitation
	WHERE invitation.tenant_id = v_event.tenant_id
		AND invitation.id = v_invitation_id
	FOR UPDATE;

	IF NOT FOUND THEN
		UPDATE iam_app.outbox_events AS event
		SET delivery_status = 'dead_letter',
				delivery_next_attempt_at = NULL,
				provider_status = 'invitation_missing'
		WHERE event.tenant_id = v_event.tenant_id AND event.id = v_event.id;
    PERFORM set_config('app.tenant_id', COALESCE(v_previous_tenant_id, ''), true);
		RETURN;
	END IF;

	UPDATE iam_app.outbox_events AS event
	SET delivery_status = 'retrying',
			delivery_attempt_count = delivery_attempt_count + 1,
			delivery_next_attempt_at = NULL
	WHERE event.tenant_id = v_event.tenant_id AND event.id = v_event.id;

	RETURN QUERY SELECT
		v_event.id,
		v_event.tenant_id,
		v_invitation.id,
		CASE v_event.event_type
			WHEN 'iam.invitation.issued.v1' THEN 'create'
			ELSE 'revoke'
		END,
		v_invitation.target_address,
		v_invitation.invitation_attempt_id,
		v_invitation.provider_invitation_id,
		v_invitation.status,
		v_event.delivery_attempt_count + 1,
		v_event.correlation_id;
END $$;


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
-- Name: complete_invitation_outbox_event(uuid, text, text); Type: FUNCTION; Schema: iam_app; Owner: -
--

CREATE FUNCTION iam_app.complete_invitation_outbox_event(p_tenant_id uuid, p_event_id uuid, p_provider_invitation_ref text, p_provider_status text) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'iam_app', 'pg_temp'
    AS $$
DECLARE
  v_event record;
	v_invitation_id uuid;
	v_invitation_status text;
BEGIN
  IF p_tenant_id IS NULL OR current_setting('app.tenant_id', true) IS DISTINCT FROM p_tenant_id::text THEN
    RAISE EXCEPTION 'Invitation delivery scope is invalid' USING ERRCODE = '42501';
  END IF;
	IF NULLIF(btrim(p_provider_status), '') IS NULL THEN
		RAISE EXCEPTION 'Provider status is required' USING ERRCODE = '23514';
	END IF;
  SELECT event.id, event.tenant_id, event.event_type, event.payload
	INTO v_event
	FROM iam_app.outbox_events AS event
  WHERE event.tenant_id = p_tenant_id AND event.id = p_event_id
    AND event.event_type IN ('iam.invitation.issued.v1', 'iam.invitation.revoked.v1')
    AND event.delivery_status = 'retrying'
    AND EXISTS (
      SELECT 1 FROM pg_catalog.pg_locks AS claim_lock
      WHERE claim_lock.locktype = 'transactionid'
        AND claim_lock.transactionid = event.xmin
        AND claim_lock.pid = pg_backend_pid()
        AND claim_lock.mode = 'ExclusiveLock' AND claim_lock.granted
    )
	FOR UPDATE;
	IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation delivery scope is invalid' USING ERRCODE = '42501';
	END IF;

	v_invitation_id := NULLIF(v_event.payload->>'invitationId', '')::uuid;
	SELECT invitation.status
	INTO v_invitation_status
	FROM iam_app.invitations AS invitation
	WHERE invitation.tenant_id = v_event.tenant_id
		AND invitation.id = v_invitation_id
	FOR UPDATE;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'Invitation is missing' USING ERRCODE = 'P0002';
	END IF;

	IF v_event.event_type = 'iam.invitation.issued.v1'
		AND p_provider_invitation_ref IS NULL
		AND v_invitation_status = 'pending' THEN
		RAISE EXCEPTION 'Provider invitation reference is required' USING ERRCODE = '23514';
	END IF;

	UPDATE iam_app.outbox_events AS event
	SET delivery_status = 'succeeded',
			delivery_next_attempt_at = NULL,
			provider_status = p_provider_status
	WHERE event.tenant_id = v_event.tenant_id AND event.id = v_event.id;

	IF v_event.event_type = 'iam.invitation.issued.v1' THEN
		UPDATE iam_app.invitations AS invitation
		SET provider_kind = CASE
					WHEN p_provider_invitation_ref IS NULL THEN provider_kind
					ELSE 'clerk'
				END,
				provider_invitation_id = COALESCE(
					p_provider_invitation_ref, provider_invitation_id
				),
				delivery_status = 'succeeded',
				delivery_next_attempt_at = NULL,
				provider_status = p_provider_status
		WHERE invitation.tenant_id = v_event.tenant_id
			AND invitation.id = v_invitation_id;
	ELSE
		UPDATE iam_app.invitations AS invitation
		SET provider_status = p_provider_status
		WHERE invitation.tenant_id = v_event.tenant_id
			AND invitation.id = v_invitation_id;
	END IF;
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
    INSERT INTO iam_app.audit_records (
      id, tenant_id, actor_identity_id, action, resource_type, resource_id,
      result, reason, correlation_id
    ) VALUES (
      gen_random_uuid(), p_tenant_id, v_actor_identity_id, 'membership.disable',
      'membership', p_membership_id, 'denied', 'permission_missing', p_correlation_id
    );
    RETURN jsonb_build_object('deniedReason', 'permission_missing');
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
    OR (OLD.target_address_canonical IS DISTINCT FROM NEW.target_address_canonical
      AND OLD.target_address_canonical <> '')
    OR OLD.credential_hash IS DISTINCT FROM NEW.credential_hash
    OR (OLD.invitation_attempt_id IS DISTINCT FROM NEW.invitation_attempt_id
      AND OLD.target_address_canonical <> '')
    OR OLD.idempotency_key IS DISTINCT FROM NEW.idempotency_key
    OR OLD.issued_at IS DISTINCT FROM NEW.issued_at
    OR OLD.expires_at IS DISTINCT FROM NEW.expires_at
    OR (OLD.provider_invitation_id IS NOT NULL
      AND OLD.provider_invitation_id IS DISTINCT FROM NEW.provider_invitation_id)
    OR (OLD.provider_kind IS NOT NULL
      AND OLD.provider_kind IS DISTINCT FROM NEW.provider_kind) THEN
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
-- Name: fail_invitation_outbox_event(uuid, boolean, timestamp with time zone, text); Type: FUNCTION; Schema: iam_app; Owner: -
--

CREATE FUNCTION iam_app.fail_invitation_outbox_event(p_tenant_id uuid, p_event_id uuid, p_retryable boolean, p_next_attempt_at timestamp with time zone, p_provider_status text) RETURNS text
  LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'iam_app', 'pg_temp'
    AS $$
DECLARE
  v_event record;
	v_state text;
	v_invitation_id uuid;
BEGIN
  IF p_tenant_id IS NULL OR current_setting('app.tenant_id', true) IS DISTINCT FROM p_tenant_id::text THEN
    RAISE EXCEPTION 'Invitation delivery scope is invalid' USING ERRCODE = '42501';
  END IF;
  SELECT event.id, event.tenant_id, event.event_type, event.payload
	INTO v_event
	FROM iam_app.outbox_events AS event
  WHERE event.tenant_id = p_tenant_id AND event.id = p_event_id
    AND event.event_type IN ('iam.invitation.issued.v1', 'iam.invitation.revoked.v1')
    AND event.delivery_status = 'retrying'
    AND EXISTS (
      SELECT 1 FROM pg_catalog.pg_locks AS claim_lock
      WHERE claim_lock.locktype = 'transactionid'
        AND claim_lock.transactionid = event.xmin
        AND claim_lock.pid = pg_backend_pid()
        AND claim_lock.mode = 'ExclusiveLock' AND claim_lock.granted
    )
	FOR UPDATE;
	IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation delivery scope is invalid' USING ERRCODE = '42501';
	END IF;
	v_state := CASE
		WHEN p_retryable AND p_next_attempt_at IS NOT NULL THEN 'retrying'
		ELSE 'dead_letter'
	END;
	UPDATE iam_app.outbox_events AS event
	SET delivery_status = v_state,
			delivery_next_attempt_at = CASE
				WHEN v_state = 'retrying' THEN p_next_attempt_at
				ELSE NULL
			END,
			provider_status = p_provider_status
	WHERE event.tenant_id = v_event.tenant_id AND event.id = v_event.id;

	IF v_event.event_type = 'iam.invitation.issued.v1' THEN
		v_invitation_id := NULLIF(v_event.payload->>'invitationId', '')::uuid;
		UPDATE iam_app.invitations AS invitation
		SET delivery_status = v_state,
				delivery_next_attempt_at = CASE
					WHEN v_state = 'retrying' THEN p_next_attempt_at
					ELSE NULL
				END,
				provider_status = p_provider_status
		WHERE invitation.tenant_id = v_event.tenant_id
			AND invitation.id = v_invitation_id;
	END IF;
	RETURN v_state;
END $$;


--
-- Name: finalize_invitation_issue(jsonb, uuid, text, uuid, uuid, uuid); Type: FUNCTION; Schema: iam_app; Owner: -
--

CREATE FUNCTION iam_app.finalize_invitation_issue(p_outcome jsonb, p_tenant_id uuid, p_target_address_canonical text, p_invitation_attempt_id uuid, p_reissue_invitation_id uuid, p_correlation_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'iam_app', 'pg_temp'
    AS $$
DECLARE
  v_previous iam_app.invitations%ROWTYPE;
  v_invitation_id uuid;
  v_existing_attempt_id uuid;
  v_existing_delivery_status text;
BEGIN
  IF COALESCE((p_outcome->>'created')::boolean, false) IS NOT TRUE THEN
    IF p_outcome ? 'invitationId' THEN
      SELECT invitation_attempt_id, delivery_status
      INTO v_existing_attempt_id, v_existing_delivery_status
      FROM iam_app.invitations
      WHERE tenant_id = p_tenant_id
        AND id = (p_outcome->>'invitationId')::uuid;
      IF FOUND THEN
        RETURN p_outcome || jsonb_build_object(
            'invitationAttemptId', v_existing_attempt_id,
            'deliveryStatus', v_existing_delivery_status
        );
      END IF;
    END IF;
    RETURN p_outcome;
  END IF;
  v_invitation_id := (p_outcome->>'invitationId')::uuid;
  IF p_reissue_invitation_id IS NULL THEN
    SELECT * INTO v_previous
    FROM iam_app.invitations
    WHERE tenant_id = p_tenant_id
      AND target_address_canonical = p_target_address_canonical
      AND status = 'pending'
      AND id <> v_invitation_id
    FOR UPDATE;
    IF FOUND THEN
      UPDATE iam_app.invitations
      SET status = 'revoked',
          superseded_by_invitation_id = v_invitation_id,
          supersession_reason = 'latest_wins'
      WHERE tenant_id = p_tenant_id AND id = v_previous.id;
      UPDATE iam_app.memberships
      SET status = 'disabled'
      WHERE tenant_id = p_tenant_id AND id = v_previous.membership_id;
      INSERT INTO iam_app.outbox_events (
        id, tenant_id, event_type, payload, correlation_id, idempotency_key
      ) VALUES (
        gen_random_uuid(), p_tenant_id, 'iam.invitation.revoked.v1',
        jsonb_build_object(
          'invitationId', v_previous.id,
          'membershipId', v_previous.membership_id,
          'supersededByInvitationId', v_invitation_id
        ),
        p_correlation_id, 'invitation.latest_wins.revoked:' || v_previous.id::text
      ) ON CONFLICT (tenant_id, idempotency_key) DO NOTHING;
    END IF;
  ELSE
    UPDATE iam_app.invitations
    SET superseded_by_invitation_id = v_invitation_id,
        supersession_reason = 'explicit_reissue'
    WHERE tenant_id = p_tenant_id
      AND id = p_reissue_invitation_id
      AND status = 'revoked';
  END IF;

  UPDATE iam_app.invitations
  SET target_address_canonical = p_target_address_canonical,
      invitation_attempt_id = p_invitation_attempt_id,
      delivery_status = 'pending',
      delivery_attempt_count = 0,
      provider_status = NULL
  WHERE tenant_id = p_tenant_id AND id = v_invitation_id;

  RETURN p_outcome || jsonb_build_object(
    'invitationAttemptId', p_invitation_attempt_id,
    'deliveryStatus', 'pending'
  );
END $$;


--
-- Name: issue_invitation_command(text, text, uuid, uuid, uuid, text, text, text[], uuid[], text, uuid, text, uuid, uuid); Type: FUNCTION; Schema: iam_app; Owner: -
--

CREATE FUNCTION iam_app.issue_invitation_command(p_issuer text, p_subject text, p_tenant_id uuid, p_invitation_id uuid, p_membership_id uuid, p_target_address text, p_target_address_canonical text, p_roles text[], p_center_ids uuid[], p_credential_hash text, p_invitation_attempt_id uuid, p_idempotency_key text, p_reissue_invitation_id uuid, p_correlation_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'iam_app', 'pg_temp'
    AS $$
DECLARE
  v_outcome jsonb;
BEGIN
  IF p_target_address_canonical IS NULL OR btrim(p_target_address_canonical) = '' THEN
    RETURN jsonb_build_object('deniedReason', 'invariant_violation');
  END IF;
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_tenant_id::text || E'\n' || p_target_address_canonical, 0)
  );
  v_outcome := iam_app.issue_invitation_command_legacy(
    p_issuer, p_subject, p_tenant_id, p_invitation_id, p_membership_id,
    p_target_address, p_roles, p_center_ids, p_credential_hash,
    p_idempotency_key, p_reissue_invitation_id, p_correlation_id
  );
  RETURN iam_app.finalize_invitation_issue(
    v_outcome, p_tenant_id, p_target_address_canonical,
    p_invitation_attempt_id, p_reissue_invitation_id, p_correlation_id
  );
END $$;


--
-- Name: issue_invitation_command_legacy(text, text, uuid, uuid, uuid, text, text[], uuid[], text, text, uuid, uuid); Type: FUNCTION; Schema: iam_app; Owner: -
--

CREATE FUNCTION iam_app.issue_invitation_command_legacy(p_issuer text, p_subject text, p_tenant_id uuid, p_invitation_id uuid, p_membership_id uuid, p_target_address text, p_roles text[], p_center_ids uuid[], p_credential_hash text, p_idempotency_key text, p_reissue_invitation_id uuid, p_correlation_id uuid) RETURNS jsonb
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

  IF p_roles @> ARRAY['tenant_owner']::text[]
    AND NOT (v_actor_roles @> ARRAY['tenant_owner']::text[]) THEN
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
      'deliveryStatus', 'pending',
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

  IF p_roles @> ARRAY['tenant_owner']::text[]
    AND NOT (v_actor_roles @> ARRAY['tenant_owner']::text[]) THEN
    INSERT INTO iam_app.audit_records (
      id, tenant_id, actor_identity_id, action, resource_type, resource_id,
      result, reason, correlation_id
    ) VALUES (
      gen_random_uuid(), p_tenant_id, v_actor_identity_id, 'membership.invite',
      'invitation', p_invitation_id, 'denied', 'permission_missing', p_correlation_id
    );
    RETURN jsonb_build_object('deniedReason', 'permission_missing');
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
    IF EXISTS (
      SELECT 1
      FROM iam_app.memberships AS membership
      WHERE membership.tenant_id = p_tenant_id
        AND membership.id = v_reissue.membership_id
        AND membership.roles @> ARRAY['tenant_owner']::text[]
    ) AND NOT (v_actor_roles @> ARRAY['tenant_owner']::text[]) THEN
      INSERT INTO iam_app.audit_records (
        id, tenant_id, actor_identity_id, action, resource_type, resource_id,
        result, reason, correlation_id
      ) VALUES (
        gen_random_uuid(), p_tenant_id, v_actor_identity_id, 'membership.invite',
        'invitation', p_invitation_id, 'denied', 'permission_missing', p_correlation_id
      );
      RETURN jsonb_build_object('deniedReason', 'permission_missing');
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
    'deliveryStatus', 'pending',
    'expiresAt', v_issued.expires_at,
    'created', true
  );
END $$;


--
-- Name: issue_membership_invitation_command(text, text, uuid, uuid, uuid, text, text, text[], uuid[], text, uuid, text, uuid, uuid); Type: FUNCTION; Schema: iam_app; Owner: -
--

CREATE FUNCTION iam_app.issue_membership_invitation_command(p_issuer text, p_subject text, p_tenant_id uuid, p_invitation_id uuid, p_membership_id uuid, p_target_address text, p_target_address_canonical text, p_roles text[], p_center_ids uuid[], p_credential_hash text, p_invitation_attempt_id uuid, p_idempotency_key text, p_reissue_invitation_id uuid, p_correlation_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'iam_app', 'pg_temp'
    AS $$
DECLARE
  v_outcome jsonb;
BEGIN
  IF p_target_address_canonical IS NULL OR btrim(p_target_address_canonical) = '' THEN
    RETURN jsonb_build_object('deniedReason', 'invariant_violation');
  END IF;
      PERFORM pg_advisory_xact_lock(
        hashtextextended(p_tenant_id::text || E'\n' || p_target_address_canonical, 0)
      );
      v_outcome := iam_app.issue_membership_invitation_command_legacy(
        p_issuer, p_subject, p_tenant_id, p_invitation_id, p_membership_id,
        p_target_address, p_roles, p_center_ids, p_credential_hash,
        p_idempotency_key, p_reissue_invitation_id, p_correlation_id
      );
      RETURN iam_app.finalize_invitation_issue(
        v_outcome, p_tenant_id, p_target_address_canonical,
        p_invitation_attempt_id, p_reissue_invitation_id, p_correlation_id
      );
END $$;


--
-- Name: issue_membership_invitation_command_legacy(text, text, uuid, uuid, uuid, text, text[], uuid[], text, text, uuid, uuid); Type: FUNCTION; Schema: iam_app; Owner: -
--

CREATE FUNCTION iam_app.issue_membership_invitation_command_legacy(p_issuer text, p_subject text, p_tenant_id uuid, p_invitation_id uuid, p_membership_id uuid, p_target_address text, p_roles text[], p_center_ids uuid[], p_credential_hash text, p_idempotency_key text, p_reissue_invitation_id uuid, p_correlation_id uuid) RETURNS jsonb
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
    RETURN iam_app.issue_invitation_command_legacy(
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

  RETURN iam_app.issue_invitation_command_legacy(
    p_issuer, p_subject, p_tenant_id, p_invitation_id, p_membership_id,
    p_target_address, p_roles, p_center_ids, p_credential_hash,
    p_idempotency_key, p_reissue_invitation_id, p_correlation_id
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
    SET search_path TO 'iam_app', 'booking_app', 'pg_catalog', 'pg_temp'
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


--
-- Name: record_booking_read(uuid, uuid, uuid, text, uuid, text, text, uuid); Type: FUNCTION; Schema: iam_app; Owner: -
--

CREATE FUNCTION iam_app.record_booking_read(p_tenant_id uuid, p_actor_identity_id uuid, p_center_id uuid, p_resource_type text, p_resource_id uuid, p_result text, p_reason text, p_correlation_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'iam_app', 'booking_app', 'pg_catalog', 'pg_temp'
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
-- Name: resolve_center_entry_command(text); Type: FUNCTION; Schema: iam_app; Owner: -
--

CREATE FUNCTION iam_app.resolve_center_entry_command(p_center_key text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'iam_app', 'pg_catalog', 'pg_temp'
    AS $_$
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
END $_$;


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

  SELECT roles INTO v_invited_roles
  FROM iam_app.memberships
  WHERE tenant_id = p_tenant_id AND id = v_invitation.membership_id;
  IF v_invited_roles @> ARRAY['tenant_owner']::text[]
    AND NOT (v_actor_roles @> ARRAY['tenant_owner']::text[]) THEN
    INSERT INTO iam_app.audit_records (
      id, tenant_id, actor_identity_id, action, resource_type, resource_id,
      result, reason, correlation_id
    ) VALUES (
      gen_random_uuid(), p_tenant_id, v_actor_identity_id, 'membership.disable',
      'invitation', p_invitation_id, 'denied', 'permission_missing', p_correlation_id
    );
    RETURN jsonb_build_object('deniedReason', 'permission_missing');
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
-- Name: revoke_membership_invitation_command(text, text, uuid, uuid, uuid); Type: FUNCTION; Schema: iam_app; Owner: -
--

CREATE FUNCTION iam_app.revoke_membership_invitation_command(p_issuer text, p_subject text, p_tenant_id uuid, p_invitation_id uuid, p_correlation_id uuid) RETURNS jsonb
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


--
-- Name: revoke_owner_invitation_command(text, text, uuid, uuid, uuid); Type: FUNCTION; Schema: iam_app; Owner: -
--

CREATE FUNCTION iam_app.revoke_owner_invitation_command(p_issuer text, p_subject text, p_tenant_id uuid, p_invitation_id uuid, p_correlation_id uuid) RETURNS jsonb
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
-- Name: set_center_entry_status_command(text, text, uuid, uuid, text, text, uuid); Type: FUNCTION; Schema: iam_app; Owner: -
--

CREATE FUNCTION iam_app.set_center_entry_status_command(p_issuer text, p_subject text, p_tenant_id uuid, p_center_id uuid, p_status text, p_purpose text, p_correlation_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'iam_app', 'pg_catalog', 'pg_temp'
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
END $$;


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


--
-- Name: claim_bootstrap_outbox_event(); Type: FUNCTION; Schema: onboarding_app; Owner: -
--

CREATE FUNCTION onboarding_app.claim_bootstrap_outbox_event() RETURNS TABLE(event_id uuid, grant_id uuid, command text, destination_email text, provider_invitation_ref text, attempt_count integer, correlation_id uuid)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'onboarding_app', 'pg_catalog', 'pg_temp'
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
          WITH RECURSIVE predecessors AS (
            SELECT previous_grant.id, previous_grant.superseded_by_grant_id
            FROM onboarding_app.tenant_bootstrap_grants previous_grant
            WHERE previous_grant.superseded_by_grant_id = bootstrap_grant.id
            UNION
            SELECT previous_grant.id, previous_grant.superseded_by_grant_id
            FROM onboarding_app.tenant_bootstrap_grants previous_grant
            JOIN predecessors ON previous_grant.superseded_by_grant_id = predecessors.id
          )
          SELECT 1
          FROM predecessors previous_grant
          WHERE NOT EXISTS (
            SELECT 1
            FROM onboarding_app.tenant_bootstrap_outbox_events revocation
            WHERE revocation.grant_id = previous_grant.id
              AND revocation.command = 'revoke'
              AND revocation.idempotency_key =
                'bootstrap-revoke:' || previous_grant.id::text || ':' || previous_grant.superseded_by_grant_id::text
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


--
-- Name: complete_bootstrap_outbox_event(uuid, text, text); Type: FUNCTION; Schema: onboarding_app; Owner: -
--

CREATE FUNCTION onboarding_app.complete_bootstrap_outbox_event(p_event_id uuid, p_provider_invitation_ref text, p_provider_status text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'onboarding_app', 'pg_catalog', 'pg_temp'
    AS $$
DECLARE
	v_event onboarding_app.tenant_bootstrap_outbox_events%ROWTYPE;
BEGIN
	SELECT * INTO STRICT v_event
	FROM onboarding_app.tenant_bootstrap_outbox_events
	WHERE id = p_event_id
	FOR UPDATE;
	UPDATE onboarding_app.tenant_bootstrap_outbox_events
	SET delivery_state = 'succeeded', attempt_count = attempt_count + 1,
			completed_at = now()
	WHERE id = p_event_id;
	UPDATE onboarding_app.tenant_bootstrap_grants
	SET delivery_status = 'succeeded',
			provider_invitation_ref = coalesce(p_provider_invitation_ref, provider_invitation_ref),
			provider_status = p_provider_status
	WHERE id = v_event.grant_id;
END;
$$;


--
-- Name: complete_own_tenant_bootstrap_command(text, text, text, text[], text, text, text, text, text, uuid); Type: FUNCTION; Schema: onboarding_app; Owner: -
--

CREATE FUNCTION onboarding_app.complete_own_tenant_bootstrap_command(p_issuer text, p_subject text, p_session_id_hash text, p_verified_addresses text[], p_operator_name text, p_center_name text, p_time_zone text, p_locale text, p_completion_fingerprint text, p_correlation_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'onboarding_app', 'iam_app', 'pg_catalog', 'pg_temp'
    AS $_$
DECLARE
	v_now timestamptz := clock_timestamp();
	v_attempts timestamptz[];
	v_retry_after integer;
	v_candidate_ids uuid[];
	v_grant onboarding_app.tenant_bootstrap_grants%ROWTYPE;
	v_identity_id uuid;
	v_tenant_id uuid := gen_random_uuid();
	v_center_id uuid := gen_random_uuid();
	v_membership_id uuid := gen_random_uuid();
	v_center_key text;
	v_center_key_base text;
	v_previous_tenant_id text := current_setting('app.tenant_id', true);
	v_result jsonb;
BEGIN
	IF NULLIF(btrim(p_issuer), '') IS NULL
		OR NULLIF(btrim(p_subject), '') IS NULL
		OR p_session_id_hash !~ '^[0-9a-f]{64}$'
		OR cardinality(p_verified_addresses) = 0
		OR p_completion_fingerprint !~ '^[0-9a-f]{64}$'
		OR p_operator_name IS DISTINCT FROM btrim(p_operator_name)
		OR p_center_name IS DISTINCT FROM btrim(p_center_name)
		OR char_length(p_operator_name) NOT BETWEEN 1 AND 120
		OR char_length(p_center_name) NOT BETWEEN 1 AND 120
		OR p_locale NOT IN ('es', 'en')
		OR NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = p_time_zone)
	THEN
		RETURN jsonb_build_object('deniedReason', 'validation_error');
	END IF;

	INSERT INTO onboarding_app.bootstrap_redemption_rate_limits (
		issuer, subject, session_id_hash, attempted_at
	) VALUES (
		btrim(p_issuer), btrim(p_subject), p_session_id_hash, ARRAY[]::timestamptz[]
	)
	ON CONFLICT (issuer, subject, session_id_hash) DO NOTHING;

	SELECT ARRAY(
		SELECT attempted_at
		FROM unnest(rate_limit.attempted_at) AS attempted_at
		WHERE attempted_at > v_now - interval '1 minute'
		ORDER BY attempted_at
	) INTO v_attempts
	FROM onboarding_app.bootstrap_redemption_rate_limits rate_limit
	WHERE rate_limit.issuer = btrim(p_issuer)
		AND rate_limit.subject = btrim(p_subject)
		AND rate_limit.session_id_hash = p_session_id_hash
	FOR UPDATE;

	IF cardinality(v_attempts) >= 10 THEN
		v_retry_after := greatest(
			1,
			ceil(extract(epoch FROM (v_attempts[1] + interval '1 minute' - v_now)))::integer
		);
		INSERT INTO onboarding_app.bootstrap_invitation_audit_records (
			id, action, result, reason, correlation_id
		) VALUES (
			gen_random_uuid(), 'tenant_bootstrap.denied', 'denied',
			'bootstrap_unavailable', p_correlation_id
		);
		RETURN jsonb_build_object(
			'deniedReason', 'rate_limited',
			'retryAfterSeconds', v_retry_after
		);
	END IF;

	UPDATE onboarding_app.bootstrap_redemption_rate_limits
	SET attempted_at = v_attempts || v_now
	WHERE issuer = btrim(p_issuer)
		AND subject = btrim(p_subject)
		AND session_id_hash = p_session_id_hash;

	SELECT array_agg(bootstrap_grant.id ORDER BY bootstrap_grant.id)
	INTO v_candidate_ids
	FROM onboarding_app.tenant_bootstrap_grants bootstrap_grant
	WHERE bootstrap_grant.status = 'issued'
		AND bootstrap_grant.expires_at > v_now
		AND bootstrap_grant.delivery_status = 'succeeded'
		AND bootstrap_grant.provider_invitation_ref IS NOT NULL
		AND bootstrap_grant.destination_email = ANY(p_verified_addresses)
		AND (bootstrap_grant.bound_issuer IS NULL OR bootstrap_grant.bound_issuer = btrim(p_issuer))
		AND (bootstrap_grant.bound_subject IS NULL OR bootstrap_grant.bound_subject = btrim(p_subject));

	IF cardinality(v_candidate_ids) IS DISTINCT FROM 1 THEN
		SELECT array_agg(bootstrap_grant.id ORDER BY bootstrap_grant.id)
		INTO v_candidate_ids
		FROM onboarding_app.tenant_bootstrap_grants bootstrap_grant
		WHERE bootstrap_grant.status = 'consumed'
			AND bootstrap_grant.destination_email = ANY(p_verified_addresses)
			AND bootstrap_grant.bound_issuer = btrim(p_issuer)
			AND bootstrap_grant.bound_subject = btrim(p_subject);
		IF cardinality(v_candidate_ids) = 1 THEN
			SELECT * INTO v_grant
			FROM onboarding_app.tenant_bootstrap_grants
			WHERE id = v_candidate_ids[1];
			IF v_grant.completion_fingerprint = p_completion_fingerprint THEN
				PERFORM set_config('app.tenant_id', v_grant.result_tenant_id::text, true);
				SELECT center_entry.center_key INTO v_center_key
				FROM iam_app.center_entries center_entry
				WHERE center_entry.tenant_id = v_grant.result_tenant_id
					AND center_entry.center_id = v_grant.result_center_id;
				PERFORM set_config('app.tenant_id', coalesce(v_previous_tenant_id, ''), true);
				RETURN jsonb_build_object(
					'tenantId', v_grant.result_tenant_id,
					'centerId', v_grant.result_center_id,
					'membershipId', v_grant.result_membership_id,
					'centerKey', v_center_key
				);
			END IF;
			RETURN jsonb_build_object('deniedReason', 'idempotency_conflict');
		END IF;
		INSERT INTO onboarding_app.bootstrap_invitation_audit_records (
			id, action, result, reason, correlation_id
		) VALUES (
			gen_random_uuid(), 'tenant_bootstrap.denied', 'denied',
			'bootstrap_unavailable', p_correlation_id
		);
		RETURN jsonb_build_object('deniedReason', 'bootstrap_unavailable');
	END IF;

	SELECT * INTO v_grant
	FROM onboarding_app.tenant_bootstrap_grants bootstrap_grant
	WHERE bootstrap_grant.id = v_candidate_ids[1]
	FOR UPDATE;
	IF v_grant.status = 'consumed'
		AND v_grant.bound_issuer = btrim(p_issuer)
		AND v_grant.bound_subject = btrim(p_subject)
	THEN
		IF v_grant.completion_fingerprint <> p_completion_fingerprint THEN
			RETURN jsonb_build_object('deniedReason', 'idempotency_conflict');
		END IF;
		PERFORM set_config('app.tenant_id', v_grant.result_tenant_id::text, true);
		SELECT center_entry.center_key INTO v_center_key
		FROM iam_app.center_entries center_entry
		WHERE center_entry.tenant_id = v_grant.result_tenant_id
			AND center_entry.center_id = v_grant.result_center_id;
		PERFORM set_config('app.tenant_id', coalesce(v_previous_tenant_id, ''), true);
		RETURN jsonb_build_object(
			'tenantId', v_grant.result_tenant_id,
			'centerId', v_grant.result_center_id,
			'membershipId', v_grant.result_membership_id,
			'centerKey', v_center_key
		);
	END IF;

	IF v_grant.status <> 'issued'
		OR v_grant.expires_at <= v_now
		OR v_grant.delivery_status <> 'succeeded'
		OR v_grant.provider_invitation_ref IS NULL
	THEN
		RETURN jsonb_build_object('deniedReason', 'bootstrap_unavailable');
	END IF;

	SELECT external_identity.identity_id INTO v_identity_id
	FROM iam_app.external_identities external_identity
	WHERE external_identity.issuer = btrim(p_issuer)
		AND external_identity.subject = btrim(p_subject);
	IF v_identity_id IS NULL THEN
		v_identity_id := gen_random_uuid();
		INSERT INTO iam_app.identities (id) VALUES (v_identity_id);
		INSERT INTO iam_app.external_identities (identity_id, issuer, subject)
		VALUES (v_identity_id, btrim(p_issuer), btrim(p_subject));
	END IF;

	PERFORM pg_advisory_xact_lock(hashtextextended('dive:center-key-allocation', 0));
	v_center_key_base := trim(both '-' FROM regexp_replace(
		lower(p_center_name), '[^a-z0-9]+', '-', 'g'
	));
	IF v_center_key_base = '' THEN
		v_center_key_base := 'center';
	END IF;
	v_center_key_base := left(v_center_key_base, 63);
	v_center_key := v_center_key_base;
	IF v_center_key = ANY(ARRAY[
		'www', 'app', 'api', 'admin', 'mail', 'staging', 'preview', 'static', 'assets'
	]) THEN
		v_center_key := left(v_center_key_base, 54) || '-' ||
			left(replace(v_grant.id::text, '-', ''), 8);
	END IF;

	PERFORM set_config('app.tenant_id', v_tenant_id::text, true);
	INSERT INTO iam_app.tenants (id, name) VALUES (v_tenant_id, p_operator_name);
	INSERT INTO iam_app.centers (id, tenant_id, name, time_zone)
	VALUES (v_center_id, v_tenant_id, p_center_name, p_time_zone);
	BEGIN
		INSERT INTO iam_app.center_entries (center_key, tenant_id, center_id)
		VALUES (v_center_key, v_tenant_id, v_center_id);
	EXCEPTION WHEN unique_violation THEN
		IF v_center_key <> v_center_key_base THEN
			RAISE;
		END IF;
		v_center_key := left(v_center_key_base, 54) || '-' ||
			left(replace(v_grant.id::text, '-', ''), 8);
		INSERT INTO iam_app.center_entries (center_key, tenant_id, center_id)
		VALUES (v_center_key, v_tenant_id, v_center_id);
	END;
	INSERT INTO iam_app.memberships (
		id, tenant_id, identity_id, status, roles, center_ids
	) VALUES (
		v_membership_id, v_tenant_id, v_identity_id, 'active',
		ARRAY['tenant_owner']::text[], NULL
	);
	INSERT INTO iam_app.identity_preferences (identity_id, locale)
	VALUES (v_identity_id, p_locale)
	ON CONFLICT (identity_id) DO UPDATE SET locale = EXCLUDED.locale;

	UPDATE onboarding_app.tenant_bootstrap_grants
	SET status = 'consumed', consumed_at = v_now,
		bound_issuer = btrim(p_issuer), bound_subject = btrim(p_subject),
		result_tenant_id = v_tenant_id, result_center_id = v_center_id,
		result_membership_id = v_membership_id,
		completion_fingerprint = p_completion_fingerprint
	WHERE id = v_grant.id;

	INSERT INTO onboarding_app.bootstrap_invitation_audit_records (
		id, action, grant_id, result, correlation_id
	) VALUES (
		gen_random_uuid(), 'tenant_bootstrap.completed', v_grant.id,
		'success', p_correlation_id
	);
	INSERT INTO iam_app.outbox_events (
		id, tenant_id, event_type, payload, correlation_id, idempotency_key
	) VALUES (
		gen_random_uuid(), v_tenant_id, 'tenant.bootstrap.completed.v1',
		jsonb_build_object(
			'tenantId', v_tenant_id,
			'centerId', v_center_id,
			'membershipId', v_membership_id,
			'grantId', v_grant.id,
			'occurredAt', v_now,
			'correlationId', p_correlation_id
		),
		p_correlation_id, 'tenant-bootstrap-completed:' || v_grant.id::text
	);

	v_result := jsonb_build_object(
		'tenantId', v_tenant_id,
		'centerId', v_center_id,
		'membershipId', v_membership_id,
		'centerKey', v_center_key
	);
	PERFORM set_config('app.tenant_id', coalesce(v_previous_tenant_id, ''), true);
	RETURN v_result;
END;
$_$;


--
-- Name: consume_bootstrap_invitation_rate_limit(text, text); Type: FUNCTION; Schema: onboarding_app; Owner: -
--

CREATE FUNCTION onboarding_app.consume_bootstrap_invitation_rate_limit(p_issuer text, p_subject text) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'onboarding_app', 'pg_catalog', 'pg_temp'
    AS $$
DECLARE
	v_principal_id uuid;
	v_recent timestamptz[];
	v_now timestamptz := clock_timestamp();
	v_retry_after integer;
BEGIN
	IF btrim(p_issuer) = '' OR btrim(p_subject) = '' THEN
		RAISE EXCEPTION 'Invalid platform principal';
	END IF;

	INSERT INTO onboarding_app.platform_principals (id, issuer, subject)
	VALUES (gen_random_uuid(), btrim(p_issuer), btrim(p_subject))
	ON CONFLICT (issuer, subject) DO UPDATE SET subject = EXCLUDED.subject
	RETURNING id INTO v_principal_id;

	PERFORM pg_advisory_xact_lock(hashtextextended(v_principal_id::text, 0));

	INSERT INTO onboarding_app.bootstrap_invitation_rate_limits (
		principal_id, attempted_at
	) VALUES (v_principal_id, ARRAY[]::timestamptz[])
	ON CONFLICT (principal_id) DO NOTHING;

	SELECT COALESCE(array_agg(attempted_at ORDER BY attempted_at), ARRAY[]::timestamptz[])
	INTO v_recent
	FROM unnest((
		SELECT rate_limit.attempted_at
		FROM onboarding_app.bootstrap_invitation_rate_limits rate_limit
		WHERE rate_limit.principal_id = v_principal_id
	)) attempted_at
	WHERE attempted_at > v_now - interval '1 minute';

	IF cardinality(v_recent) >= 10 THEN
		v_recent := (v_recent[2:10] || v_now);
		UPDATE onboarding_app.bootstrap_invitation_rate_limits
		SET attempted_at = v_recent
		WHERE principal_id = v_principal_id;
		v_retry_after := GREATEST(
			1,
			ceil(extract(epoch FROM (v_recent[1] + interval '1 minute' - v_now)))::integer
		);
		RETURN v_retry_after;
	END IF;

	UPDATE onboarding_app.bootstrap_invitation_rate_limits
	SET attempted_at = v_recent || v_now
	WHERE principal_id = v_principal_id;
	RETURN NULL;
END;
$$;


--
-- Name: fail_bootstrap_outbox_event(uuid, boolean, timestamp with time zone, text); Type: FUNCTION; Schema: onboarding_app; Owner: -
--

CREATE FUNCTION onboarding_app.fail_bootstrap_outbox_event(p_event_id uuid, p_retryable boolean, p_next_attempt_at timestamp with time zone, p_provider_status text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'onboarding_app', 'pg_catalog', 'pg_temp'
    AS $$
DECLARE
	v_event onboarding_app.tenant_bootstrap_outbox_events%ROWTYPE;
	v_next_state text;
BEGIN
	SELECT * INTO STRICT v_event
	FROM onboarding_app.tenant_bootstrap_outbox_events
	WHERE id = p_event_id
	FOR UPDATE;
	v_next_state := CASE
		WHEN p_retryable AND v_event.attempt_count + 1 < 8 THEN 'retrying'
		ELSE 'dead_letter'
	END;
	IF v_next_state = 'retrying' AND p_next_attempt_at IS NULL THEN
		RAISE EXCEPTION 'Retryable failure requires next attempt timestamp';
	END IF;
	UPDATE onboarding_app.tenant_bootstrap_outbox_events
	SET delivery_state = v_next_state,
			attempt_count = attempt_count + 1,
			next_attempt_at = coalesce(p_next_attempt_at, next_attempt_at),
			completed_at = CASE WHEN v_next_state = 'dead_letter' THEN now() ELSE NULL END
	WHERE id = p_event_id;
	UPDATE onboarding_app.tenant_bootstrap_grants
	SET delivery_status = v_next_state, provider_status = p_provider_status
	WHERE id = v_event.grant_id;
	IF v_next_state = 'dead_letter' THEN
		INSERT INTO onboarding_app.bootstrap_invitation_audit_records (
			id, action, grant_id, result, reason, correlation_id
		) VALUES (
			gen_random_uuid(), 'tenant_bootstrap_invitation.delivery_failed',
			v_event.grant_id, 'failed', 'provider_delivery_failed',
			v_event.correlation_id
		);
	END IF;
	RETURN v_next_state;
END;
$$;


--
-- Name: issue_bootstrap_invitation_command(text, text, text, text, text, text, uuid); Type: FUNCTION; Schema: onboarding_app; Owner: -
--

CREATE FUNCTION onboarding_app.issue_bootstrap_invitation_command(p_issuer text, p_subject text, p_destination_email text, p_reason text, p_idempotency_key text, p_request_fingerprint text, p_correlation_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'onboarding_app', 'pg_catalog', 'pg_temp'
    AS $$
DECLARE
	v_principal_id uuid;
	v_existing onboarding_app.bootstrap_invitation_command_receipts%ROWTYPE;
	v_grant_id uuid := gen_random_uuid();
	v_result jsonb;
	v_normalized_email text := lower(btrim(p_destination_email));
BEGIN
	SELECT principal.id INTO v_principal_id
	FROM onboarding_app.platform_principals principal
	JOIN onboarding_app.platform_principal_capabilities capability
		ON capability.principal_id = principal.id
	 AND capability.capability = 'bootstrap_invitation.issue'
	 AND capability.revoked_at IS NULL
	WHERE principal.issuer = btrim(p_issuer)
		AND principal.subject = btrim(p_subject);

	IF v_principal_id IS NULL THEN
		RETURN jsonb_build_object('deniedReason', 'permission_missing');
	END IF;

	PERFORM pg_advisory_xact_lock(hashtextextended(
		v_principal_id::text || E'\nissue\n' || p_idempotency_key,
		0
	));

	SELECT * INTO v_existing
	FROM onboarding_app.bootstrap_invitation_command_receipts receipt
	WHERE receipt.principal_id = v_principal_id
		AND receipt.command = 'issue'
		AND receipt.idempotency_key = p_idempotency_key
	FOR UPDATE;

	IF FOUND THEN
		IF v_existing.request_fingerprint <> p_request_fingerprint THEN
			RETURN jsonb_build_object('deniedReason', 'idempotency_conflict');
		END IF;
		RETURN v_existing.result;
	END IF;

	INSERT INTO onboarding_app.tenant_bootstrap_grants (
		id, destination_email, status, delivery_status,
		issued_by_principal_id, issue_reason, request_fingerprint
	) VALUES (
		v_grant_id, v_normalized_email, 'issued', 'pending',
		v_principal_id, NULLIF(btrim(p_reason), ''), p_request_fingerprint
	);
	INSERT INTO onboarding_app.tenant_bootstrap_outbox_events (
		id, grant_id, command, delivery_state, correlation_id, idempotency_key
	) VALUES (
		gen_random_uuid(), v_grant_id, 'create', 'pending', p_correlation_id,
		'bootstrap-create:' || v_grant_id::text
	);
	INSERT INTO onboarding_app.bootstrap_invitation_audit_records (
		id, actor_principal_id, action, grant_id, result, reason, correlation_id
	) VALUES (
		gen_random_uuid(), v_principal_id, 'tenant_bootstrap_invitation.issued',
		v_grant_id, 'success', NULLIF(btrim(p_reason), ''), p_correlation_id
	);

	v_result := jsonb_build_object(
		'invitationId', v_grant_id,
		'destinationEmail', v_normalized_email,
		'status', 'issued',
		'deliveryStatus', 'pending'
	);
	INSERT INTO onboarding_app.bootstrap_invitation_command_receipts (
		principal_id, command, idempotency_key, request_fingerprint, result
	) VALUES (
		v_principal_id, 'issue', p_idempotency_key, p_request_fingerprint, v_result
	);
	RETURN v_result;
END;
$$;


--
-- Name: read_bootstrap_invitation_command(text, text, uuid); Type: FUNCTION; Schema: onboarding_app; Owner: -
--

CREATE FUNCTION onboarding_app.read_bootstrap_invitation_command(p_issuer text, p_subject text, p_grant_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'onboarding_app', 'pg_catalog', 'pg_temp'
    AS $$
DECLARE
	v_result jsonb;
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM onboarding_app.platform_principals principal
		JOIN onboarding_app.platform_principal_capabilities capability
			ON capability.principal_id = principal.id
		 AND capability.capability = 'bootstrap_invitation.read'
		 AND capability.revoked_at IS NULL
		WHERE principal.issuer = btrim(p_issuer)
			AND principal.subject = btrim(p_subject)
	) THEN
		RETURN jsonb_build_object('deniedReason', 'resource_missing_or_inaccessible');
	END IF;

	SELECT jsonb_build_object(
		'invitationId', bootstrap_grant.id,
		'destinationEmail', bootstrap_grant.destination_email,
		'status', bootstrap_grant.status,
		'deliveryStatus', bootstrap_grant.delivery_status,
		'issuedAt', bootstrap_grant.issued_at,
		'expiresAt', bootstrap_grant.expires_at
	) INTO v_result
	FROM onboarding_app.tenant_bootstrap_grants bootstrap_grant
	WHERE bootstrap_grant.id = p_grant_id;

	RETURN coalesce(
		v_result,
		jsonb_build_object('deniedReason', 'resource_missing_or_inaccessible')
	);
END;
$$;


--
-- Name: reissue_bootstrap_invitation_command(text, text, uuid, text, text, text, uuid); Type: FUNCTION; Schema: onboarding_app; Owner: -
--

CREATE FUNCTION onboarding_app.reissue_bootstrap_invitation_command(p_issuer text, p_subject text, p_grant_id uuid, p_reason text, p_idempotency_key text, p_request_fingerprint text, p_correlation_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'onboarding_app', 'pg_catalog', 'pg_temp'
    AS $$
DECLARE
	v_principal_id uuid;
	v_existing onboarding_app.bootstrap_invitation_command_receipts%ROWTYPE;
	v_previous onboarding_app.tenant_bootstrap_grants%ROWTYPE;
	v_new_grant_id uuid := gen_random_uuid();
	v_result jsonb;
BEGIN
	SELECT principal.id INTO v_principal_id
	FROM onboarding_app.platform_principals principal
	JOIN onboarding_app.platform_principal_capabilities capability
		ON capability.principal_id = principal.id
	 AND capability.capability = 'bootstrap_invitation.reissue'
	 AND capability.revoked_at IS NULL
	WHERE principal.issuer = btrim(p_issuer)
		AND principal.subject = btrim(p_subject);
	IF v_principal_id IS NULL THEN
		RETURN jsonb_build_object('deniedReason', 'resource_missing_or_inaccessible');
	END IF;

	PERFORM pg_advisory_xact_lock(hashtextextended(
		v_principal_id::text || E'\nreissue\n' || p_idempotency_key,
		0
	));

	SELECT * INTO v_existing
	FROM onboarding_app.bootstrap_invitation_command_receipts receipt
	WHERE receipt.principal_id = v_principal_id
		AND receipt.command = 'reissue'
		AND receipt.idempotency_key = p_idempotency_key
	FOR UPDATE;
	IF FOUND THEN
		IF v_existing.request_fingerprint <> p_request_fingerprint THEN
			RETURN jsonb_build_object('deniedReason', 'idempotency_conflict');
		END IF;
		RETURN v_existing.result;
	END IF;

	SELECT * INTO v_previous
	FROM onboarding_app.tenant_bootstrap_grants bootstrap_grant
	WHERE bootstrap_grant.id = p_grant_id
	FOR UPDATE;
	IF NOT FOUND OR v_previous.status <> 'issued' THEN
		RETURN jsonb_build_object('deniedReason', 'resource_missing_or_inaccessible');
	END IF;

	INSERT INTO onboarding_app.tenant_bootstrap_grants (
		id, destination_email, status, delivery_status,
		issued_by_principal_id, issue_reason, request_fingerprint
	) VALUES (
		v_new_grant_id, v_previous.destination_email, 'issued', 'pending',
		v_principal_id, NULLIF(btrim(p_reason), ''), p_request_fingerprint
	);
	UPDATE onboarding_app.tenant_bootstrap_grants
	SET status = 'superseded', superseded_by_grant_id = v_new_grant_id
	WHERE id = p_grant_id;
	DELETE FROM onboarding_app.tenant_bootstrap_outbox_events
	WHERE grant_id = p_grant_id
		AND command = 'create'
		AND delivery_state IN ('pending', 'retrying');

	INSERT INTO onboarding_app.tenant_bootstrap_outbox_events (
		id, grant_id, command, delivery_state, correlation_id, idempotency_key
	) VALUES
		(gen_random_uuid(), p_grant_id, 'revoke', 'pending', p_correlation_id,
			'bootstrap-revoke:' || p_grant_id::text || ':' || v_new_grant_id::text),
		(gen_random_uuid(), v_new_grant_id, 'create', 'pending', p_correlation_id,
			'bootstrap-create:' || v_new_grant_id::text);
	INSERT INTO onboarding_app.bootstrap_invitation_audit_records (
		id, actor_principal_id, action, grant_id, result, reason, correlation_id
	) VALUES (
		gen_random_uuid(), v_principal_id, 'tenant_bootstrap_invitation.reissued',
		v_new_grant_id, 'success', NULLIF(btrim(p_reason), ''), p_correlation_id
	);

	v_result := jsonb_build_object(
		'invitationId', v_new_grant_id,
		'destinationEmail', v_previous.destination_email,
		'status', 'issued',
		'deliveryStatus', 'pending'
	);
	INSERT INTO onboarding_app.bootstrap_invitation_command_receipts (
		principal_id, command, idempotency_key, request_fingerprint, result
	) VALUES (
		v_principal_id, 'reissue', p_idempotency_key, p_request_fingerprint, v_result
	);
	RETURN v_result;
END;
$$;


--
-- Name: retry_bootstrap_invitation_revoke_command(text, text, uuid, text, text, text, uuid); Type: FUNCTION; Schema: onboarding_app; Owner: -
--

CREATE FUNCTION onboarding_app.retry_bootstrap_invitation_revoke_command(p_issuer text, p_subject text, p_grant_id uuid, p_reason text, p_idempotency_key text, p_request_fingerprint text, p_correlation_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'onboarding_app', 'pg_catalog', 'pg_temp'
    AS $$
DECLARE
  v_principal_id uuid;
  v_existing onboarding_app.bootstrap_invitation_command_receipts%ROWTYPE;
  v_grant onboarding_app.tenant_bootstrap_grants%ROWTYPE;
  v_dead_letter_event onboarding_app.tenant_bootstrap_outbox_events%ROWTYPE;
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
    v_principal_id::text || E'\nrevoke_retry\n' || p_idempotency_key,
    0
  ));

  SELECT * INTO v_existing
  FROM onboarding_app.bootstrap_invitation_command_receipts receipt
  WHERE receipt.principal_id = v_principal_id
    AND receipt.command = 'revoke_retry'
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
  IF NOT FOUND OR v_grant.status <> 'revoked'
    OR v_grant.delivery_status <> 'dead_letter' THEN
    RETURN jsonb_build_object('deniedReason', 'resource_missing_or_inaccessible');
  END IF;

  SELECT * INTO v_dead_letter_event
  FROM onboarding_app.tenant_bootstrap_outbox_events event
  WHERE event.grant_id = p_grant_id
    AND event.command = 'revoke'
    AND event.delivery_state = 'dead_letter'
  ORDER BY event.created_at DESC, event.id DESC
  LIMIT 1
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('deniedReason', 'resource_missing_or_inaccessible');
  END IF;

  INSERT INTO onboarding_app.tenant_bootstrap_outbox_events (
    id, grant_id, command, delivery_state, correlation_id, idempotency_key
  ) VALUES (
    gen_random_uuid(), p_grant_id, 'revoke', 'pending', p_correlation_id,
    'bootstrap-revoke-retry:' || p_grant_id::text || ':' || p_idempotency_key
  );

  UPDATE onboarding_app.tenant_bootstrap_grants
  SET delivery_status = 'pending'
  WHERE id = p_grant_id;

  INSERT INTO onboarding_app.bootstrap_invitation_audit_records (
    id, actor_principal_id, action, grant_id, result, reason, correlation_id
  ) VALUES (
    gen_random_uuid(), v_principal_id,
    'tenant_bootstrap_invitation.revocation_retried',
    p_grant_id, 'success', btrim(p_reason), p_correlation_id
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
    v_principal_id, 'revoke_retry', p_idempotency_key, p_request_fingerprint,
    v_result
  );
  RETURN v_result;
END;
$$;


--
-- Name: revoke_bootstrap_invitation_command(text, text, uuid, text, text, text, uuid); Type: FUNCTION; Schema: onboarding_app; Owner: -
--

CREATE FUNCTION onboarding_app.revoke_bootstrap_invitation_command(p_issuer text, p_subject text, p_grant_id uuid, p_reason text, p_idempotency_key text, p_request_fingerprint text, p_correlation_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'onboarding_app', 'pg_catalog', 'pg_temp'
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


--
-- Name: set_platform_capability(text, text, text, boolean); Type: FUNCTION; Schema: onboarding_app; Owner: -
--

CREATE FUNCTION onboarding_app.set_platform_capability(p_issuer text, p_subject text, p_capability text, p_enabled boolean) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'onboarding_app', 'pg_catalog', 'pg_temp'
    AS $$
DECLARE
	v_principal_id uuid;
BEGIN
	IF btrim(p_issuer) = '' OR btrim(p_subject) = '' THEN
		RAISE EXCEPTION 'Invalid platform principal';
	END IF;
	IF p_capability NOT IN (
		'bootstrap_invitation.read',
		'bootstrap_invitation.issue',
		'bootstrap_invitation.reissue',
		'bootstrap_invitation.revoke'
	) THEN
		RAISE EXCEPTION 'Invalid platform capability';
	END IF;

	INSERT INTO onboarding_app.platform_principals (id, issuer, subject)
	VALUES (gen_random_uuid(), btrim(p_issuer), btrim(p_subject))
	ON CONFLICT (issuer, subject) DO UPDATE SET subject = EXCLUDED.subject
	RETURNING id INTO v_principal_id;

	INSERT INTO onboarding_app.platform_principal_capabilities (
		principal_id, capability, revoked_at
	) VALUES (
		v_principal_id, p_capability, CASE WHEN p_enabled THEN NULL ELSE now() END
	)
	ON CONFLICT (principal_id, capability) DO UPDATE
	SET granted_at = CASE
				WHEN p_enabled THEN now()
				ELSE onboarding_app.platform_principal_capabilities.granted_at
			END,
			revoked_at = CASE WHEN p_enabled THEN NULL ELSE now() END;

	RETURN v_principal_id;
END;
$$;


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
    base_locale text NOT NULL,
    revision bigint DEFAULT 1 NOT NULL,
    CONSTRAINT activities_base_locale_known CHECK ((base_locale = ANY (ARRAY['es'::text, 'en'::text]))),
    CONSTRAINT activities_default_capacity_positive CHECK (((default_capacity IS NULL) OR (default_capacity > 0))),
    CONSTRAINT activities_revision_positive CHECK ((revision > 0)),
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
-- Name: catalog_settings; Type: TABLE; Schema: booking_app; Owner: -
--

CREATE TABLE booking_app.catalog_settings (
    tenant_id uuid NOT NULL,
    center_id uuid NOT NULL,
    default_activity_locale text NOT NULL,
    CONSTRAINT catalog_settings_locale_known CHECK ((default_activity_locale = ANY (ARRAY['es'::text, 'en'::text])))
);

ALTER TABLE ONLY booking_app.catalog_settings FORCE ROW LEVEL SECURITY;


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
    CONSTRAINT audit_action_known CHECK ((action = ANY (ARRAY['membership.invite'::text, 'membership.disable'::text, 'center_entry.enable'::text, 'center_entry.disable'::text, 'booking.create'::text, 'booking.read'::text, 'booking.update'::text, 'booking.activity.updated'::text, 'booking.confirm'::text, 'booking.cancel'::text, 'customer_contact.read'::text, 'support.tenant.read'::text, 'identity.webhook.apply'::text]))),
    CONSTRAINT audit_result_reason_valid CHECK ((((result = 'success'::text) AND (reason IS NULL)) OR ((result = 'denied'::text) AND (reason = ANY (ARRAY['authentication_missing_or_invalid'::text, 'membership_missing_or_inactive'::text, 'permission_missing'::text, 'scope_mismatch'::text, 'resource_missing_or_inaccessible'::text, 'resource_state_invalid'::text, 'credential_invalid_or_expired'::text, 'duplicate_or_replayed'::text, 'assurance_insufficient'::text, 'support_grant_invalid'::text, 'last_owner'::text, 'invariant_violation'::text])))))
);

ALTER TABLE ONLY iam_app.audit_records FORCE ROW LEVEL SECURITY;


--
-- Name: center_entries; Type: TABLE; Schema: iam_app; Owner: -
--

CREATE TABLE iam_app.center_entries (
    center_key text NOT NULL,
    tenant_id uuid NOT NULL,
    center_id uuid NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    CONSTRAINT center_entries_key_format CHECK ((center_key ~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$'::text)),
    CONSTRAINT center_entries_status_known CHECK ((status = ANY (ARRAY['active'::text, 'disabled'::text])))
);

ALTER TABLE ONLY iam_app.center_entries FORCE ROW LEVEL SECURITY;


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
-- Name: identity_preferences; Type: TABLE; Schema: iam_app; Owner: -
--

CREATE TABLE iam_app.identity_preferences (
    identity_id uuid NOT NULL,
    locale text NOT NULL,
    CONSTRAINT identity_preferences_locale_known CHECK ((locale = ANY (ARRAY['es'::text, 'en'::text])))
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
    target_address_canonical text DEFAULT ''::text NOT NULL,
    invitation_attempt_id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider_kind text,
    provider_invitation_id text,
    delivery_status text DEFAULT 'pending'::text NOT NULL,
    delivery_attempt_count integer DEFAULT 0 NOT NULL,
    delivery_next_attempt_at timestamp with time zone,
    provider_status text,
    superseded_by_invitation_id uuid,
    supersession_reason text,
    CONSTRAINT invitations_delivery_attempt_count_valid CHECK ((delivery_attempt_count >= 0)),
    CONSTRAINT invitations_delivery_status_known CHECK ((delivery_status = ANY (ARRAY['pending'::text, 'retrying'::text, 'succeeded'::text, 'dead_letter'::text]))),
    CONSTRAINT invitations_provider_kind_known CHECK (((provider_kind IS NULL) OR (provider_kind = 'clerk'::text))),
    CONSTRAINT invitations_status_known CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'rejected'::text, 'revoked'::text, 'expired'::text]))),
    CONSTRAINT invitations_supersession_consistent CHECK ((((superseded_by_invitation_id IS NULL) AND (supersession_reason IS NULL)) OR ((superseded_by_invitation_id IS NOT NULL) AND (supersession_reason = ANY (ARRAY['latest_wins'::text, 'explicit_reissue'::text])))))
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
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    delivery_status text DEFAULT 'pending'::text NOT NULL,
    delivery_attempt_count integer DEFAULT 0 NOT NULL,
    delivery_next_attempt_at timestamp with time zone,
    provider_status text,
    CONSTRAINT outbox_delivery_attempt_count_valid CHECK ((delivery_attempt_count >= 0)),
    CONSTRAINT outbox_delivery_status_known CHECK ((delivery_status = ANY (ARRAY['pending'::text, 'retrying'::text, 'succeeded'::text, 'dead_letter'::text])))
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
-- Name: bootstrap_invitation_audit_records; Type: TABLE; Schema: onboarding_app; Owner: -
--

CREATE TABLE onboarding_app.bootstrap_invitation_audit_records (
    id uuid NOT NULL,
    actor_principal_id uuid,
    action text NOT NULL,
    grant_id uuid,
    result text NOT NULL,
    reason text,
    correlation_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT bootstrap_invitation_audit_action_known CHECK ((action = ANY (ARRAY['tenant_bootstrap_invitation.issued'::text, 'tenant_bootstrap_invitation.reissued'::text, 'tenant_bootstrap_invitation.revoked'::text, 'tenant_bootstrap_invitation.revocation_retried'::text, 'tenant_bootstrap_invitation.delivery_failed'::text, 'tenant_bootstrap.completed'::text, 'tenant_bootstrap.denied'::text]))),
    CONSTRAINT bootstrap_invitation_audit_mutation_reason_required CHECK (((action <> ALL (ARRAY['tenant_bootstrap_invitation.reissued'::text, 'tenant_bootstrap_invitation.revoked'::text, 'tenant_bootstrap_invitation.revocation_retried'::text])) OR ((reason IS NOT NULL) AND (btrim(reason) <> ''::text)))),
    CONSTRAINT bootstrap_invitation_audit_result_known CHECK ((result = ANY (ARRAY['success'::text, 'denied'::text, 'failed'::text])))
);


--
-- Name: bootstrap_invitation_command_receipts; Type: TABLE; Schema: onboarding_app; Owner: -
--

CREATE TABLE onboarding_app.bootstrap_invitation_command_receipts (
    principal_id uuid NOT NULL,
    command text NOT NULL,
    idempotency_key text NOT NULL,
    request_fingerprint text CONSTRAINT bootstrap_invitation_command_recei_request_fingerprint_not_null NOT NULL,
    result jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT bootstrap_invitation_command_receipts_command_known CHECK ((command = ANY (ARRAY['issue'::text, 'reissue'::text, 'revoke'::text, 'revoke_retry'::text]))),
    CONSTRAINT bootstrap_invitation_command_receipts_fingerprint_format CHECK ((request_fingerprint ~ '^[0-9a-f]{64}$'::text))
);


--
-- Name: bootstrap_invitation_rate_limits; Type: TABLE; Schema: onboarding_app; Owner: -
--

CREATE TABLE onboarding_app.bootstrap_invitation_rate_limits (
    principal_id uuid NOT NULL,
    attempted_at timestamp with time zone[] DEFAULT ARRAY[]::timestamp with time zone[] NOT NULL
);


--
-- Name: bootstrap_redemption_rate_limits; Type: TABLE; Schema: onboarding_app; Owner: -
--

CREATE TABLE onboarding_app.bootstrap_redemption_rate_limits (
    issuer text NOT NULL,
    subject text NOT NULL,
    session_id_hash text NOT NULL,
    attempted_at timestamp with time zone[] DEFAULT ARRAY[]::timestamp with time zone[] NOT NULL,
    CONSTRAINT bootstrap_redemption_rate_limits_principal_normalized CHECK (((issuer = btrim(issuer)) AND (issuer <> ''::text) AND (subject = btrim(subject)) AND (subject <> ''::text))),
    CONSTRAINT bootstrap_redemption_rate_limits_session_hash_format CHECK ((session_id_hash ~ '^[0-9a-f]{64}$'::text))
);


--
-- Name: platform_principal_capabilities; Type: TABLE; Schema: onboarding_app; Owner: -
--

CREATE TABLE onboarding_app.platform_principal_capabilities (
    principal_id uuid NOT NULL,
    capability text NOT NULL,
    granted_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone,
    CONSTRAINT platform_principal_capabilities_known CHECK ((capability = ANY (ARRAY['bootstrap_invitation.read'::text, 'bootstrap_invitation.issue'::text, 'bootstrap_invitation.reissue'::text, 'bootstrap_invitation.revoke'::text])))
);


--
-- Name: platform_principals; Type: TABLE; Schema: onboarding_app; Owner: -
--

CREATE TABLE onboarding_app.platform_principals (
    id uuid NOT NULL,
    issuer text NOT NULL,
    subject text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT platform_principals_issuer_normalized CHECK (((issuer = btrim(issuer)) AND (issuer <> ''::text))),
    CONSTRAINT platform_principals_subject_normalized CHECK (((subject = btrim(subject)) AND (subject <> ''::text)))
);


--
-- Name: tenant_bootstrap_grants; Type: TABLE; Schema: onboarding_app; Owner: -
--

CREATE TABLE onboarding_app.tenant_bootstrap_grants (
    id uuid NOT NULL,
    destination_email text NOT NULL,
    status text NOT NULL,
    delivery_status text NOT NULL,
    issued_by_principal_id uuid NOT NULL,
    issue_reason text,
    request_fingerprint text NOT NULL,
    provider_invitation_ref text,
    provider_status text,
    bound_issuer text,
    bound_subject text,
    superseded_by_grant_id uuid,
    result_tenant_id uuid,
    result_center_id uuid,
    result_membership_id uuid,
    issued_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '7 days'::interval) NOT NULL,
    revoked_at timestamp with time zone,
    consumed_at timestamp with time zone,
    completion_fingerprint text,
    CONSTRAINT tenant_bootstrap_grants_completion_fingerprint_format CHECK (((completion_fingerprint IS NULL) OR (completion_fingerprint ~ '^[0-9a-f]{64}$'::text))),
    CONSTRAINT tenant_bootstrap_grants_delivery_status_known CHECK ((delivery_status = ANY (ARRAY['pending'::text, 'retrying'::text, 'succeeded'::text, 'dead_letter'::text]))),
    CONSTRAINT tenant_bootstrap_grants_destination_normalized CHECK (((destination_email = lower(btrim(destination_email))) AND (destination_email <> ''::text))),
    CONSTRAINT tenant_bootstrap_grants_fingerprint_format CHECK ((request_fingerprint ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT tenant_bootstrap_grants_status_known CHECK ((status = ANY (ARRAY['issued'::text, 'consumed'::text, 'revoked'::text, 'expired'::text, 'superseded'::text])))
);


--
-- Name: tenant_bootstrap_outbox_events; Type: TABLE; Schema: onboarding_app; Owner: -
--

CREATE TABLE onboarding_app.tenant_bootstrap_outbox_events (
    id uuid NOT NULL,
    grant_id uuid NOT NULL,
    command text NOT NULL,
    delivery_state text NOT NULL,
    attempt_count integer DEFAULT 0 NOT NULL,
    correlation_id uuid NOT NULL,
    idempotency_key text NOT NULL,
    next_attempt_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    CONSTRAINT tenant_bootstrap_outbox_attempt_count_valid CHECK (((attempt_count >= 0) AND (attempt_count <= 8))),
    CONSTRAINT tenant_bootstrap_outbox_command_known CHECK ((command = ANY (ARRAY['create'::text, 'revoke'::text]))),
    CONSTRAINT tenant_bootstrap_outbox_delivery_state_known CHECK ((delivery_state = ANY (ARRAY['pending'::text, 'retrying'::text, 'succeeded'::text, 'dead_letter'::text])))
);


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
-- Name: catalog_settings catalog_settings_tenant_id_center_id_pk; Type: CONSTRAINT; Schema: booking_app; Owner: -
--

ALTER TABLE ONLY booking_app.catalog_settings
    ADD CONSTRAINT catalog_settings_tenant_id_center_id_pk PRIMARY KEY (tenant_id, center_id);


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
-- Name: center_entries center_entries_pkey; Type: CONSTRAINT; Schema: iam_app; Owner: -
--

ALTER TABLE ONLY iam_app.center_entries
    ADD CONSTRAINT center_entries_pkey PRIMARY KEY (center_key);


--
-- Name: center_entries center_entries_tenant_id_center_id_unique; Type: CONSTRAINT; Schema: iam_app; Owner: -
--

ALTER TABLE ONLY iam_app.center_entries
    ADD CONSTRAINT center_entries_tenant_id_center_id_unique UNIQUE (tenant_id, center_id);


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
-- Name: identity_preferences identity_preferences_pkey; Type: CONSTRAINT; Schema: iam_app; Owner: -
--

ALTER TABLE ONLY iam_app.identity_preferences
    ADD CONSTRAINT identity_preferences_pkey PRIMARY KEY (identity_id);


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
-- Name: invitations invitations_invitation_attempt_id_unique; Type: CONSTRAINT; Schema: iam_app; Owner: -
--

ALTER TABLE ONLY iam_app.invitations
    ADD CONSTRAINT invitations_invitation_attempt_id_unique UNIQUE (invitation_attempt_id);


--
-- Name: invitations invitations_provider_invitation_id_unique; Type: CONSTRAINT; Schema: iam_app; Owner: -
--

ALTER TABLE ONLY iam_app.invitations
    ADD CONSTRAINT invitations_provider_invitation_id_unique UNIQUE (provider_invitation_id);


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
-- Name: bootstrap_invitation_audit_records bootstrap_invitation_audit_records_pkey; Type: CONSTRAINT; Schema: onboarding_app; Owner: -
--

ALTER TABLE ONLY onboarding_app.bootstrap_invitation_audit_records
    ADD CONSTRAINT bootstrap_invitation_audit_records_pkey PRIMARY KEY (id);


--
-- Name: bootstrap_invitation_command_receipts bootstrap_invitation_command_receipts_principal_id_command_idem; Type: CONSTRAINT; Schema: onboarding_app; Owner: -
--

ALTER TABLE ONLY onboarding_app.bootstrap_invitation_command_receipts
    ADD CONSTRAINT bootstrap_invitation_command_receipts_principal_id_command_idem PRIMARY KEY (principal_id, command, idempotency_key);


--
-- Name: bootstrap_invitation_rate_limits bootstrap_invitation_rate_limits_pkey; Type: CONSTRAINT; Schema: onboarding_app; Owner: -
--

ALTER TABLE ONLY onboarding_app.bootstrap_invitation_rate_limits
    ADD CONSTRAINT bootstrap_invitation_rate_limits_pkey PRIMARY KEY (principal_id);


--
-- Name: bootstrap_redemption_rate_limits bootstrap_redemption_rate_limits_issuer_subject_session_id_hash; Type: CONSTRAINT; Schema: onboarding_app; Owner: -
--

ALTER TABLE ONLY onboarding_app.bootstrap_redemption_rate_limits
    ADD CONSTRAINT bootstrap_redemption_rate_limits_issuer_subject_session_id_hash PRIMARY KEY (issuer, subject, session_id_hash);


--
-- Name: platform_principal_capabilities platform_principal_capabilities_principal_id_capability_pk; Type: CONSTRAINT; Schema: onboarding_app; Owner: -
--

ALTER TABLE ONLY onboarding_app.platform_principal_capabilities
    ADD CONSTRAINT platform_principal_capabilities_principal_id_capability_pk PRIMARY KEY (principal_id, capability);


--
-- Name: platform_principals platform_principals_issuer_subject_unique; Type: CONSTRAINT; Schema: onboarding_app; Owner: -
--

ALTER TABLE ONLY onboarding_app.platform_principals
    ADD CONSTRAINT platform_principals_issuer_subject_unique UNIQUE (issuer, subject);


--
-- Name: platform_principals platform_principals_pkey; Type: CONSTRAINT; Schema: onboarding_app; Owner: -
--

ALTER TABLE ONLY onboarding_app.platform_principals
    ADD CONSTRAINT platform_principals_pkey PRIMARY KEY (id);


--
-- Name: tenant_bootstrap_grants tenant_bootstrap_grants_pkey; Type: CONSTRAINT; Schema: onboarding_app; Owner: -
--

ALTER TABLE ONLY onboarding_app.tenant_bootstrap_grants
    ADD CONSTRAINT tenant_bootstrap_grants_pkey PRIMARY KEY (id);


--
-- Name: tenant_bootstrap_grants tenant_bootstrap_grants_provider_invitation_ref_unique; Type: CONSTRAINT; Schema: onboarding_app; Owner: -
--

ALTER TABLE ONLY onboarding_app.tenant_bootstrap_grants
    ADD CONSTRAINT tenant_bootstrap_grants_provider_invitation_ref_unique UNIQUE (provider_invitation_ref);


--
-- Name: tenant_bootstrap_outbox_events tenant_bootstrap_outbox_events_idempotency_key_unique; Type: CONSTRAINT; Schema: onboarding_app; Owner: -
--

ALTER TABLE ONLY onboarding_app.tenant_bootstrap_outbox_events
    ADD CONSTRAINT tenant_bootstrap_outbox_events_idempotency_key_unique UNIQUE (idempotency_key);


--
-- Name: tenant_bootstrap_outbox_events tenant_bootstrap_outbox_events_pkey; Type: CONSTRAINT; Schema: onboarding_app; Owner: -
--

ALTER TABLE ONLY onboarding_app.tenant_bootstrap_outbox_events
    ADD CONSTRAINT tenant_bootstrap_outbox_events_pkey PRIMARY KEY (id);


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
-- Name: invitations_pending_target_address_canonical_idx; Type: INDEX; Schema: iam_app; Owner: -
--

CREATE UNIQUE INDEX invitations_pending_target_address_canonical_idx ON iam_app.invitations USING btree (tenant_id, target_address_canonical) WHERE ((status = 'pending'::text) AND (target_address_canonical <> ''::text));


--
-- Name: outbox_invitation_claim_idx; Type: INDEX; Schema: iam_app; Owner: -
--

CREATE INDEX outbox_invitation_claim_idx ON iam_app.outbox_events USING btree (created_at, id) WHERE (event_type IN ('iam.invitation.issued.v1', 'iam.invitation.revoked.v1') AND delivery_status IN ('pending', 'retrying'));


--
-- Name: tenant_contexts_identity_session_active_idx; Type: INDEX; Schema: iam_app; Owner: -
--

CREATE INDEX tenant_contexts_identity_session_active_idx ON iam_app.tenant_contexts USING btree (identity_id, session_id_hash) WHERE (revoked_at IS NULL);


--
-- Name: tenant_contexts_revoked_at_idx; Type: INDEX; Schema: iam_app; Owner: -
--

CREATE INDEX tenant_contexts_revoked_at_idx ON iam_app.tenant_contexts USING btree (revoked_at) WHERE (revoked_at IS NOT NULL);


--
-- Name: bootstrap_invitation_audit_actor_created_idx; Type: INDEX; Schema: onboarding_app; Owner: -
--

CREATE INDEX bootstrap_invitation_audit_actor_created_idx ON onboarding_app.bootstrap_invitation_audit_records USING btree (actor_principal_id, created_at);


--
-- Name: tenant_bootstrap_grants_destination_status_idx; Type: INDEX; Schema: onboarding_app; Owner: -
--

CREATE INDEX tenant_bootstrap_grants_destination_status_idx ON onboarding_app.tenant_bootstrap_grants USING btree (destination_email, status);


--
-- Name: tenant_bootstrap_outbox_claim_idx; Type: INDEX; Schema: onboarding_app; Owner: -
--

CREATE INDEX tenant_bootstrap_outbox_claim_idx ON onboarding_app.tenant_bootstrap_outbox_events USING btree (delivery_state, next_attempt_at, created_at);


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
-- Name: catalog_settings catalog_settings_tenant_id_center_id_centers_tenant_id_id_fk; Type: FK CONSTRAINT; Schema: booking_app; Owner: -
--

ALTER TABLE ONLY booking_app.catalog_settings
    ADD CONSTRAINT catalog_settings_tenant_id_center_id_centers_tenant_id_id_fk FOREIGN KEY (tenant_id, center_id) REFERENCES iam_app.centers(tenant_id, id);


--
-- Name: catalog_settings catalog_settings_tenant_id_tenants_id_fk; Type: FK CONSTRAINT; Schema: booking_app; Owner: -
--

ALTER TABLE ONLY booking_app.catalog_settings
    ADD CONSTRAINT catalog_settings_tenant_id_tenants_id_fk FOREIGN KEY (tenant_id) REFERENCES iam_app.tenants(id);


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
-- Name: center_entries center_entries_tenant_id_center_id_centers_tenant_id_id_fk; Type: FK CONSTRAINT; Schema: iam_app; Owner: -
--

ALTER TABLE ONLY iam_app.center_entries
    ADD CONSTRAINT center_entries_tenant_id_center_id_centers_tenant_id_id_fk FOREIGN KEY (tenant_id, center_id) REFERENCES iam_app.centers(tenant_id, id);


--
-- Name: center_entries center_entries_tenant_id_tenants_id_fk; Type: FK CONSTRAINT; Schema: iam_app; Owner: -
--

ALTER TABLE ONLY iam_app.center_entries
    ADD CONSTRAINT center_entries_tenant_id_tenants_id_fk FOREIGN KEY (tenant_id) REFERENCES iam_app.tenants(id);


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
-- Name: identity_preferences identity_preferences_identity_id_identities_id_fk; Type: FK CONSTRAINT; Schema: iam_app; Owner: -
--

ALTER TABLE ONLY iam_app.identity_preferences
    ADD CONSTRAINT identity_preferences_identity_id_identities_id_fk FOREIGN KEY (identity_id) REFERENCES iam_app.identities(id);


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
-- Name: bootstrap_invitation_audit_records bootstrap_invitation_audit_records_actor_principal_id_platform_; Type: FK CONSTRAINT; Schema: onboarding_app; Owner: -
--

ALTER TABLE ONLY onboarding_app.bootstrap_invitation_audit_records
    ADD CONSTRAINT bootstrap_invitation_audit_records_actor_principal_id_platform_ FOREIGN KEY (actor_principal_id) REFERENCES onboarding_app.platform_principals(id);


--
-- Name: bootstrap_invitation_audit_records bootstrap_invitation_audit_records_grant_id_tenant_bootstrap_gr; Type: FK CONSTRAINT; Schema: onboarding_app; Owner: -
--

ALTER TABLE ONLY onboarding_app.bootstrap_invitation_audit_records
    ADD CONSTRAINT bootstrap_invitation_audit_records_grant_id_tenant_bootstrap_gr FOREIGN KEY (grant_id) REFERENCES onboarding_app.tenant_bootstrap_grants(id);


--
-- Name: bootstrap_invitation_command_receipts bootstrap_invitation_command_receipts_principal_id_platform_pri; Type: FK CONSTRAINT; Schema: onboarding_app; Owner: -
--

ALTER TABLE ONLY onboarding_app.bootstrap_invitation_command_receipts
    ADD CONSTRAINT bootstrap_invitation_command_receipts_principal_id_platform_pri FOREIGN KEY (principal_id) REFERENCES onboarding_app.platform_principals(id);


--
-- Name: bootstrap_invitation_rate_limits bootstrap_invitation_rate_limits_principal_id_platform_principa; Type: FK CONSTRAINT; Schema: onboarding_app; Owner: -
--

ALTER TABLE ONLY onboarding_app.bootstrap_invitation_rate_limits
    ADD CONSTRAINT bootstrap_invitation_rate_limits_principal_id_platform_principa FOREIGN KEY (principal_id) REFERENCES onboarding_app.platform_principals(id);


--
-- Name: platform_principal_capabilities platform_principal_capabilities_principal_id_platform_principal; Type: FK CONSTRAINT; Schema: onboarding_app; Owner: -
--

ALTER TABLE ONLY onboarding_app.platform_principal_capabilities
    ADD CONSTRAINT platform_principal_capabilities_principal_id_platform_principal FOREIGN KEY (principal_id) REFERENCES onboarding_app.platform_principals(id);


--
-- Name: tenant_bootstrap_grants tenant_bootstrap_grants_issued_by_principal_id_platform_princip; Type: FK CONSTRAINT; Schema: onboarding_app; Owner: -
--

ALTER TABLE ONLY onboarding_app.tenant_bootstrap_grants
    ADD CONSTRAINT tenant_bootstrap_grants_issued_by_principal_id_platform_princip FOREIGN KEY (issued_by_principal_id) REFERENCES onboarding_app.platform_principals(id);


--
-- Name: tenant_bootstrap_grants tenant_bootstrap_grants_superseded_by_grant_id_tenant_bootstrap; Type: FK CONSTRAINT; Schema: onboarding_app; Owner: -
--

ALTER TABLE ONLY onboarding_app.tenant_bootstrap_grants
    ADD CONSTRAINT tenant_bootstrap_grants_superseded_by_grant_id_tenant_bootstrap FOREIGN KEY (superseded_by_grant_id) REFERENCES onboarding_app.tenant_bootstrap_grants(id);


--
-- Name: tenant_bootstrap_outbox_events tenant_bootstrap_outbox_events_grant_id_tenant_bootstrap_grants; Type: FK CONSTRAINT; Schema: onboarding_app; Owner: -
--

ALTER TABLE ONLY onboarding_app.tenant_bootstrap_outbox_events
    ADD CONSTRAINT tenant_bootstrap_outbox_events_grant_id_tenant_bootstrap_grants FOREIGN KEY (grant_id) REFERENCES onboarding_app.tenant_bootstrap_grants(id);


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
-- Name: catalog_settings; Type: ROW SECURITY; Schema: booking_app; Owner: -
--

ALTER TABLE booking_app.catalog_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: catalog_settings catalog_settings_isolation; Type: POLICY; Schema: booking_app; Owner: -
--

CREATE POLICY catalog_settings_isolation ON booking_app.catalog_settings USING ((tenant_id = (current_setting('app.tenant_id'::text))::uuid)) WITH CHECK ((tenant_id = (current_setting('app.tenant_id'::text))::uuid));


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
-- Name: center_entries; Type: ROW SECURITY; Schema: iam_app; Owner: -
--

ALTER TABLE iam_app.center_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: center_entries center_entries_isolation; Type: POLICY; Schema: iam_app; Owner: -
--

CREATE POLICY center_entries_isolation ON iam_app.center_entries USING (((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid) OR ((CURRENT_USER = 'dive_migration'::name) AND (center_key = current_setting('app.center_entry_key'::text, true))))) WITH CHECK ((tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid));


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

CREATE POLICY invitations_isolation ON iam_app.invitations USING (((current_user <> 'dive_invitation_delivery'::name) AND (tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), '')::uuid)) OR ((current_user = 'dive_invitation_delivery'::name) AND (session_user = 'dive_worker'::name) AND (tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), '')::uuid))) WITH CHECK (((current_user <> 'dive_invitation_delivery'::name) AND (tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), '')::uuid)) OR ((current_user = 'dive_invitation_delivery'::name) AND (session_user = 'dive_worker'::name) AND (tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), '')::uuid)));


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

CREATE POLICY outbox_isolation ON iam_app.outbox_events USING (((current_user <> 'dive_invitation_delivery'::name) AND (tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), '')::uuid)) OR ((current_user = 'dive_invitation_delivery'::name) AND (session_user = 'dive_worker'::name) AND (tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), '')::uuid))) WITH CHECK (((current_user <> 'dive_invitation_delivery'::name) AND (tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), '')::uuid)) OR ((current_user = 'dive_invitation_delivery'::name) AND (session_user = 'dive_worker'::name) AND (tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), '')::uuid)));

CREATE POLICY invitation_delivery_dispatch ON iam_app.outbox_events
  FOR SELECT TO dive_invitation_delivery
  USING (
    session_user = 'dive_worker'
    AND event_type IN ('iam.invitation.issued.v1', 'iam.invitation.revoked.v1')
  );


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
GRANT USAGE ON SCHEMA iam_app TO dive_worker;
GRANT USAGE, CREATE ON SCHEMA iam_app TO dive_invitation_delivery;
GRANT SELECT (id, tenant_id, target_address, invitation_attempt_id, provider_kind, provider_invitation_id, status)
  ON TABLE iam_app.invitations TO dive_invitation_delivery;
GRANT UPDATE (provider_kind, provider_invitation_id, delivery_status, delivery_attempt_count, delivery_next_attempt_at, provider_status)
  ON TABLE iam_app.invitations TO dive_invitation_delivery;
GRANT SELECT ON TABLE iam_app.outbox_events TO dive_invitation_delivery;
GRANT UPDATE (delivery_status, delivery_attempt_count, delivery_next_attempt_at, provider_status)
  ON TABLE iam_app.outbox_events TO dive_invitation_delivery;
REVOKE CREATE ON SCHEMA iam_app FROM dive_invitation_delivery;


--
-- Name: SCHEMA onboarding_app; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA onboarding_app TO dive_app;
GRANT USAGE ON SCHEMA onboarding_app TO dive_worker;
GRANT USAGE ON SCHEMA onboarding_app TO dive_platform_admin;


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
-- Name: FUNCTION claim_invitation_outbox_event(); Type: ACL; Schema: iam_app; Owner: -
--

REVOKE ALL ON FUNCTION iam_app.claim_invitation_outbox_event() FROM PUBLIC;
GRANT ALL ON FUNCTION iam_app.claim_invitation_outbox_event() TO dive_worker;


--
-- Name: FUNCTION cleanup_revoked_tenant_contexts_command(); Type: ACL; Schema: iam_app; Owner: -
--

REVOKE ALL ON FUNCTION iam_app.cleanup_revoked_tenant_contexts_command() FROM PUBLIC;
GRANT ALL ON FUNCTION iam_app.cleanup_revoked_tenant_contexts_command() TO dive_app;


--
-- Name: FUNCTION complete_invitation_outbox_event(p_event_id uuid, p_provider_invitation_ref text, p_provider_status text); Type: ACL; Schema: iam_app; Owner: -
--

REVOKE ALL ON FUNCTION iam_app.complete_invitation_outbox_event(p_tenant_id uuid, p_event_id uuid, p_provider_invitation_ref text, p_provider_status text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION iam_app.complete_invitation_outbox_event(p_tenant_id uuid, p_event_id uuid, p_provider_invitation_ref text, p_provider_status text) TO dive_worker;


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
-- Name: FUNCTION fail_invitation_outbox_event(p_event_id uuid, p_retryable boolean, p_next_attempt_at timestamp with time zone, p_provider_status text); Type: ACL; Schema: iam_app; Owner: -
--

REVOKE ALL ON FUNCTION iam_app.fail_invitation_outbox_event(p_tenant_id uuid, p_event_id uuid, p_retryable boolean, p_next_attempt_at timestamp with time zone, p_provider_status text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION iam_app.fail_invitation_outbox_event(p_tenant_id uuid, p_event_id uuid, p_retryable boolean, p_next_attempt_at timestamp with time zone, p_provider_status text) TO dive_worker;
GRANT CREATE ON SCHEMA iam_app TO dive_invitation_delivery;
ALTER FUNCTION iam_app.claim_invitation_outbox_event() OWNER TO dive_invitation_delivery;
ALTER FUNCTION iam_app.complete_invitation_outbox_event(uuid, uuid, text, text) OWNER TO dive_invitation_delivery;
ALTER FUNCTION iam_app.fail_invitation_outbox_event(uuid, uuid, boolean, timestamptz, text) OWNER TO dive_invitation_delivery;
REVOKE CREATE ON SCHEMA iam_app FROM dive_invitation_delivery;


--
-- Name: FUNCTION finalize_invitation_issue(p_outcome jsonb, p_tenant_id uuid, p_target_address_canonical text, p_invitation_attempt_id uuid, p_reissue_invitation_id uuid, p_correlation_id uuid); Type: ACL; Schema: iam_app; Owner: -
--

REVOKE ALL ON FUNCTION iam_app.finalize_invitation_issue(p_outcome jsonb, p_tenant_id uuid, p_target_address_canonical text, p_invitation_attempt_id uuid, p_reissue_invitation_id uuid, p_correlation_id uuid) FROM PUBLIC;


--
-- Name: FUNCTION issue_invitation_command(p_issuer text, p_subject text, p_tenant_id uuid, p_invitation_id uuid, p_membership_id uuid, p_target_address text, p_target_address_canonical text, p_roles text[], p_center_ids uuid[], p_credential_hash text, p_invitation_attempt_id uuid, p_idempotency_key text, p_reissue_invitation_id uuid, p_correlation_id uuid); Type: ACL; Schema: iam_app; Owner: -
--

REVOKE ALL ON FUNCTION iam_app.issue_invitation_command(p_issuer text, p_subject text, p_tenant_id uuid, p_invitation_id uuid, p_membership_id uuid, p_target_address text, p_target_address_canonical text, p_roles text[], p_center_ids uuid[], p_credential_hash text, p_invitation_attempt_id uuid, p_idempotency_key text, p_reissue_invitation_id uuid, p_correlation_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION iam_app.issue_invitation_command(p_issuer text, p_subject text, p_tenant_id uuid, p_invitation_id uuid, p_membership_id uuid, p_target_address text, p_target_address_canonical text, p_roles text[], p_center_ids uuid[], p_credential_hash text, p_invitation_attempt_id uuid, p_idempotency_key text, p_reissue_invitation_id uuid, p_correlation_id uuid) TO dive_app;


--
-- Name: FUNCTION issue_invitation_command_legacy(p_issuer text, p_subject text, p_tenant_id uuid, p_invitation_id uuid, p_membership_id uuid, p_target_address text, p_roles text[], p_center_ids uuid[], p_credential_hash text, p_idempotency_key text, p_reissue_invitation_id uuid, p_correlation_id uuid); Type: ACL; Schema: iam_app; Owner: -
--

REVOKE ALL ON FUNCTION iam_app.issue_invitation_command_legacy(p_issuer text, p_subject text, p_tenant_id uuid, p_invitation_id uuid, p_membership_id uuid, p_target_address text, p_roles text[], p_center_ids uuid[], p_credential_hash text, p_idempotency_key text, p_reissue_invitation_id uuid, p_correlation_id uuid) FROM PUBLIC;


--
-- Name: FUNCTION issue_membership_invitation_command(p_issuer text, p_subject text, p_tenant_id uuid, p_invitation_id uuid, p_membership_id uuid, p_target_address text, p_target_address_canonical text, p_roles text[], p_center_ids uuid[], p_credential_hash text, p_invitation_attempt_id uuid, p_idempotency_key text, p_reissue_invitation_id uuid, p_correlation_id uuid); Type: ACL; Schema: iam_app; Owner: -
--

REVOKE ALL ON FUNCTION iam_app.issue_membership_invitation_command(p_issuer text, p_subject text, p_tenant_id uuid, p_invitation_id uuid, p_membership_id uuid, p_target_address text, p_target_address_canonical text, p_roles text[], p_center_ids uuid[], p_credential_hash text, p_invitation_attempt_id uuid, p_idempotency_key text, p_reissue_invitation_id uuid, p_correlation_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION iam_app.issue_membership_invitation_command(p_issuer text, p_subject text, p_tenant_id uuid, p_invitation_id uuid, p_membership_id uuid, p_target_address text, p_target_address_canonical text, p_roles text[], p_center_ids uuid[], p_credential_hash text, p_invitation_attempt_id uuid, p_idempotency_key text, p_reissue_invitation_id uuid, p_correlation_id uuid) TO dive_app;


--
-- Name: FUNCTION issue_membership_invitation_command_legacy(p_issuer text, p_subject text, p_tenant_id uuid, p_invitation_id uuid, p_membership_id uuid, p_target_address text, p_roles text[], p_center_ids uuid[], p_credential_hash text, p_idempotency_key text, p_reissue_invitation_id uuid, p_correlation_id uuid); Type: ACL; Schema: iam_app; Owner: -
--

REVOKE ALL ON FUNCTION iam_app.issue_membership_invitation_command_legacy(p_issuer text, p_subject text, p_tenant_id uuid, p_invitation_id uuid, p_membership_id uuid, p_target_address text, p_roles text[], p_center_ids uuid[], p_credential_hash text, p_idempotency_key text, p_reissue_invitation_id uuid, p_correlation_id uuid) FROM PUBLIC;


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
-- Name: FUNCTION record_booking_read(p_tenant_id uuid, p_actor_identity_id uuid, p_center_id uuid, p_resource_type text, p_resource_id uuid, p_result text, p_reason text, p_correlation_id uuid); Type: ACL; Schema: iam_app; Owner: -
--

REVOKE ALL ON FUNCTION iam_app.record_booking_read(p_tenant_id uuid, p_actor_identity_id uuid, p_center_id uuid, p_resource_type text, p_resource_id uuid, p_result text, p_reason text, p_correlation_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION iam_app.record_booking_read(p_tenant_id uuid, p_actor_identity_id uuid, p_center_id uuid, p_resource_type text, p_resource_id uuid, p_result text, p_reason text, p_correlation_id uuid) TO dive_app;


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
-- Name: FUNCTION resolve_center_entry_command(p_center_key text); Type: ACL; Schema: iam_app; Owner: -
--

REVOKE ALL ON FUNCTION iam_app.resolve_center_entry_command(p_center_key text) FROM PUBLIC;
GRANT ALL ON FUNCTION iam_app.resolve_center_entry_command(p_center_key text) TO dive_app;


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
-- Name: FUNCTION revoke_membership_invitation_command(p_issuer text, p_subject text, p_tenant_id uuid, p_invitation_id uuid, p_correlation_id uuid); Type: ACL; Schema: iam_app; Owner: -
--

REVOKE ALL ON FUNCTION iam_app.revoke_membership_invitation_command(p_issuer text, p_subject text, p_tenant_id uuid, p_invitation_id uuid, p_correlation_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION iam_app.revoke_membership_invitation_command(p_issuer text, p_subject text, p_tenant_id uuid, p_invitation_id uuid, p_correlation_id uuid) TO dive_app;


--
-- Name: FUNCTION revoke_owner_invitation_command(p_issuer text, p_subject text, p_tenant_id uuid, p_invitation_id uuid, p_correlation_id uuid); Type: ACL; Schema: iam_app; Owner: -
--

REVOKE ALL ON FUNCTION iam_app.revoke_owner_invitation_command(p_issuer text, p_subject text, p_tenant_id uuid, p_invitation_id uuid, p_correlation_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION iam_app.revoke_owner_invitation_command(p_issuer text, p_subject text, p_tenant_id uuid, p_invitation_id uuid, p_correlation_id uuid) TO dive_app;


--
-- Name: FUNCTION revoke_tenant_context_command(p_issuer text, p_subject text, p_session_id_hash text, p_handle_hash text); Type: ACL; Schema: iam_app; Owner: -
--

REVOKE ALL ON FUNCTION iam_app.revoke_tenant_context_command(p_issuer text, p_subject text, p_session_id_hash text, p_handle_hash text) FROM PUBLIC;
GRANT ALL ON FUNCTION iam_app.revoke_tenant_context_command(p_issuer text, p_subject text, p_session_id_hash text, p_handle_hash text) TO dive_app;


--
-- Name: FUNCTION set_center_entry_status_command(p_issuer text, p_subject text, p_tenant_id uuid, p_center_id uuid, p_status text, p_purpose text, p_correlation_id uuid); Type: ACL; Schema: iam_app; Owner: -
--

REVOKE ALL ON FUNCTION iam_app.set_center_entry_status_command(p_issuer text, p_subject text, p_tenant_id uuid, p_center_id uuid, p_status text, p_purpose text, p_correlation_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION iam_app.set_center_entry_status_command(p_issuer text, p_subject text, p_tenant_id uuid, p_center_id uuid, p_status text, p_purpose text, p_correlation_id uuid) TO dive_app;


--
-- Name: FUNCTION sync_identity_tenant_binding(); Type: ACL; Schema: iam_app; Owner: -
--

REVOKE ALL ON FUNCTION iam_app.sync_identity_tenant_binding() FROM PUBLIC;


--
-- Name: FUNCTION validate_membership_centers(); Type: ACL; Schema: iam_app; Owner: -
--

REVOKE ALL ON FUNCTION iam_app.validate_membership_centers() FROM PUBLIC;


--
-- Name: FUNCTION claim_bootstrap_outbox_event(); Type: ACL; Schema: onboarding_app; Owner: -
--

REVOKE ALL ON FUNCTION onboarding_app.claim_bootstrap_outbox_event() FROM PUBLIC;
GRANT ALL ON FUNCTION onboarding_app.claim_bootstrap_outbox_event() TO dive_worker;


--
-- Name: FUNCTION complete_bootstrap_outbox_event(p_event_id uuid, p_provider_invitation_ref text, p_provider_status text); Type: ACL; Schema: onboarding_app; Owner: -
--

REVOKE ALL ON FUNCTION onboarding_app.complete_bootstrap_outbox_event(p_event_id uuid, p_provider_invitation_ref text, p_provider_status text) FROM PUBLIC;
GRANT ALL ON FUNCTION onboarding_app.complete_bootstrap_outbox_event(p_event_id uuid, p_provider_invitation_ref text, p_provider_status text) TO dive_worker;


--
-- Name: FUNCTION complete_own_tenant_bootstrap_command(p_issuer text, p_subject text, p_session_id_hash text, p_verified_addresses text[], p_operator_name text, p_center_name text, p_time_zone text, p_locale text, p_completion_fingerprint text, p_correlation_id uuid); Type: ACL; Schema: onboarding_app; Owner: -
--

REVOKE ALL ON FUNCTION onboarding_app.complete_own_tenant_bootstrap_command(p_issuer text, p_subject text, p_session_id_hash text, p_verified_addresses text[], p_operator_name text, p_center_name text, p_time_zone text, p_locale text, p_completion_fingerprint text, p_correlation_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION onboarding_app.complete_own_tenant_bootstrap_command(p_issuer text, p_subject text, p_session_id_hash text, p_verified_addresses text[], p_operator_name text, p_center_name text, p_time_zone text, p_locale text, p_completion_fingerprint text, p_correlation_id uuid) TO dive_app;


--
-- Name: FUNCTION consume_bootstrap_invitation_rate_limit(p_issuer text, p_subject text); Type: ACL; Schema: onboarding_app; Owner: -
--

REVOKE ALL ON FUNCTION onboarding_app.consume_bootstrap_invitation_rate_limit(p_issuer text, p_subject text) FROM PUBLIC;
GRANT ALL ON FUNCTION onboarding_app.consume_bootstrap_invitation_rate_limit(p_issuer text, p_subject text) TO dive_app;


--
-- Name: FUNCTION fail_bootstrap_outbox_event(p_event_id uuid, p_retryable boolean, p_next_attempt_at timestamp with time zone, p_provider_status text); Type: ACL; Schema: onboarding_app; Owner: -
--

REVOKE ALL ON FUNCTION onboarding_app.fail_bootstrap_outbox_event(p_event_id uuid, p_retryable boolean, p_next_attempt_at timestamp with time zone, p_provider_status text) FROM PUBLIC;
GRANT ALL ON FUNCTION onboarding_app.fail_bootstrap_outbox_event(p_event_id uuid, p_retryable boolean, p_next_attempt_at timestamp with time zone, p_provider_status text) TO dive_worker;


--
-- Name: FUNCTION issue_bootstrap_invitation_command(p_issuer text, p_subject text, p_destination_email text, p_reason text, p_idempotency_key text, p_request_fingerprint text, p_correlation_id uuid); Type: ACL; Schema: onboarding_app; Owner: -
--

REVOKE ALL ON FUNCTION onboarding_app.issue_bootstrap_invitation_command(p_issuer text, p_subject text, p_destination_email text, p_reason text, p_idempotency_key text, p_request_fingerprint text, p_correlation_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION onboarding_app.issue_bootstrap_invitation_command(p_issuer text, p_subject text, p_destination_email text, p_reason text, p_idempotency_key text, p_request_fingerprint text, p_correlation_id uuid) TO dive_app;


--
-- Name: FUNCTION read_bootstrap_invitation_command(p_issuer text, p_subject text, p_grant_id uuid); Type: ACL; Schema: onboarding_app; Owner: -
--

REVOKE ALL ON FUNCTION onboarding_app.read_bootstrap_invitation_command(p_issuer text, p_subject text, p_grant_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION onboarding_app.read_bootstrap_invitation_command(p_issuer text, p_subject text, p_grant_id uuid) TO dive_app;


--
-- Name: FUNCTION reissue_bootstrap_invitation_command(p_issuer text, p_subject text, p_grant_id uuid, p_reason text, p_idempotency_key text, p_request_fingerprint text, p_correlation_id uuid); Type: ACL; Schema: onboarding_app; Owner: -
--

REVOKE ALL ON FUNCTION onboarding_app.reissue_bootstrap_invitation_command(p_issuer text, p_subject text, p_grant_id uuid, p_reason text, p_idempotency_key text, p_request_fingerprint text, p_correlation_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION onboarding_app.reissue_bootstrap_invitation_command(p_issuer text, p_subject text, p_grant_id uuid, p_reason text, p_idempotency_key text, p_request_fingerprint text, p_correlation_id uuid) TO dive_app;


--
-- Name: FUNCTION retry_bootstrap_invitation_revoke_command(p_issuer text, p_subject text, p_grant_id uuid, p_reason text, p_idempotency_key text, p_request_fingerprint text, p_correlation_id uuid); Type: ACL; Schema: onboarding_app; Owner: -
--

REVOKE ALL ON FUNCTION onboarding_app.retry_bootstrap_invitation_revoke_command(p_issuer text, p_subject text, p_grant_id uuid, p_reason text, p_idempotency_key text, p_request_fingerprint text, p_correlation_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION onboarding_app.retry_bootstrap_invitation_revoke_command(p_issuer text, p_subject text, p_grant_id uuid, p_reason text, p_idempotency_key text, p_request_fingerprint text, p_correlation_id uuid) TO dive_app;


--
-- Name: FUNCTION revoke_bootstrap_invitation_command(p_issuer text, p_subject text, p_grant_id uuid, p_reason text, p_idempotency_key text, p_request_fingerprint text, p_correlation_id uuid); Type: ACL; Schema: onboarding_app; Owner: -
--

REVOKE ALL ON FUNCTION onboarding_app.revoke_bootstrap_invitation_command(p_issuer text, p_subject text, p_grant_id uuid, p_reason text, p_idempotency_key text, p_request_fingerprint text, p_correlation_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION onboarding_app.revoke_bootstrap_invitation_command(p_issuer text, p_subject text, p_grant_id uuid, p_reason text, p_idempotency_key text, p_request_fingerprint text, p_correlation_id uuid) TO dive_app;


--
-- Name: FUNCTION set_platform_capability(p_issuer text, p_subject text, p_capability text, p_enabled boolean); Type: ACL; Schema: onboarding_app; Owner: -
--

REVOKE ALL ON FUNCTION onboarding_app.set_platform_capability(p_issuer text, p_subject text, p_capability text, p_enabled boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION onboarding_app.set_platform_capability(p_issuer text, p_subject text, p_capability text, p_enabled boolean) TO dive_platform_admin;


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
-- Name: COLUMN activities.revision; Type: ACL; Schema: booking_app; Owner: -
--

GRANT UPDATE(revision) ON TABLE booking_app.activities TO dive_app;


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
-- Name: TABLE catalog_settings; Type: ACL; Schema: booking_app; Owner: -
--

GRANT SELECT,INSERT ON TABLE booking_app.catalog_settings TO dive_app;


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
-- Name: TABLE center_entries; Type: ACL; Schema: iam_app; Owner: -
--

GRANT SELECT ON TABLE iam_app.center_entries TO dive_app;


--
-- Name: TABLE centers; Type: ACL; Schema: iam_app; Owner: -
--

GRANT SELECT ON TABLE iam_app.centers TO dive_app;


--
-- Name: TABLE invitations; Type: ACL; Schema: iam_app; Owner: -
--

REVOKE ALL ON TABLE iam_app.invitations FROM dive_worker;


--
-- Name: COLUMN invitations.provider_kind; Type: ACL; Schema: iam_app; Owner: -
--

REVOKE UPDATE(provider_kind) ON TABLE iam_app.invitations FROM dive_worker;


--
-- Name: COLUMN invitations.provider_invitation_id; Type: ACL; Schema: iam_app; Owner: -
--

REVOKE UPDATE(provider_invitation_id) ON TABLE iam_app.invitations FROM dive_worker;


--
-- Name: COLUMN invitations.delivery_status; Type: ACL; Schema: iam_app; Owner: -
--

REVOKE UPDATE(delivery_status) ON TABLE iam_app.invitations FROM dive_worker;


--
-- Name: COLUMN invitations.delivery_attempt_count; Type: ACL; Schema: iam_app; Owner: -
--

REVOKE UPDATE(delivery_attempt_count) ON TABLE iam_app.invitations FROM dive_worker;


--
-- Name: COLUMN invitations.delivery_next_attempt_at; Type: ACL; Schema: iam_app; Owner: -
--

REVOKE UPDATE(delivery_next_attempt_at) ON TABLE iam_app.invitations FROM dive_worker;


--
-- Name: COLUMN invitations.provider_status; Type: ACL; Schema: iam_app; Owner: -
--

REVOKE UPDATE(provider_status) ON TABLE iam_app.invitations FROM dive_worker;


--
-- Name: TABLE outbox_events; Type: ACL; Schema: iam_app; Owner: -
--

REVOKE ALL ON TABLE iam_app.outbox_events FROM dive_worker;


--
-- Name: COLUMN outbox_events.delivery_status; Type: ACL; Schema: iam_app; Owner: -
--

REVOKE UPDATE(delivery_status) ON TABLE iam_app.outbox_events FROM dive_worker;


--
-- Name: COLUMN outbox_events.delivery_attempt_count; Type: ACL; Schema: iam_app; Owner: -
--

REVOKE UPDATE(delivery_attempt_count) ON TABLE iam_app.outbox_events FROM dive_worker;


--
-- Name: COLUMN outbox_events.delivery_next_attempt_at; Type: ACL; Schema: iam_app; Owner: -
--

REVOKE UPDATE(delivery_next_attempt_at) ON TABLE iam_app.outbox_events FROM dive_worker;


--
-- Name: COLUMN outbox_events.provider_status; Type: ACL; Schema: iam_app; Owner: -
--

REVOKE UPDATE(provider_status) ON TABLE iam_app.outbox_events FROM dive_worker;


--
-- Name: TABLE tenants; Type: ACL; Schema: iam_app; Owner: -
--

GRANT SELECT ON TABLE iam_app.tenants TO dive_app;


--
-- PostgreSQL database dump complete
--



SET row_security = on;


CREATE OR REPLACE FUNCTION onboarding_app.claim_bootstrap_outbox_event()
RETURNS TABLE (
  event_id uuid, grant_id uuid, command text, destination_email text,
  provider_invitation_ref text, attempt_count integer, correlation_id uuid
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'onboarding_app', 'pg_catalog', 'pg_temp'
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_claim record;
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

  FOR v_claim IN
    SELECT event.id, event.grant_id, event.command,
      bootstrap_grant.destination_email, bootstrap_grant.provider_invitation_ref,
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
            WITH RECURSIVE predecessors AS (
              SELECT previous_grant.id, previous_grant.superseded_by_grant_id
              FROM onboarding_app.tenant_bootstrap_grants previous_grant
              WHERE previous_grant.superseded_by_grant_id = bootstrap_grant.id
              UNION
              SELECT previous_grant.id, previous_grant.superseded_by_grant_id
              FROM onboarding_app.tenant_bootstrap_grants previous_grant
              JOIN predecessors ON previous_grant.superseded_by_grant_id = predecessors.id
            )
            SELECT 1 FROM predecessors previous_grant
            WHERE NOT EXISTS (
              SELECT 1 FROM onboarding_app.tenant_bootstrap_outbox_events revocation
              WHERE revocation.grant_id = previous_grant.id
                AND revocation.command = 'revoke'
                AND revocation.idempotency_key =
                  'bootstrap-revoke:' || previous_grant.id::text || ':' || previous_grant.superseded_by_grant_id::text
                AND revocation.delivery_state = 'succeeded'
            )
          )
        )
      )
    ORDER BY event.created_at,
      CASE event.command WHEN 'revoke' THEN 0 ELSE 1 END, event.id
    LIMIT 1
    FOR UPDATE OF event SKIP LOCKED
  LOOP
    UPDATE onboarding_app.tenant_bootstrap_outbox_events event
    SET attempt_count = event.attempt_count
    WHERE event.id = v_claim.id;
    RETURN QUERY SELECT v_claim.id, v_claim.grant_id, v_claim.command,
      v_claim.destination_email, v_claim.provider_invitation_ref,
      v_claim.attempt_count, v_claim.correlation_id;
  END LOOP;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION onboarding_app.complete_bootstrap_outbox_event(
  p_event_id uuid, p_provider_invitation_ref text, p_provider_status text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'onboarding_app', 'pg_catalog', 'pg_temp'
AS $$
DECLARE
  v_event onboarding_app.tenant_bootstrap_outbox_events%ROWTYPE;
BEGIN
  SELECT event.* INTO v_event
  FROM onboarding_app.tenant_bootstrap_outbox_events event
  WHERE event.id = p_event_id
    AND event.delivery_state IN ('pending', 'retrying')
    AND EXISTS (
      SELECT 1 FROM pg_catalog.pg_locks claim_lock
      WHERE claim_lock.locktype = 'transactionid'
        AND claim_lock.transactionid = event.xmin
        AND claim_lock.pid = pg_backend_pid()
        AND claim_lock.mode = 'ExclusiveLock' AND claim_lock.granted
    )
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bootstrap delivery scope is invalid' USING ERRCODE = '42501';
  END IF;
  UPDATE onboarding_app.tenant_bootstrap_outbox_events
  SET delivery_state = 'succeeded', attempt_count = attempt_count + 1,
      completed_at = now()
  WHERE id = p_event_id;
  UPDATE onboarding_app.tenant_bootstrap_grants
  SET delivery_status = 'succeeded',
      provider_invitation_ref = coalesce(p_provider_invitation_ref, provider_invitation_ref),
      provider_status = p_provider_status
  WHERE id = v_event.grant_id;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION onboarding_app.fail_bootstrap_outbox_event(
  p_event_id uuid, p_retryable boolean, p_next_attempt_at timestamptz,
  p_provider_status text
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'onboarding_app', 'pg_catalog', 'pg_temp'
AS $$
DECLARE
  v_event onboarding_app.tenant_bootstrap_outbox_events%ROWTYPE;
  v_next_state text;
BEGIN
  SELECT event.* INTO v_event
  FROM onboarding_app.tenant_bootstrap_outbox_events event
  WHERE event.id = p_event_id
    AND event.delivery_state IN ('pending', 'retrying')
    AND EXISTS (
      SELECT 1 FROM pg_catalog.pg_locks claim_lock
      WHERE claim_lock.locktype = 'transactionid'
        AND claim_lock.transactionid = event.xmin
        AND claim_lock.pid = pg_backend_pid()
        AND claim_lock.mode = 'ExclusiveLock' AND claim_lock.granted
    )
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bootstrap delivery scope is invalid' USING ERRCODE = '42501';
  END IF;
  v_next_state := CASE
    WHEN p_retryable AND v_event.attempt_count + 1 < 8 THEN 'retrying'
    ELSE 'dead_letter'
  END;
  IF v_next_state = 'retrying' AND p_next_attempt_at IS NULL THEN
    RAISE EXCEPTION 'Retryable failure requires next attempt timestamp';
  END IF;
  UPDATE onboarding_app.tenant_bootstrap_outbox_events
  SET delivery_state = v_next_state, attempt_count = attempt_count + 1,
      next_attempt_at = coalesce(p_next_attempt_at, next_attempt_at),
      completed_at = CASE WHEN v_next_state = 'dead_letter' THEN now() ELSE NULL END
  WHERE id = p_event_id;
  UPDATE onboarding_app.tenant_bootstrap_grants
  SET delivery_status = v_next_state, provider_status = p_provider_status
  WHERE id = v_event.grant_id;
  IF v_next_state = 'dead_letter' THEN
    INSERT INTO onboarding_app.bootstrap_invitation_audit_records (
      id, action, grant_id, result, reason, correlation_id
    ) VALUES (
      gen_random_uuid(), 'tenant_bootstrap_invitation.delivery_failed',
      v_event.grant_id, 'failed', 'provider_delivery_failed', v_event.correlation_id
    );
  END IF;
  RETURN v_next_state;
END;
$$;
--> statement-breakpoint
GRANT USAGE, CREATE ON SCHEMA onboarding_app TO dive_bootstrap_delivery;
--> statement-breakpoint
GRANT SELECT (
  id, status, expires_at, destination_email, provider_invitation_ref,
  superseded_by_grant_id
) ON TABLE onboarding_app.tenant_bootstrap_grants TO dive_bootstrap_delivery;
--> statement-breakpoint
GRANT UPDATE (
  status, delivery_status, provider_invitation_ref, provider_status
) ON TABLE onboarding_app.tenant_bootstrap_grants TO dive_bootstrap_delivery;
--> statement-breakpoint
GRANT SELECT, DELETE ON TABLE onboarding_app.tenant_bootstrap_outbox_events
TO dive_bootstrap_delivery;
--> statement-breakpoint
GRANT UPDATE (
  delivery_state, attempt_count, next_attempt_at, completed_at
) ON TABLE onboarding_app.tenant_bootstrap_outbox_events TO dive_bootstrap_delivery;
--> statement-breakpoint
GRANT INSERT (
  id, action, grant_id, result, reason, correlation_id
) ON TABLE onboarding_app.bootstrap_invitation_audit_records TO dive_bootstrap_delivery;
--> statement-breakpoint
ALTER FUNCTION onboarding_app.claim_bootstrap_outbox_event()
OWNER TO dive_bootstrap_delivery;
--> statement-breakpoint
ALTER FUNCTION onboarding_app.complete_bootstrap_outbox_event(uuid, text, text)
OWNER TO dive_bootstrap_delivery;
--> statement-breakpoint
ALTER FUNCTION onboarding_app.fail_bootstrap_outbox_event(uuid, boolean, timestamptz, text)
OWNER TO dive_bootstrap_delivery;
--> statement-breakpoint
REVOKE CREATE ON SCHEMA onboarding_app FROM dive_bootstrap_delivery;
--> statement-breakpoint
SET LOCAL ROLE dive_bootstrap_delivery;
--> statement-breakpoint
REVOKE ALL ON FUNCTION onboarding_app.claim_bootstrap_outbox_event() FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION onboarding_app.complete_bootstrap_outbox_event(uuid, text, text) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION onboarding_app.fail_bootstrap_outbox_event(uuid, boolean, timestamptz, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION onboarding_app.claim_bootstrap_outbox_event() TO dive_worker;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION onboarding_app.complete_bootstrap_outbox_event(uuid, text, text) TO dive_worker;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION onboarding_app.fail_bootstrap_outbox_event(uuid, boolean, timestamptz, text) TO dive_worker;
--> statement-breakpoint
SET LOCAL ROLE dive_migration;
