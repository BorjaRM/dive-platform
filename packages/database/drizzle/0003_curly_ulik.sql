CREATE TABLE "onboarding_app"."bootstrap_invitation_rate_limits" (
	"principal_id" uuid PRIMARY KEY NOT NULL,
	"attempted_at" timestamp with time zone[] DEFAULT ARRAY[]::timestamptz[] NOT NULL
);
--> statement-breakpoint
ALTER TABLE "onboarding_app"."bootstrap_invitation_rate_limits" ADD CONSTRAINT "bootstrap_invitation_rate_limits_principal_id_platform_principals_id_fk" FOREIGN KEY ("principal_id") REFERENCES "onboarding_app"."platform_principals"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
REVOKE ALL ON TABLE onboarding_app.bootstrap_invitation_rate_limits FROM PUBLIC, dive_app, dive_worker, dive_platform_admin;
--> statement-breakpoint
CREATE FUNCTION onboarding_app.consume_bootstrap_invitation_rate_limit(
	p_issuer text,
	p_subject text
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = onboarding_app, pg_catalog, pg_temp
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
--> statement-breakpoint
REVOKE ALL ON FUNCTION onboarding_app.consume_bootstrap_invitation_rate_limit(text, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION onboarding_app.consume_bootstrap_invitation_rate_limit(text, text) TO dive_app;