ALTER TABLE "onboarding_app"."tenant_bootstrap_grants" ADD CONSTRAINT "tenant_bootstrap_grants_superseded_by_grant_id_tenant_bootstrap_grants_id_fk" FOREIGN KEY ("superseded_by_grant_id") REFERENCES "onboarding_app"."tenant_bootstrap_grants"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
REVOKE ALL ON SCHEMA onboarding_app FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON ALL TABLES IN SCHEMA onboarding_app FROM PUBLIC, dive_app, dive_worker, dive_platform_admin;
--> statement-breakpoint
GRANT USAGE ON SCHEMA onboarding_app TO dive_app, dive_worker, dive_platform_admin;
--> statement-breakpoint
CREATE FUNCTION onboarding_app.set_platform_capability(
	p_issuer text,
	p_subject text,
	p_capability text,
	p_enabled boolean
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = onboarding_app, pg_catalog, pg_temp
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
--> statement-breakpoint
CREATE FUNCTION onboarding_app.issue_bootstrap_invitation_command(
	p_issuer text,
	p_subject text,
	p_destination_email text,
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
		v_principal_id, btrim(p_reason), p_request_fingerprint
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
		v_grant_id, 'success', btrim(p_reason), p_correlation_id
	);

	v_result := jsonb_build_object(
		'invitationId', v_grant_id,
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
--> statement-breakpoint
CREATE FUNCTION onboarding_app.read_bootstrap_invitation_command(
	p_issuer text,
	p_subject text,
	p_grant_id uuid
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = onboarding_app, pg_catalog, pg_temp
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
--> statement-breakpoint
CREATE FUNCTION onboarding_app.reissue_bootstrap_invitation_command(
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
		v_principal_id, btrim(p_reason), p_request_fingerprint
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
		v_new_grant_id, 'success', btrim(p_reason), p_correlation_id
	);

	v_result := jsonb_build_object(
		'invitationId', v_new_grant_id,
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
--> statement-breakpoint
CREATE FUNCTION onboarding_app.revoke_bootstrap_invitation_command(
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
	SET status = 'revoked', revoked_at = now()
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
		p_grant_id, 'success', btrim(p_reason), p_correlation_id
	);

	v_result := jsonb_build_object(
		'invitationId', p_grant_id,
		'status', 'revoked',
		'deliveryStatus', v_grant.delivery_status
	);
	INSERT INTO onboarding_app.bootstrap_invitation_command_receipts (
		principal_id, command, idempotency_key, request_fingerprint, result
	) VALUES (
		v_principal_id, 'revoke', p_idempotency_key, p_request_fingerprint, v_result
	);
	RETURN v_result;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION onboarding_app.claim_bootstrap_outbox_event()
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
	SELECT event.id, event.grant_id, event.command, bootstrap_grant.destination_email,
		bootstrap_grant.provider_invitation_ref, event.attempt_count, event.correlation_id
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
			)
		)
	ORDER BY event.created_at,
		CASE event.command WHEN 'revoke' THEN 0 ELSE 1 END,
		event.id
	LIMIT 1
	FOR UPDATE OF event SKIP LOCKED;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION onboarding_app.complete_bootstrap_outbox_event(
	p_event_id uuid,
	p_provider_invitation_ref text,
	p_provider_status text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = onboarding_app, pg_catalog, pg_temp
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
--> statement-breakpoint
CREATE FUNCTION onboarding_app.fail_bootstrap_outbox_event(
	p_event_id uuid,
	p_retryable boolean,
	p_next_attempt_at timestamptz,
	p_provider_status text
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = onboarding_app, pg_catalog, pg_temp
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
--> statement-breakpoint
REVOKE ALL ON FUNCTION onboarding_app.set_platform_capability(text, text, text, boolean) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION onboarding_app.issue_bootstrap_invitation_command(text, text, text, text, text, text, uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION onboarding_app.read_bootstrap_invitation_command(text, text, uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION onboarding_app.reissue_bootstrap_invitation_command(text, text, uuid, text, text, text, uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION onboarding_app.revoke_bootstrap_invitation_command(text, text, uuid, text, text, text, uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION onboarding_app.claim_bootstrap_outbox_event() FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION onboarding_app.complete_bootstrap_outbox_event(uuid, text, text) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION onboarding_app.fail_bootstrap_outbox_event(uuid, boolean, timestamptz, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION onboarding_app.set_platform_capability(text, text, text, boolean) TO dive_platform_admin;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION onboarding_app.issue_bootstrap_invitation_command(text, text, text, text, text, text, uuid) TO dive_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION onboarding_app.read_bootstrap_invitation_command(text, text, uuid) TO dive_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION onboarding_app.reissue_bootstrap_invitation_command(text, text, uuid, text, text, text, uuid) TO dive_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION onboarding_app.revoke_bootstrap_invitation_command(text, text, uuid, text, text, text, uuid) TO dive_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION onboarding_app.claim_bootstrap_outbox_event() TO dive_worker;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION onboarding_app.complete_bootstrap_outbox_event(uuid, text, text) TO dive_worker;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION onboarding_app.fail_bootstrap_outbox_event(uuid, boolean, timestamptz, text) TO dive_worker;