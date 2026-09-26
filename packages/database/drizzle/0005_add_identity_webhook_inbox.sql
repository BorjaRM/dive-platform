CREATE TABLE "iam_app"."identity_webhook_inbox" (
	"provider_event_id" text NOT NULL,
	"issuer" text NOT NULL,
	"event_type" text NOT NULL,
	"subject" text,
	"occurred_at" timestamp with time zone,
	"resolved_identity_id" uuid,
	"processing_result" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "identity_webhook_inbox_issuer_provider_event_id_pk" PRIMARY KEY("issuer","provider_event_id"),
	CONSTRAINT "identity_webhook_inbox_result_known" CHECK (processing_result IN ('applied', 'ignored', 'unresolved'))
);
--> statement-breakpoint
ALTER TABLE "iam_app"."identity_webhook_inbox" ADD CONSTRAINT "identity_webhook_inbox_resolved_identity_id_identities_id_fk" FOREIGN KEY ("resolved_identity_id") REFERENCES "iam_app"."identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE OR REPLACE FUNCTION iam_app.resolve_access(p_issuer text, p_subject text, p_tenant uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = iam_app, pg_temp AS $$
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
--> statement-breakpoint
CREATE OR REPLACE FUNCTION iam_app.apply_identity_webhook_command(
	p_provider_event_id text,
	p_issuer text,
	p_event_type text,
	p_subject text,
	p_occurred_at timestamptz,
	p_correlation_id uuid
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
		SELECT DISTINCT membership.tenant_id
		FROM iam_app.memberships AS membership
		WHERE membership.identity_id = v_identity_id
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
REVOKE ALL ON FUNCTION iam_app.apply_identity_webhook_command(text, text, text, text, timestamptz, uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION iam_app.apply_identity_webhook_command(text, text, text, text, timestamptz, uuid) TO dive_app;
--> statement-breakpoint
REVOKE ALL ON iam_app.identity_webhook_inbox FROM dive_app;