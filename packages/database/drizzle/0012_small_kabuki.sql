ALTER TABLE "onboarding_app"."tenant_bootstrap_grants" ALTER COLUMN "issue_reason" DROP NOT NULL;
ALTER TABLE "onboarding_app"."bootstrap_invitation_audit_records"
	ADD CONSTRAINT "bootstrap_invitation_audit_mutation_reason_required"
	CHECK (
		action NOT IN (
			'tenant_bootstrap_invitation.reissued',
			'tenant_bootstrap_invitation.revoked'
		) OR (reason IS NOT NULL AND btrim(reason) <> '')
	) NOT VALID;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION onboarding_app.issue_bootstrap_invitation_command(
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
--> statement-breakpoint
CREATE OR REPLACE FUNCTION onboarding_app.read_bootstrap_invitation_command(
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
--> statement-breakpoint
CREATE OR REPLACE FUNCTION onboarding_app.reissue_bootstrap_invitation_command(
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
--> statement-breakpoint
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
		p_grant_id, 'success', NULLIF(btrim(p_reason), ''), p_correlation_id
	);

	v_result := jsonb_build_object(
		'invitationId', p_grant_id,
		'destinationEmail', v_grant.destination_email,
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