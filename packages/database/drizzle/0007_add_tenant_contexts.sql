CREATE TABLE "iam_app"."tenant_contexts" (
	"handle_hash" text PRIMARY KEY NOT NULL,
	"identity_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"session_id_hash" text NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "tenant_contexts_handle_hash_format" CHECK (handle_hash ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "tenant_contexts_session_id_hash_format" CHECK (session_id_hash ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
SELECT set_config('app.tenant_id', '00000000-0000-0000-0000-000000000000', true);
--> statement-breakpoint
ALTER TABLE "iam_app"."tenant_contexts" ADD CONSTRAINT "tenant_contexts_identity_id_identities_id_fk" FOREIGN KEY ("identity_id") REFERENCES "iam_app"."identities"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "iam_app"."tenant_contexts" ADD CONSTRAINT "tenant_contexts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "iam_app"."tenants"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "tenant_contexts_identity_session_active_idx" ON "iam_app"."tenant_contexts" ("identity_id", "session_id_hash") WHERE revoked_at IS NULL;
--> statement-breakpoint
CREATE INDEX "tenant_contexts_revoked_at_idx" ON "iam_app"."tenant_contexts" ("revoked_at") WHERE revoked_at IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "iam_app"."tenant_contexts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "iam_app"."tenant_contexts" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_contexts_isolation ON "iam_app"."tenant_contexts"
  USING (tenant_id = current_setting('app.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);
--> statement-breakpoint
REVOKE ALL ON "iam_app"."tenant_contexts" FROM dive_app;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION iam_app.list_operators_command(
	p_issuer text,
	p_subject text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = iam_app, pg_temp AS $$
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
--> statement-breakpoint
REVOKE ALL ON FUNCTION iam_app.list_operators_command(text, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION iam_app.list_operators_command(text, text) TO dive_app;
--> statement-breakpoint
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
--> statement-breakpoint
CREATE OR REPLACE FUNCTION iam_app.resolve_tenant_context_command(
	p_issuer text,
	p_subject text,
	p_session_id_hash text,
	p_handle_hash text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = iam_app, pg_temp AS $$
DECLARE
	v_identity_id uuid;
	v_tenant_id uuid;
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

	SELECT tenant_id INTO v_tenant_id
	FROM iam_app.tenant_contexts
	WHERE handle_hash = p_handle_hash
		AND identity_id = v_identity_id
		AND session_id_hash = p_session_id_hash
		AND revoked_at IS NULL;
	IF v_tenant_id IS NULL THEN RETURN NULL; END IF;
	RETURN jsonb_build_object('identityId', v_identity_id, 'tenantId', v_tenant_id);
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION iam_app.resolve_tenant_context_command(text, text, text, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION iam_app.resolve_tenant_context_command(text, text, text, text) TO dive_app;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION iam_app.revoke_tenant_context_command(
	p_issuer text,
	p_subject text,
	p_session_id_hash text,
	p_handle_hash text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = iam_app, pg_temp AS $$
DECLARE
	v_identity_id uuid;
	v_updated_count integer;
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
	UPDATE iam_app.tenant_contexts
	SET revoked_at = COALESCE(revoked_at, clock_timestamp())
	WHERE handle_hash = p_handle_hash
		AND identity_id = v_identity_id
		AND session_id_hash = p_session_id_hash;
	GET DIAGNOSTICS v_updated_count = ROW_COUNT;
	IF v_updated_count = 0 THEN
		RETURN jsonb_build_object('deniedReason', 'membership_missing_or_inactive');
	END IF;
	RETURN jsonb_build_object('revoked', true);
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION iam_app.revoke_tenant_context_command(text, text, text, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION iam_app.revoke_tenant_context_command(text, text, text, text) TO dive_app;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION iam_app.cleanup_revoked_tenant_contexts_command()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = iam_app, pg_temp AS $$
DECLARE
	v_deleted_count integer;
BEGIN
	DELETE FROM iam_app.tenant_contexts
	WHERE revoked_at IS NOT NULL
		AND revoked_at < clock_timestamp() - interval '30 days';
	GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
	RETURN v_deleted_count;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION iam_app.cleanup_revoked_tenant_contexts_command() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION iam_app.cleanup_revoked_tenant_contexts_command() TO dive_app;
--> statement-breakpoint
DROP FUNCTION iam_app.apply_identity_webhook_command(text, text, text, text, timestamptz, uuid);
--> statement-breakpoint
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