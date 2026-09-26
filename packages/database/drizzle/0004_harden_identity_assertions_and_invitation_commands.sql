ALTER TABLE "iam_app"."external_identities" ADD CONSTRAINT "external_identities_issuer_normalized" CHECK (issuer = btrim(issuer) AND issuer <> '');--> statement-breakpoint
ALTER TABLE "iam_app"."external_identities" ADD CONSTRAINT "external_identities_subject_normalized" CHECK (subject = btrim(subject) AND subject <> '');--> statement-breakpoint
CREATE OR REPLACE FUNCTION iam_app.issue_invitation_command(
	p_issuer text,
	p_subject text,
	p_tenant_id uuid,
	p_invitation_id uuid,
	p_membership_id uuid,
	p_target_address text,
	p_roles text[],
	p_center_ids uuid[],
	p_credential_hash text,
	p_idempotency_key text,
	p_reissue_invitation_id uuid,
	p_correlation_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = iam_app, pg_temp AS $$
DECLARE
	v_actor_identity_id uuid;
	v_actor_roles text[];
	v_existing iam_app.invitations%ROWTYPE;
	v_existing_roles text[];
	v_existing_center_ids uuid[];
	v_reissue iam_app.invitations%ROWTYPE;
	v_issued iam_app.invitations%ROWTYPE;
BEGIN
	PERFORM set_config('app.tenant_id', p_tenant_id::text, true);
	SELECT external_identity.identity_id, membership.roles
	INTO v_actor_identity_id, v_actor_roles
	FROM iam_app.external_identities AS external_identity
	JOIN iam_app.memberships AS membership
		ON membership.identity_id = external_identity.identity_id
		AND membership.tenant_id = p_tenant_id
		AND membership.status = 'active'
	WHERE external_identity.issuer = p_issuer
		AND external_identity.subject = p_subject;

	IF v_actor_identity_id IS NULL THEN
		RETURN jsonb_build_object('deniedReason', 'membership_missing_or_inactive');
	END IF;
	IF v_actor_roles @> ARRAY['external_collaborator']::text[]
		OR NOT (v_actor_roles && ARRAY['tenant_owner', 'tenant_admin']::text[]) THEN
		INSERT INTO iam_app.audit_records (
			id, tenant_id, actor_identity_id, action, resource_type, resource_id,
			result, reason, correlation_id
		) VALUES (
			gen_random_uuid(), p_tenant_id, v_actor_identity_id, 'membership.invite',
			'invitation', p_invitation_id, 'denied', 'permission_missing', p_correlation_id
		);
		RETURN jsonb_build_object('deniedReason', 'permission_missing');
	END IF;

	PERFORM pg_advisory_xact_lock(
		hashtextextended(p_tenant_id::text || E'\n' || p_idempotency_key, 0)
	);
	SELECT invitation.* INTO v_existing FROM iam_app.invitations AS invitation
	WHERE tenant_id = p_tenant_id AND idempotency_key = p_idempotency_key;
	IF FOUND THEN
		SELECT roles, center_ids INTO v_existing_roles, v_existing_center_ids
		FROM iam_app.memberships
		WHERE tenant_id = p_tenant_id AND id = v_existing.membership_id;
		IF v_existing.target_address IS DISTINCT FROM p_target_address
			OR v_existing_roles IS DISTINCT FROM p_roles
			OR v_existing_center_ids IS DISTINCT FROM p_center_ids THEN
			INSERT INTO iam_app.audit_records (
				id, tenant_id, actor_identity_id, action, resource_type, resource_id,
				result, reason, correlation_id
			) VALUES (
				gen_random_uuid(), p_tenant_id, v_actor_identity_id, 'membership.invite',
				'invitation', v_existing.id, 'denied', 'invariant_violation', p_correlation_id
			);
			RETURN jsonb_build_object('deniedReason', 'invariant_violation');
		END IF;
		RETURN jsonb_build_object(
			'invitationId', v_existing.id,
			'membershipId', v_existing.membership_id,
			'status', v_existing.status,
			'deliveryStatus', 'queued',
			'expiresAt', v_existing.expires_at,
			'created', false
		);
	END IF;

	IF cardinality(p_roles) = 0
		OR p_roles IS NULL
		OR p_center_ids IS NULL
		OR NOT (p_roles <@ ARRAY[
			'tenant_owner', 'tenant_admin', 'operations_lead', 'auditor_compliance',
			'center_manager', 'reception_booking_manager'
		]::text[]) THEN
		INSERT INTO iam_app.audit_records (
			id, tenant_id, actor_identity_id, action, resource_type, resource_id,
			result, reason, correlation_id
		) VALUES (
			gen_random_uuid(), p_tenant_id, v_actor_identity_id, 'membership.invite',
			'invitation', p_invitation_id, 'denied', 'invariant_violation', p_correlation_id
		);
		RETURN jsonb_build_object('deniedReason', 'invariant_violation');
	END IF;

	IF EXISTS (
		SELECT 1
		FROM unnest(p_center_ids) AS assigned(center_id)
		LEFT JOIN iam_app.centers AS center
			ON center.tenant_id = p_tenant_id AND center.id = assigned.center_id
		WHERE center.id IS NULL
	) THEN
		INSERT INTO iam_app.audit_records (
			id, tenant_id, actor_identity_id, action, resource_type, resource_id,
			result, reason, correlation_id
		) VALUES (
			gen_random_uuid(), p_tenant_id, v_actor_identity_id, 'membership.invite',
			'invitation', p_invitation_id, 'denied', 'resource_missing_or_inaccessible', p_correlation_id
		);
		RETURN jsonb_build_object('deniedReason', 'resource_missing_or_inaccessible');
	END IF;

	IF p_reissue_invitation_id IS NOT NULL THEN
		SELECT * INTO v_reissue FROM iam_app.invitations
		WHERE tenant_id = p_tenant_id AND id = p_reissue_invitation_id
		FOR UPDATE;
		IF v_reissue.status IS DISTINCT FROM 'pending' THEN
			INSERT INTO iam_app.audit_records (
				id, tenant_id, actor_identity_id, action, resource_type, resource_id,
				result, reason, correlation_id
			) VALUES (
				gen_random_uuid(), p_tenant_id, v_actor_identity_id, 'membership.invite',
				'invitation', p_invitation_id, 'denied', 'resource_missing_or_inaccessible', p_correlation_id
			);
			RETURN jsonb_build_object('deniedReason', 'resource_missing_or_inaccessible');
		END IF;
		UPDATE iam_app.invitations SET status = 'revoked'
		WHERE tenant_id = p_tenant_id AND id = v_reissue.id;
		UPDATE iam_app.memberships SET status = 'disabled'
		WHERE tenant_id = p_tenant_id AND id = v_reissue.membership_id;
		INSERT INTO iam_app.outbox_events (
			id, tenant_id, event_type, payload, correlation_id, idempotency_key
		) VALUES (
			gen_random_uuid(), p_tenant_id, 'iam.invitation.revoked.v1',
			jsonb_build_object('invitationId', v_reissue.id, 'membershipId', v_reissue.membership_id),
			p_correlation_id, 'invitation.reissue.revoked:' || v_reissue.id::text
		);
	END IF;

	INSERT INTO iam_app.memberships (
		id, tenant_id, identity_id, status, roles, center_ids
	) VALUES (
		p_membership_id, p_tenant_id, NULL, 'pending', p_roles, p_center_ids
	);
	INSERT INTO iam_app.invitations (
		id, tenant_id, membership_id, target_address, credential_hash, status, idempotency_key
	) VALUES (
		p_invitation_id, p_tenant_id, p_membership_id, p_target_address,
		p_credential_hash, 'pending', p_idempotency_key
	) RETURNING * INTO v_issued;
	INSERT INTO iam_app.audit_records (
		id, tenant_id, actor_identity_id, action, resource_type, resource_id,
		result, correlation_id
	) VALUES (
		gen_random_uuid(), p_tenant_id, v_actor_identity_id, 'membership.invite',
		'invitation', p_invitation_id, 'success', p_correlation_id
	);
	INSERT INTO iam_app.outbox_events (
		id, tenant_id, event_type, payload, correlation_id, idempotency_key
	) VALUES (
		gen_random_uuid(), p_tenant_id, 'iam.invitation.issued.v1',
		jsonb_build_object('invitationId', p_invitation_id, 'membershipId', p_membership_id),
		p_correlation_id, 'invitation.issued:' || p_invitation_id::text
	);
	RETURN jsonb_build_object(
		'invitationId', v_issued.id,
		'membershipId', v_issued.membership_id,
		'status', v_issued.status,
		'deliveryStatus', 'queued',
		'expiresAt', v_issued.expires_at,
		'created', true
	);
END $$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION iam_app.respond_invitation_command(
	p_issuer text,
	p_subject text,
	p_verified_addresses text[],
	p_tenant_id uuid,
	p_credential_hash text,
	p_decision text,
	p_new_identity_id uuid,
	p_correlation_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = iam_app, pg_temp AS $$
DECLARE
	v_invitation iam_app.invitations%ROWTYPE;
	v_identity_id uuid;
BEGIN
	IF NULLIF(btrim(p_issuer), '') IS NULL
		OR p_issuer IS DISTINCT FROM btrim(p_issuer)
		OR NULLIF(btrim(p_subject), '') IS NULL
		OR p_subject IS DISTINCT FROM btrim(p_subject) THEN
		RETURN jsonb_build_object('deniedReason', 'authentication_missing_or_invalid');
	END IF;
	IF p_verified_addresses IS NULL
		OR cardinality(p_verified_addresses) = 0
		OR EXISTS (
			SELECT 1 FROM unnest(p_verified_addresses) AS verified(address)
			WHERE NULLIF(btrim(verified.address), '') IS NULL
				OR verified.address IS DISTINCT FROM btrim(verified.address)
		) THEN
		RETURN jsonb_build_object('deniedReason', 'credential_invalid_or_expired');
	END IF;

	PERFORM set_config('app.tenant_id', p_tenant_id::text, true);
	SELECT * INTO v_invitation FROM iam_app.invitations
	WHERE tenant_id = p_tenant_id AND credential_hash = p_credential_hash
	FOR UPDATE;
	IF v_invitation.id IS NULL THEN
		RETURN jsonb_build_object('deniedReason', 'credential_invalid_or_expired');
	END IF;
	IF NOT (v_invitation.target_address = ANY(p_verified_addresses)) THEN
		RETURN jsonb_build_object('deniedReason', 'credential_invalid_or_expired');
	END IF;

	PERFORM pg_advisory_xact_lock(hashtextextended(p_issuer || E'\n' || p_subject, 0));
	SELECT identity_id INTO v_identity_id
	FROM iam_app.external_identities
	WHERE issuer = p_issuer AND subject = p_subject;
	IF v_identity_id IS NULL THEN
		INSERT INTO iam_app.identities (id) VALUES (p_new_identity_id);
		INSERT INTO iam_app.external_identities (identity_id, issuer, subject)
		VALUES (p_new_identity_id, p_issuer, p_subject);
		v_identity_id := p_new_identity_id;
	END IF;
	IF v_invitation.status <> 'pending' THEN
		INSERT INTO iam_app.audit_records (
			id, tenant_id, actor_identity_id, action, resource_type, resource_id,
			result, reason, correlation_id
		) VALUES (
			gen_random_uuid(), p_tenant_id, v_identity_id, 'membership.invite',
			'invitation', v_invitation.id, 'denied', 'duplicate_or_replayed', p_correlation_id
		);
		RETURN jsonb_build_object('deniedReason', 'duplicate_or_replayed');
	END IF;
	IF v_invitation.expires_at <= clock_timestamp() THEN
		UPDATE iam_app.invitations SET status = 'expired'
		WHERE tenant_id = p_tenant_id AND id = v_invitation.id;
		UPDATE iam_app.memberships SET status = 'disabled'
		WHERE tenant_id = p_tenant_id AND id = v_invitation.membership_id;
		INSERT INTO iam_app.audit_records (
			id, tenant_id, actor_identity_id, action, resource_type, resource_id,
			result, reason, correlation_id
		) VALUES (
			gen_random_uuid(), p_tenant_id, v_identity_id, 'membership.invite',
			'invitation', v_invitation.id, 'denied', 'credential_invalid_or_expired', p_correlation_id
		);
		INSERT INTO iam_app.outbox_events (
			id, tenant_id, event_type, payload, correlation_id, idempotency_key
		) VALUES (
			gen_random_uuid(), p_tenant_id, 'iam.invitation.expired.v1',
			jsonb_build_object('invitationId', v_invitation.id, 'membershipId', v_invitation.membership_id),
			p_correlation_id, 'invitation.expired:' || v_invitation.id::text
		);
		RETURN jsonb_build_object('deniedReason', 'credential_invalid_or_expired');
	END IF;
	IF p_decision NOT IN ('accepted', 'rejected') THEN
		INSERT INTO iam_app.audit_records (
			id, tenant_id, actor_identity_id, action, resource_type, resource_id,
			result, reason, correlation_id
		) VALUES (
			gen_random_uuid(), p_tenant_id, v_identity_id, 'membership.invite',
			'invitation', v_invitation.id, 'denied', 'invariant_violation', p_correlation_id
		);
		RETURN jsonb_build_object('deniedReason', 'invariant_violation');
	END IF;

	IF p_decision = 'accepted' AND EXISTS (
		SELECT 1 FROM iam_app.memberships
		WHERE tenant_id = p_tenant_id
			AND identity_id = v_identity_id
			AND id <> v_invitation.membership_id
	) THEN
		INSERT INTO iam_app.audit_records (
			id, tenant_id, actor_identity_id, action, resource_type, resource_id,
			result, reason, correlation_id
		) VALUES (
			gen_random_uuid(), p_tenant_id, v_identity_id, 'membership.invite',
			'invitation', v_invitation.id, 'denied', 'invariant_violation', p_correlation_id
		);
		RETURN jsonb_build_object('deniedReason', 'invariant_violation');
	END IF;

	IF p_decision = 'accepted' THEN
		UPDATE iam_app.memberships SET identity_id = v_identity_id, status = 'active'
		WHERE tenant_id = p_tenant_id AND id = v_invitation.membership_id;
	ELSE
		UPDATE iam_app.memberships SET status = 'disabled'
		WHERE tenant_id = p_tenant_id AND id = v_invitation.membership_id;
	END IF;
	UPDATE iam_app.invitations SET status = p_decision
	WHERE tenant_id = p_tenant_id AND id = v_invitation.id;
	INSERT INTO iam_app.audit_records (
		id, tenant_id, actor_identity_id, action, resource_type, resource_id,
		result, correlation_id
	) VALUES (
		gen_random_uuid(), p_tenant_id, v_identity_id,
		CASE WHEN p_decision = 'accepted' THEN 'membership.invite' ELSE 'membership.disable' END,
		'invitation', v_invitation.id, 'success', p_correlation_id
	);
	INSERT INTO iam_app.outbox_events (
		id, tenant_id, event_type, payload, correlation_id, idempotency_key
	) VALUES (
		gen_random_uuid(), p_tenant_id, 'iam.invitation.' || p_decision || '.v1',
		jsonb_build_object('invitationId', v_invitation.id, 'membershipId', v_invitation.membership_id),
		p_correlation_id, 'invitation.' || p_decision || ':' || v_invitation.id::text
	);
	RETURN jsonb_build_object(
		'invitationId', v_invitation.id,
		'membershipId', v_invitation.membership_id,
		'status', p_decision
	);
END $$;