# @dive-center/database

Persistence for the walking skeleton.

## Product vs harness

| Path | Role |
|---|---|
| `src/iam-schema.ts` + `drizzle/` | Product schema. Generated with Drizzle Kit, reviewed SQL, applied by `dive_migration`. |
| `sql/0001_mt_spike_harness.sql` | MT-SPIKE-001 **test** infrastructure only. Not a product migration. |
| Runtime `APP_DATABASE_URL` | `dive_app`: DML only, no DDL, no `BYPASSRLS`. |

## Commands

```bash
pnpm db:bootstrap   # admin: create dive_migration / dive_app
pnpm db:migrate     # dive_migration: apply drizzle/
pnpm db:generate    # Drizzle Kit schema diff → new SQL under drizzle/
```

Do not run `db:generate` to rewrite applied migrations. Append a new file instead.

The API must not apply migrations or bootstrap roles at startup.

## Provenance

- **Documented:** PostgreSQL 18.x, shared schema, `tenant_id`, center as operational scope, forced RLS, app role without `BYPASSRLS`/DDL, transaction-local tenant context, outbox + audit in the same unit of work (`ADR-DIVE-002`, adoption profile, `MT-REQ-001`–`010`).
- **Approved:** Drizzle Kit as the migration generator (Borja, 2026-09-26).
- **Proposed:** schema names `iam_app` / `mt_spike` and table names. `mt_spike` is not the product booking catalog.
- **Proposed:** `set_config('app.tenant_id', …, true)` as the transaction-local mechanism.

## Authorization boundary

- `identities` is global, as required by `DIVE-IAM-REQ-001`; `dive_app` has no direct table access.
- Every tenant-owned table, including `memberships`, has enabled and forced RLS.
- Membership lookup is limited to `resolve_access` / `membership_permissions`, which establish transaction-local tenant context before querying. The application role cannot query identity tables directly.
- `withTenant` is an internal persistence primitive. Interactive callers use `withAuthorizedTenant` or `withIamAuthorizedTenant`.

## Outbox boundary

`processOutboxOnce` accepts an `applyDatabaseEffect` callback whose only supplied capability is the transaction-bound Drizzle handle. The effect and consumer receipt therefore commit or roll back together.

External delivery is intentionally not implemented by this prototype. Email, webhook, file, or provider calls must not be added to `applyDatabaseEffect`: they cannot be committed atomically with PostgreSQL. The first real worker integration must define and test an at-least-once contract, destination idempotency key, retry/backoff, exhaustion/dead-letter behavior, and non-disclosing logs before performing external effects.

**Provenance:** the atomic database boundary is `Derived` from `MT-REQ-007` and `MT-REQ-008`. The future external-delivery contract remains an open implementation gate; this package does not choose its retry limits, backoff, or dead-letter transport.
