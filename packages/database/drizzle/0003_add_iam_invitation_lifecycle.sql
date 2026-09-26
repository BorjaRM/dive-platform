-- The migration owner is intentionally NOBYPASSRLS. Temporarily relaxing FORCE
-- is transactional and allows PostgreSQL to validate new constraints globally.
ALTER TABLE "iam_app"."tenants" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "iam_app"."centers" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "iam_app"."memberships" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "iam_app"."audit_records" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "iam_app"."outbox_events" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE TABLE "iam_app"."invitations" (
	"id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"target_address" text NOT NULL,
	"credential_hash" text NOT NULL,
	"status" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone DEFAULT now() + interval '7 days' NOT NULL,
	CONSTRAINT "invitations_tenant_id_id_pk" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "invitations_credential_hash_unique" UNIQUE("credential_hash"),
	CONSTRAINT "invitations_tenant_id_idempotency_key_unique" UNIQUE("tenant_id","idempotency_key"),
	CONSTRAINT "invitations_status_known" CHECK (status IN ('pending', 'accepted', 'rejected', 'revoked', 'expired'))
);
--> statement-breakpoint
ALTER TABLE "iam_app"."memberships" ALTER COLUMN "identity_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "iam_app"."audit_records" ADD COLUMN "purpose" text;--> statement-breakpoint
ALTER TABLE "iam_app"."audit_records" ADD COLUMN "source_metadata" jsonb;--> statement-breakpoint
ALTER TABLE "iam_app"."invitations" ADD CONSTRAINT "invitations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "iam_app"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iam_app"."invitations" ADD CONSTRAINT "invitations_tenant_id_membership_id_memberships_tenant_id_id_fk" FOREIGN KEY ("tenant_id","membership_id") REFERENCES "iam_app"."memberships"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
UPDATE "iam_app"."audit_records"
SET "reason" = 'resource_missing_or_inaccessible'
WHERE "reason" = 'target_inactive_or_missing';--> statement-breakpoint
ALTER TABLE "iam_app"."audit_records" ADD CONSTRAINT "audit_action_known" CHECK (action IN (
        'membership.invite',
        'membership.disable',
        'booking.create',
        'booking.read',
        'booking.update',
        'booking.confirm',
        'booking.cancel',
        'customer_contact.read',
        'support.tenant.read',
        'identity.webhook.apply'
      ));--> statement-breakpoint
ALTER TABLE "iam_app"."audit_records" ADD CONSTRAINT "audit_result_reason_valid" CHECK ((result = 'success' AND reason IS NULL) OR
        (result = 'denied' AND reason IN (
          'authentication_missing_or_invalid',
          'membership_missing_or_inactive',
          'permission_missing',
          'scope_mismatch',
          'resource_missing_or_inaccessible',
          'resource_state_invalid',
          'credential_invalid_or_expired',
          'duplicate_or_replayed',
          'assurance_insufficient',
          'support_grant_invalid',
          'last_owner',
          'invariant_violation'
        )));
--> statement-breakpoint
-- Reviewed security SQL: invitation invariants, RLS, and command-only membership mutation.
ALTER TABLE "iam_app"."invitations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "iam_app"."invitations" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY invitations_isolation ON "iam_app"."invitations"
  USING (tenant_id = current_setting('app.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION iam_app.enforce_invitation_transition()
RETURNS trigger LANGUAGE plpgsql SET search_path = iam_app, pg_temp AS $$
BEGIN
  IF OLD.tenant_id IS DISTINCT FROM NEW.tenant_id
    OR OLD.membership_id IS DISTINCT FROM NEW.membership_id
    OR OLD.target_address IS DISTINCT FROM NEW.target_address
    OR OLD.credential_hash IS DISTINCT FROM NEW.credential_hash
    OR OLD.idempotency_key IS DISTINCT FROM NEW.idempotency_key
    OR OLD.issued_at IS DISTINCT FROM NEW.issued_at
    OR OLD.expires_at IS DISTINCT FROM NEW.expires_at THEN
    RAISE EXCEPTION 'Invitation proposal is immutable' USING ERRCODE = '23514';
  END IF;
  IF OLD.status IS DISTINCT FROM NEW.status
    AND (OLD.status <> 'pending' OR NEW.status NOT IN ('accepted', 'rejected', 'revoked', 'expired')) THEN
    RAISE EXCEPTION 'Invalid invitation transition' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION iam_app.enforce_invitation_transition() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER invitations_transition_guard
BEFORE UPDATE ON iam_app.invitations
FOR EACH ROW EXECUTE FUNCTION iam_app.enforce_invitation_transition();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION iam_app.enforce_membership_lifecycle()
RETURNS trigger LANGUAGE plpgsql SET search_path = iam_app, pg_temp AS $$
BEGIN
  IF NEW.status IN ('pending', 'active')
    AND NEW.roles @> ARRAY['external_collaborator']::text[] THEN
    RAISE EXCEPTION 'External collaborator assignments are disabled' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'INSERT' AND NEW.status = 'pending' AND NEW.identity_id IS NOT NULL THEN
    RAISE EXCEPTION 'Pending membership must be unbound' USING ERRCODE = '23514';
  END IF;
  IF NEW.status = 'active' AND NEW.identity_id IS NULL THEN
    RAISE EXCEPTION 'Active membership must be bound' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'pending' AND (
    OLD.tenant_id IS DISTINCT FROM NEW.tenant_id
    OR OLD.roles IS DISTINCT FROM NEW.roles
    OR OLD.center_ids IS DISTINCT FROM NEW.center_ids
  ) THEN
    RAISE EXCEPTION 'Pending membership proposal is immutable' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'pending' AND NEW.status = 'pending'
    AND OLD.identity_id IS DISTINCT FROM NEW.identity_id THEN
    RAISE EXCEPTION 'Pending membership cannot be bound before acceptance' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION iam_app.enforce_membership_lifecycle() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER memberships_lifecycle_guard
BEFORE INSERT OR UPDATE OF tenant_id, identity_id, status, roles, center_ids ON iam_app.memberships
FOR EACH ROW EXECUTE FUNCTION iam_app.enforce_membership_lifecycle();
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM iam_app.memberships
    WHERE status = 'active' AND roles @> ARRAY['external_collaborator']::text[]
  ) THEN
    RAISE EXCEPTION 'Active external collaborator membership requires remediation';
  END IF;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION iam_app.disable_membership_command(
  p_issuer text,
  p_subject text,
  p_tenant_id uuid,
  p_membership_id uuid,
  p_correlation_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = iam_app, pg_temp AS $$
DECLARE
  v_actor_identity_id uuid;
  v_actor_roles text[];
  v_target_roles text[];
  v_target_status text;
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
      gen_random_uuid(), p_tenant_id, v_actor_identity_id, 'membership.disable',
      'membership', p_membership_id, 'denied', 'permission_missing', p_correlation_id
    );
    RETURN jsonb_build_object('deniedReason', 'permission_missing');
  END IF;

  SELECT roles, status INTO v_target_roles, v_target_status
  FROM iam_app.memberships
  WHERE tenant_id = p_tenant_id AND id = p_membership_id
  FOR UPDATE;
  IF v_target_status IS DISTINCT FROM 'active' THEN
    INSERT INTO iam_app.audit_records (
      id, tenant_id, actor_identity_id, action, resource_type, resource_id,
      result, reason, correlation_id
    ) VALUES (
      gen_random_uuid(), p_tenant_id, v_actor_identity_id, 'membership.disable',
      'membership', p_membership_id, 'denied', 'resource_missing_or_inaccessible', p_correlation_id
    );
    RETURN jsonb_build_object('deniedReason', 'resource_missing_or_inaccessible');
  END IF;

  IF v_target_roles @> ARRAY['tenant_owner']::text[] THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text, 0));
    IF (
      SELECT count(*) FROM iam_app.memberships
      WHERE tenant_id = p_tenant_id
        AND status = 'active'
        AND roles @> ARRAY['tenant_owner']::text[]
    ) <= 1 THEN
      INSERT INTO iam_app.audit_records (
        id, tenant_id, actor_identity_id, action, resource_type, resource_id,
        result, reason, correlation_id
      ) VALUES (
        gen_random_uuid(), p_tenant_id, v_actor_identity_id, 'membership.disable',
        'membership', p_membership_id, 'denied', 'last_owner', p_correlation_id
      );
      RETURN jsonb_build_object('deniedReason', 'last_owner');
    END IF;
  END IF;

  UPDATE iam_app.memberships SET status = 'disabled'
  WHERE tenant_id = p_tenant_id AND id = p_membership_id;
  INSERT INTO iam_app.audit_records (
    id, tenant_id, actor_identity_id, action, resource_type, resource_id,
    result, correlation_id
  ) VALUES (
    gen_random_uuid(), p_tenant_id, v_actor_identity_id, 'membership.disable',
    'membership', p_membership_id, 'success', p_correlation_id
  );
  INSERT INTO iam_app.outbox_events (
    id, tenant_id, event_type, payload, correlation_id, idempotency_key
  ) VALUES (
    gen_random_uuid(), p_tenant_id, 'iam.membership.disabled.v1',
    jsonb_build_object('membershipId', p_membership_id), p_correlation_id,
    'membership.disable:' || p_membership_id::text
  );
  RETURN jsonb_build_object('status', 'disabled');
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION iam_app.disable_membership_command(text, text, uuid, uuid, uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION iam_app.disable_membership_command(text, text, uuid, uuid, uuid) TO dive_app;
--> statement-breakpoint
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
    'expiresAt', v_issued.expires_at,
    'created', true
  );
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION iam_app.issue_invitation_command(text, text, uuid, uuid, uuid, text, text[], uuid[], text, text, uuid, uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION iam_app.issue_invitation_command(text, text, uuid, uuid, uuid, text, text[], uuid[], text, text, uuid, uuid) TO dive_app;
--> statement-breakpoint
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
  PERFORM set_config('app.tenant_id', p_tenant_id::text, true);
  SELECT * INTO v_invitation FROM iam_app.invitations
  WHERE tenant_id = p_tenant_id AND credential_hash = p_credential_hash
  FOR UPDATE;
  IF v_invitation.id IS NULL THEN
    RETURN jsonb_build_object('deniedReason', 'credential_invalid_or_expired');
  END IF;
  IF p_verified_addresses IS NULL
    OR NOT (v_invitation.target_address = ANY(p_verified_addresses)) THEN
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
--> statement-breakpoint
REVOKE ALL ON FUNCTION iam_app.respond_invitation_command(text, text, text[], uuid, text, text, uuid, uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION iam_app.respond_invitation_command(text, text, text[], uuid, text, text, uuid, uuid) TO dive_app;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION iam_app.revoke_invitation_command(
  p_issuer text,
  p_subject text,
  p_tenant_id uuid,
  p_invitation_id uuid,
  p_correlation_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = iam_app, pg_temp AS $$
DECLARE
  v_actor_identity_id uuid;
  v_actor_roles text[];
  v_invitation iam_app.invitations%ROWTYPE;
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
      gen_random_uuid(), p_tenant_id, v_actor_identity_id, 'membership.disable',
      'invitation', p_invitation_id, 'denied', 'permission_missing', p_correlation_id
    );
    RETURN jsonb_build_object('deniedReason', 'permission_missing');
  END IF;

  SELECT * INTO v_invitation FROM iam_app.invitations
  WHERE tenant_id = p_tenant_id AND id = p_invitation_id
  FOR UPDATE;
  IF v_invitation.status IS DISTINCT FROM 'pending' THEN
    INSERT INTO iam_app.audit_records (
      id, tenant_id, actor_identity_id, action, resource_type, resource_id,
      result, reason, correlation_id
    ) VALUES (
      gen_random_uuid(), p_tenant_id, v_actor_identity_id, 'membership.disable',
      'invitation', p_invitation_id, 'denied', 'duplicate_or_replayed', p_correlation_id
    );
    RETURN jsonb_build_object('deniedReason', 'duplicate_or_replayed');
  END IF;
  UPDATE iam_app.invitations SET status = 'revoked'
  WHERE tenant_id = p_tenant_id AND id = p_invitation_id;
  UPDATE iam_app.memberships SET status = 'disabled'
  WHERE tenant_id = p_tenant_id AND id = v_invitation.membership_id;
  INSERT INTO iam_app.audit_records (
    id, tenant_id, actor_identity_id, action, resource_type, resource_id,
    result, correlation_id
  ) VALUES (
    gen_random_uuid(), p_tenant_id, v_actor_identity_id, 'membership.disable',
    'invitation', p_invitation_id, 'success', p_correlation_id
  );
  INSERT INTO iam_app.outbox_events (
    id, tenant_id, event_type, payload, correlation_id, idempotency_key
  ) VALUES (
    gen_random_uuid(), p_tenant_id, 'iam.invitation.revoked.v1',
    jsonb_build_object('invitationId', p_invitation_id, 'membershipId', v_invitation.membership_id),
    p_correlation_id, 'invitation.revoked:' || p_invitation_id::text
  );
  RETURN jsonb_build_object(
    'invitationId', p_invitation_id,
    'membershipId', v_invitation.membership_id,
    'status', 'revoked'
  );
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION iam_app.revoke_invitation_command(text, text, uuid, uuid, uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION iam_app.revoke_invitation_command(text, text, uuid, uuid, uuid) TO dive_app;
--> statement-breakpoint
REVOKE ALL ON iam_app.memberships, iam_app.invitations, iam_app.audit_records, iam_app.outbox_events FROM dive_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION iam_app.resolve_access(text, text, uuid) TO dive_app;
--> statement-breakpoint
ALTER TABLE "iam_app"."tenants" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "iam_app"."centers" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "iam_app"."memberships" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "iam_app"."audit_records" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "iam_app"."outbox_events" FORCE ROW LEVEL SECURITY;