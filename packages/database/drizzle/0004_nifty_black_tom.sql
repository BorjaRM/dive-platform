CREATE TABLE "iam_app"."center_entries" (
	"center_key" text PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"center_id" uuid NOT NULL,
	CONSTRAINT "center_entries_tenant_id_center_id_unique" UNIQUE("tenant_id","center_id"),
	CONSTRAINT "center_entries_key_format" CHECK (center_key ~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$')
);
--> statement-breakpoint
CREATE TABLE "iam_app"."identity_preferences" (
	"identity_id" uuid PRIMARY KEY NOT NULL,
	"locale" text NOT NULL,
	CONSTRAINT "identity_preferences_locale_known" CHECK (locale IN ('es', 'en'))
);
--> statement-breakpoint
CREATE TABLE "onboarding_app"."bootstrap_redemption_rate_limits" (
	"issuer" text NOT NULL,
	"subject" text NOT NULL,
	"session_id_hash" text NOT NULL,
	"attempted_at" timestamp with time zone[] DEFAULT ARRAY[]::timestamptz[] NOT NULL,
	CONSTRAINT "bootstrap_redemption_rate_limits_issuer_subject_session_id_hash_pk" PRIMARY KEY("issuer","subject","session_id_hash"),
	CONSTRAINT "bootstrap_redemption_rate_limits_principal_normalized" CHECK (issuer = btrim(issuer) AND issuer <> '' AND subject = btrim(subject) AND subject <> ''),
	CONSTRAINT "bootstrap_redemption_rate_limits_session_hash_format" CHECK (session_id_hash ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "onboarding_app"."bootstrap_invitation_audit_records" DROP CONSTRAINT "bootstrap_invitation_audit_action_known";--> statement-breakpoint
ALTER TABLE "onboarding_app"."tenant_bootstrap_grants" ADD COLUMN "completion_fingerprint" text;--> statement-breakpoint
SELECT set_config('app.tenant_id', '00000000-0000-4000-8000-000000000000', true);--> statement-breakpoint
ALTER TABLE "iam_app"."center_entries" ADD CONSTRAINT "center_entries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "iam_app"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iam_app"."center_entries" ADD CONSTRAINT "center_entries_tenant_id_center_id_centers_tenant_id_id_fk" FOREIGN KEY ("tenant_id","center_id") REFERENCES "iam_app"."centers"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iam_app"."identity_preferences" ADD CONSTRAINT "identity_preferences_identity_id_identities_id_fk" FOREIGN KEY ("identity_id") REFERENCES "iam_app"."identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_app"."bootstrap_invitation_audit_records" ADD CONSTRAINT "bootstrap_invitation_audit_action_known" CHECK (action IN (
        'tenant_bootstrap_invitation.issued',
        'tenant_bootstrap_invitation.reissued',
        'tenant_bootstrap_invitation.revoked',
        'tenant_bootstrap_invitation.delivery_failed',
        'tenant_bootstrap.completed',
        'tenant_bootstrap.denied'
      ));--> statement-breakpoint
ALTER TABLE "onboarding_app"."tenant_bootstrap_grants" ADD CONSTRAINT "tenant_bootstrap_grants_completion_fingerprint_format" CHECK (completion_fingerprint IS NULL OR completion_fingerprint ~ '^[0-9a-f]{64}$');
--> statement-breakpoint
REVOKE ALL ON TABLE iam_app.center_entries FROM PUBLIC, dive_app, dive_worker, dive_platform_admin;
--> statement-breakpoint
REVOKE ALL ON TABLE iam_app.identity_preferences FROM PUBLIC, dive_app, dive_worker, dive_platform_admin;
--> statement-breakpoint
REVOKE ALL ON TABLE onboarding_app.bootstrap_redemption_rate_limits FROM PUBLIC, dive_app, dive_worker, dive_platform_admin;
--> statement-breakpoint
ALTER TABLE iam_app.center_entries ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE iam_app.center_entries FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY center_entries_isolation ON iam_app.center_entries
USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint
CREATE FUNCTION onboarding_app.complete_own_tenant_bootstrap_command(
	p_issuer text,
	p_subject text,
	p_session_id_hash text,
	p_verified_addresses text[],
	p_operator_name text,
	p_center_name text,
	p_time_zone text,
	p_locale text,
	p_completion_fingerprint text,
	p_correlation_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = onboarding_app, iam_app, pg_catalog, pg_temp
AS $$
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
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION onboarding_app.complete_own_tenant_bootstrap_command(
	text, text, text, text[], text, text, text, text, text, uuid
) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION onboarding_app.complete_own_tenant_bootstrap_command(
	text, text, text, text[], text, text, text, text, text, uuid
) TO dive_app;