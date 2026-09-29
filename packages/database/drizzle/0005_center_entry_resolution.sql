DROP POLICY center_entries_isolation ON iam_app.center_entries;
--> statement-breakpoint
CREATE POLICY center_entries_isolation ON iam_app.center_entries
USING (
	tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
	OR center_key = current_setting('app.center_entry_key', true)
)
WITH CHECK (
	tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
);
--> statement-breakpoint
CREATE FUNCTION iam_app.resolve_center_entry_command(p_center_key text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = iam_app, pg_catalog, pg_temp
AS $$
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
	WHERE center_key = p_center_key
	FOR KEY SHARE;

	IF NOT FOUND THEN
		RETURN NULL;
	END IF;

	RETURN jsonb_build_object(
		'tenantId', resolved.tenant_id,
		'centerId', resolved.center_id
	);
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION iam_app.resolve_center_entry_command(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION iam_app.resolve_center_entry_command(text) TO dive_app;