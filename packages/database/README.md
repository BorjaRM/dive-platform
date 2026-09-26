# @dive-center/database

Walking-skeleton persistence for **MT-SPIKE-001**.

## Provenance

- **Documented:** PostgreSQL 18.x, shared schema, `tenant_id`, center as operational scope, forced RLS, app role without `BYPASSRLS`/DDL, transaction-local tenant context, outbox + audit in the same unit of work (`ADR-DIVE-002`, adoption profile, `MT-REQ-001`–`010`).
- **Proposed:** schema `mt_spike` and table names. This is not the product booking catalog.
- **Proposed:** `set_config('app.tenant_id', …, true)` as the transaction-local mechanism.

Do not treat this package as the accepted product schema.
