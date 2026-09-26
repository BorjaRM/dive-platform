-- MT-SPIKE-001 prototype schema. Proposed table names; not the product booking schema.
-- Documented: tenant_id, center as operational scope, forced RLS, app role without BYPASSRLS/DDL.

CREATE SCHEMA IF NOT EXISTS mt_spike;
ALTER SCHEMA mt_spike OWNER TO dive_migration;

SET ROLE dive_migration;

CREATE TABLE IF NOT EXISTS mt_spike.tenants (
  id uuid PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS mt_spike.centers (
  id uuid NOT NULL,
  tenant_id uuid NOT NULL REFERENCES mt_spike.tenants (id),
  name text NOT NULL,
  PRIMARY KEY (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS mt_spike.notes (
  id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  center_id uuid NOT NULL,
  body text NOT NULL,
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, center_id) REFERENCES mt_spike.centers (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS mt_spike.outbox_events (
  id uuid NOT NULL,
  tenant_id uuid NOT NULL REFERENCES mt_spike.tenants (id),
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  correlation_id text NOT NULL,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS mt_spike.audit_records (
  id uuid NOT NULL,
  tenant_id uuid NOT NULL REFERENCES mt_spike.tenants (id),
  actor text NOT NULL,
  action text NOT NULL,
  resource text NOT NULL,
  result text NOT NULL,
  correlation_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS mt_spike.consumer_receipts (
  tenant_id uuid NOT NULL,
  event_id uuid NOT NULL,
  consumer text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, event_id, consumer),
  FOREIGN KEY (tenant_id, event_id) REFERENCES mt_spike.outbox_events (tenant_id, id)
);

ALTER TABLE mt_spike.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE mt_spike.tenants FORCE ROW LEVEL SECURITY;
ALTER TABLE mt_spike.centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE mt_spike.centers FORCE ROW LEVEL SECURITY;
ALTER TABLE mt_spike.notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE mt_spike.notes FORCE ROW LEVEL SECURITY;
ALTER TABLE mt_spike.outbox_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE mt_spike.outbox_events FORCE ROW LEVEL SECURITY;
ALTER TABLE mt_spike.audit_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE mt_spike.audit_records FORCE ROW LEVEL SECURITY;
ALTER TABLE mt_spike.consumer_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE mt_spike.consumer_receipts FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenants_isolation ON mt_spike.tenants;
CREATE POLICY tenants_isolation ON mt_spike.tenants
  USING (id = current_setting('app.tenant_id')::uuid)
  WITH CHECK (id = current_setting('app.tenant_id')::uuid);

DROP POLICY IF EXISTS centers_isolation ON mt_spike.centers;
CREATE POLICY centers_isolation ON mt_spike.centers
  USING (tenant_id = current_setting('app.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);

DROP POLICY IF EXISTS notes_isolation ON mt_spike.notes;
CREATE POLICY notes_isolation ON mt_spike.notes
  USING (tenant_id = current_setting('app.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);

DROP POLICY IF EXISTS outbox_isolation ON mt_spike.outbox_events;
CREATE POLICY outbox_isolation ON mt_spike.outbox_events
  USING (tenant_id = current_setting('app.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);

DROP POLICY IF EXISTS audit_isolation ON mt_spike.audit_records;
CREATE POLICY audit_isolation ON mt_spike.audit_records
  USING (tenant_id = current_setting('app.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);

DROP POLICY IF EXISTS receipts_isolation ON mt_spike.consumer_receipts;
CREATE POLICY receipts_isolation ON mt_spike.consumer_receipts
  USING (tenant_id = current_setting('app.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);

GRANT USAGE ON SCHEMA mt_spike TO dive_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA mt_spike TO dive_app;

RESET ROLE;
