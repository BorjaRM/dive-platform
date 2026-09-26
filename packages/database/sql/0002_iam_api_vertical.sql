-- First IAM/API vertical. Derived implementation for SPEC-DIVE-IAM-001.
CREATE SCHEMA IF NOT EXISTS iam_app;
ALTER SCHEMA iam_app OWNER TO dive_migration;
SET ROLE dive_migration;

CREATE TABLE IF NOT EXISTS iam_app.tenants (id uuid PRIMARY KEY, name text NOT NULL);
CREATE TABLE IF NOT EXISTS iam_app.identities (id uuid PRIMARY KEY);
CREATE TABLE IF NOT EXISTS iam_app.external_identities (
  identity_id uuid NOT NULL REFERENCES iam_app.identities(id),
  issuer text NOT NULL,
  subject text NOT NULL,
  PRIMARY KEY (issuer, subject),
  UNIQUE (identity_id, issuer)
);
CREATE TABLE IF NOT EXISTS iam_app.centers (
  id uuid NOT NULL,
  tenant_id uuid NOT NULL REFERENCES iam_app.tenants(id),
  name text NOT NULL,
  PRIMARY KEY (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS iam_app.memberships (
  id uuid NOT NULL,
  tenant_id uuid NOT NULL REFERENCES iam_app.tenants(id),
  identity_id uuid NOT NULL REFERENCES iam_app.identities(id),
  status text NOT NULL CHECK (status IN ('pending', 'active', 'disabled')),
  roles text[] NOT NULL,
  center_ids uuid[],
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, identity_id)
);

ALTER TABLE iam_app.memberships
  DROP CONSTRAINT IF EXISTS memberships_roles_known;
ALTER TABLE iam_app.memberships
  ADD CONSTRAINT memberships_roles_known CHECK (
    cardinality(roles) > 0
    AND roles <@ ARRAY[
      'tenant_owner',
      'tenant_admin',
      'operations_lead',
      'auditor_compliance',
      'center_manager',
      'reception_booking_manager',
      'external_collaborator'
    ]::text[]
  );

CREATE OR REPLACE FUNCTION iam_app.validate_membership_centers()
RETURNS trigger LANGUAGE plpgsql SET search_path = iam_app, pg_temp AS $$
BEGIN
  IF NEW.center_ids IS NOT NULL AND EXISTS (
    SELECT 1
    FROM unnest(NEW.center_ids) AS assigned(center_id)
    LEFT JOIN iam_app.centers AS center
      ON center.tenant_id = NEW.tenant_id AND center.id = assigned.center_id
    WHERE center.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Invalid membership center scope' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION iam_app.validate_membership_centers() FROM PUBLIC;
DROP TRIGGER IF EXISTS memberships_centers_same_tenant ON iam_app.memberships;
CREATE TRIGGER memberships_centers_same_tenant
BEFORE INSERT OR UPDATE OF tenant_id, center_ids ON iam_app.memberships
FOR EACH ROW EXECUTE FUNCTION iam_app.validate_membership_centers();

CREATE TABLE IF NOT EXISTS iam_app.audit_records (
  id uuid NOT NULL,
  tenant_id uuid NOT NULL REFERENCES iam_app.tenants(id),
  actor_identity_id uuid NOT NULL,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id uuid NOT NULL,
  result text NOT NULL,
  reason text,
  correlation_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);
ALTER TABLE iam_app.audit_records ADD COLUMN IF NOT EXISTS reason text;
CREATE TABLE IF NOT EXISTS iam_app.outbox_events (
  id uuid NOT NULL,
  tenant_id uuid NOT NULL REFERENCES iam_app.tenants(id),
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  correlation_id uuid NOT NULL,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, idempotency_key)
);

ALTER TABLE iam_app.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE iam_app.tenants FORCE ROW LEVEL SECURITY;
ALTER TABLE iam_app.centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE iam_app.centers FORCE ROW LEVEL SECURITY;
ALTER TABLE iam_app.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE iam_app.memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE iam_app.audit_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE iam_app.audit_records FORCE ROW LEVEL SECURITY;
ALTER TABLE iam_app.outbox_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE iam_app.outbox_events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenants_isolation ON iam_app.tenants;
CREATE POLICY tenants_isolation ON iam_app.tenants USING (id = current_setting('app.tenant_id')::uuid) WITH CHECK (id = current_setting('app.tenant_id')::uuid);
DROP POLICY IF EXISTS centers_isolation ON iam_app.centers;
CREATE POLICY centers_isolation ON iam_app.centers USING (tenant_id = current_setting('app.tenant_id')::uuid) WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);
DROP POLICY IF EXISTS memberships_isolation ON iam_app.memberships;
CREATE POLICY memberships_isolation ON iam_app.memberships USING (tenant_id = current_setting('app.tenant_id')::uuid) WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);
DROP POLICY IF EXISTS audit_isolation ON iam_app.audit_records;
CREATE POLICY audit_isolation ON iam_app.audit_records USING (tenant_id = current_setting('app.tenant_id')::uuid) WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);
DROP POLICY IF EXISTS outbox_isolation ON iam_app.outbox_events;
CREATE POLICY outbox_isolation ON iam_app.outbox_events USING (tenant_id = current_setting('app.tenant_id')::uuid) WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);

CREATE OR REPLACE FUNCTION iam_app.resolve_access(p_issuer text, p_subject text, p_tenant uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = iam_app, pg_temp AS $$
DECLARE result jsonb;
BEGIN
  PERFORM set_config('app.tenant_id', p_tenant::text, true);
  SELECT jsonb_build_object(
    'identityId', i.id,
    'membershipId', m.id,
    'tenantId', m.tenant_id,
    'roles', m.roles,
    'centerIds', m.center_ids
  ) INTO result
  FROM iam_app.external_identities e
  JOIN iam_app.identities i ON i.id = e.identity_id
  JOIN iam_app.memberships m ON m.identity_id = i.id AND m.tenant_id = p_tenant
  WHERE e.issuer = p_issuer AND e.subject = p_subject AND m.status = 'active';
  RETURN result;
END $$;

REVOKE ALL ON FUNCTION iam_app.resolve_access(text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION iam_app.resolve_access(text, text, uuid) TO dive_app;
GRANT USAGE ON SCHEMA iam_app TO dive_app;
REVOKE ALL ON iam_app.tenants, iam_app.centers, iam_app.memberships, iam_app.audit_records, iam_app.outbox_events FROM dive_app;
GRANT SELECT ON iam_app.tenants, iam_app.centers, iam_app.memberships TO dive_app;
GRANT UPDATE (status) ON iam_app.memberships TO dive_app;
GRANT INSERT ON iam_app.audit_records, iam_app.outbox_events TO dive_app;
REVOKE ALL ON iam_app.identities, iam_app.external_identities FROM dive_app;
RESET ROLE;
