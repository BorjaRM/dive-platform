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
