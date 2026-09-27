CREATE OR REPLACE FUNCTION iam_app.issue_tenant_context_command(
	p_issuer text,
	p_subject text,
	p_session_id_hash text,
	p_tenant_id uuid,
	p_handle_hash text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = iam_app, pg_temp AS $$
DECLARE
	v_identity_id uuid;
	v_issued_at timestamptz;
	v_live_count integer;
	v_recent_count integer;
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
		RETURN jsonb_build_object('deniedReason', 'membership_missing_or_inactive');
	END IF;

	PERFORM pg_advisory_xact_lock(
		hashtextextended(v_identity_id::text || E'\n' || p_session_id_hash, 0)
	);
	SELECT count(*)::integer INTO v_recent_count
	FROM iam_app.tenant_contexts
	WHERE identity_id = v_identity_id
		AND session_id_hash = p_session_id_hash
		AND issued_at >= clock_timestamp() - interval '1 minute';
	IF v_recent_count >= 10 THEN
		RETURN jsonb_build_object('deniedReason', 'invariant_violation');
	END IF;

	SELECT count(*)::integer INTO v_live_count
	FROM iam_app.tenant_contexts
	WHERE identity_id = v_identity_id
		AND session_id_hash = p_session_id_hash
		AND revoked_at IS NULL;
	IF v_live_count >= 20 THEN
		RETURN jsonb_build_object('deniedReason', 'invariant_violation');
	END IF;

	v_issued_at := clock_timestamp();
	INSERT INTO iam_app.tenant_contexts (
		handle_hash, identity_id, tenant_id, session_id_hash, issued_at
	) VALUES (
		p_handle_hash, v_identity_id, p_tenant_id, p_session_id_hash, v_issued_at
	);
	RETURN jsonb_build_object(
		'tenantId', p_tenant_id,
		'issuedAt', v_issued_at
	);
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION iam_app.issue_tenant_context_command(text, text, text, uuid, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION iam_app.issue_tenant_context_command(text, text, text, uuid, text) TO dive_app;
