# @dive-center/database

Persistence for the walking skeleton.

## Product vs harness

| Path | Role |
|---|---|
| `iam_app`, `src/iam-schema.ts`, `src/product-schema.ts` + `drizzle/` | Product schema. Generated with Drizzle Kit, reviewed SQL, applied by `dive_migration`. |
| `mt_spike`, `src/mt-spike-schema.ts`, `src/harness-schema.ts` + `sql/0001_mt_spike_harness.sql` | MT-SPIKE-001 **harness** only. It is test infrastructure, not a product migration. |
| Runtime `APP_DATABASE_URL` | `dive_app`: DML only, no DDL, no `BYPASSRLS`. |

`iam_app` and `booking_app` contain product data. The public
`@dive-center/database` entry point exports the product schema, runtime operations,
and the privileged bootstrap and migration functions used by operational tooling
and tests. It includes the complete IAM table aggregator
(`iamIdentityWebhookInbox` and `iamIdentityTenants`). `mt_spike` is the
MT-SPIKE-001 harness: it is not exported by the product surface and is not used by
API or worker runtime code. Spike tests may import `harness-schema.ts`,
`harness-unit-of-work.ts`, and the other harness helpers from their dedicated
internal source paths.

## Current `dive_app` consumers

The API runtime reads `APP_DATABASE_URL`, verifies the effective PostgreSQL role,
and creates the shared `dive_app` pool in `apps/api/src/common/database/database.module.ts`.
Startup fails closed if the connection is the migration role, a superuser,
`BYPASSRLS`, an owner, or has database/schema DDL privileges. The API uses that
pool for dashboard IAM, the verified Clerk webhook command, center catalog
operations, and public booking. The integration harness uses the equivalent
`dive_app` login from `SPIKE_APP_DATABASE_URL`; `dive_migration` is reserved for
migrations and role bootstrap. No separate webhook database role exists yet.

The shared role is intentionally restricted: it has no `BYPASSRLS`, no DDL, no
direct access to global identity bindings, and reaches sensitive mutations through
reviewed command functions. A separate webhook login is a future hardening option,
not the current runtime contract.

Production credential separation, break-glass access, network controls, and
audit gates are tracked in `docs/operations/production-database-access.md`.

## Commands

```bash
pnpm db:bootstrap   # admin: create dive_migration / dive_app
pnpm db:migrate     # dive_migration: apply drizzle/
pnpm db:generate    # Drizzle Kit schema diff → new SQL under drizzle/
```

`drizzle/0000_baseline.sql` is the immutable pre-release baseline. It combines
the Drizzle-generated product schema with reviewed PostgreSQL-specific RLS,
grants, triggers, and `SECURITY DEFINER` functions. The previous disposable
history has no supported upgrade path; recreate any pre-baseline local database.

For subsequent structural changes, update `src/product-schema.ts`, run
`pnpm db:generate`, and review the generated SQL and metadata. Add PostgreSQL
controls that Drizzle cannot express to that new migration. Do not rewrite an
applied migration. The API must not apply migrations or bootstrap roles at
startup.

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
- Invitation acceptance is exposed to TypeScript callers only through `respondToIamInvitation`, which requires a runtime assertion minted by `authenticateIdentity` from `IdentityProviderPort` output. Ordinary authentication may have no verified addresses, but acceptance fails unless the assertion has at least one provider-verified address matching the invitation target. The Phase 1 API has no HTTP invitation-acceptance route.
- PostgreSQL rejects empty or non-normalized issuer/subject values and normalized-address violations. PostgreSQL cannot attest provider provenance for otherwise well-formed strings; that trust decision belongs to the identity/application boundary, and direct request values must never be forwarded as an assertion.

## Outbox boundary

`processOutboxOnce` accepts an `applyDatabaseEffect` callback whose only supplied capability is the transaction-bound Drizzle handle. The effect and consumer receipt therefore commit or roll back together.

External delivery is intentionally not implemented by this prototype. Email, webhook, file, or provider calls must not be added to `applyDatabaseEffect`: they cannot be committed atomically with PostgreSQL. The first real worker integration must define and test an at-least-once contract, destination idempotency key, retry/backoff, exhaustion/dead-letter behavior, and non-disclosing logs before performing external effects.

Invitation issue results report `deliveryStatus: "queued"` only after the issuance outbox row commits. The bearer credential is returned only from the initial trusted application call, is never stored or logged, and is omitted from idempotent retries. A lost or unknown delivery outcome requires deliberate reissue; retrying the original idempotency key cannot recover the bearer.

**Provenance:** the atomic database boundary is `Derived` from `MT-REQ-007` and `MT-REQ-008`. The future external-delivery contract remains an open implementation gate; this package does not choose its retry limits, backoff, or dead-letter transport.
