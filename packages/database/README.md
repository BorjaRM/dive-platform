# @dive-center/database

Walking-skeleton persistence for **MT-SPIKE-001**.

## Provenance

- **Documented:** PostgreSQL 18.x, shared schema, `tenant_id`, center as operational scope, forced RLS, app role without `BYPASSRLS`/DDL, transaction-local tenant context, outbox + audit in the same unit of work (`ADR-DIVE-002`, adoption profile, `MT-REQ-001`–`010`).
- **Proposed:** schema `mt_spike` and table names. This is not the product booking catalog.
- **Proposed:** `set_config('app.tenant_id', …, true)` as the transaction-local mechanism.

Do not treat this package as the accepted product schema.

## Authorization boundary

- `identities` is global, as required by `DIVE-IAM-REQ-001`; `dive_app` has no direct table access.
- Every tenant-owned table, including `memberships`, has enabled and forced RLS.
- Membership lookup is limited to `membership_permissions`, which establishes transaction-local tenant context before its query. The application role cannot query `memberships` directly.
- `withTenant` is an internal persistence primitive. Interactive callers use `withAuthorizedTenant`, which revalidates identity–tenant membership before opening the unit of work.

## Outbox boundary

`processOutboxOnce` accepts an `applyDatabaseEffect` callback whose only supplied capability is the transaction-bound Drizzle handle. The effect and consumer receipt therefore commit or roll back together.

External delivery is intentionally not implemented by this prototype. Email, webhook, file, or provider calls must not be added to `applyDatabaseEffect`: they cannot be committed atomically with PostgreSQL. The first real worker integration must define and test an at-least-once contract, destination idempotency key, retry/backoff, exhaustion/dead-letter behavior, and non-disclosing logs before performing external effects.

**Provenance:** the atomic database boundary is `Derived` from `MT-REQ-007` and `MT-REQ-008`. The future external-delivery contract remains an open implementation gate; this package does not choose its retry limits, backoff, or dead-letter transport.
