CREATE OR REPLACE FUNCTION iam_app.apply_identity_webhook_command(
	p_provider_event_id text,
	p_issuer text,
	p_event_type text,
	p_subject text,
	p_occurred_at timestamptz,
	p_correlation_id uuid,
	p_session_id_hash text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = iam_app, pg_temp AS $$
DECLARE
	v_identity_id uuid;
	v_processing_result text;
	v_inserted_count integer;
	v_affected_tenant_count integer := 0;
	v_tenant_id uuid;
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
		SELECT count(DISTINCT tenant_id)::integer INTO v_affected_tenant_count
		FROM iam_app.tenant_contexts
		WHERE identity_id = v_identity_id
			AND session_id_hash = p_session_id_hash
			AND revoked_at IS NULL;
		UPDATE iam_app.tenant_contexts
		SET revoked_at = clock_timestamp()
		WHERE identity_id = v_identity_id
			AND session_id_hash = p_session_id_hash
			AND revoked_at IS NULL;
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

	UPDATE iam_app.identity_webhook_inbox
	SET resolved_identity_id = v_identity_id, processing_result = 'applied'
	WHERE issuer = p_issuer AND provider_event_id = p_provider_event_id;
	RETURN jsonb_build_object(
		'duplicate', false,
		'processingResult', 'applied',
		'affectedTenantCount', v_affected_tenant_count
	);
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION iam_app.apply_identity_webhook_command(text, text, text, text, timestamptz, uuid, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION iam_app.apply_identity_webhook_command(text, text, text, text, timestamptz, uuid, text) TO dive_app;
