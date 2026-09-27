# @dive-center/database

Persistence for the walking skeleton.

## Product vs harness

| Path | Role |
|---|---|
| `iam_app`, `src/iam-schema.ts`, `src/product-schema.ts` + `drizzle/` | Product schema. Generated with Drizzle Kit, reviewed SQL, applied by `dive_migration`. |
| `mt_spike`, `src/mt-spike-schema.ts`, `src/harness-schema.ts` + `sql/0001_mt_spike_harness.sql` | MT-SPIKE-001 **harness** only. It is test infrastructure, not a product migration. |
| Runtime `APP_DATABASE_URL` | `dive_app`: DML only, no DDL, no `BYPASSRLS`. |

`iam_app` is product data. The public `@dive-center/database` entry point exports only
the product schema and product runtime operations, including the complete IAM table
aggregator (`iamIdentityWebhookInbox` and `iamIdentityTenants`). `mt_spike` is the
MT-SPIKE-001 harness: it is not exported by the product surface and is not used by
API or worker runtime code. Spike tests may import `harness-schema.ts`,
`harness-unit-of-work.ts`, and the other harness helpers from their dedicated
internal source paths.

## Current `dive_app` consumers

The API runtime reads `APP_DATABASE_URL`, verifies the effective PostgreSQL role,
and creates the shared `dive_app` pool in `apps/api/src/common/database/database.module.ts`.
Startup fails closed if the connection is the migration role, a superuser,
`BYPASSRLS`, an owner, or has database/schema DDL privileges. That pool is injected into both `IamService` for
dashboard IAM operations and `IdentityWebhookController` for the verified Clerk
webhook command. The integration harness uses the equivalent `dive_app` login from
`SPIKE_APP_DATABASE_URL`; `dive_migration` is reserved for migrations and role
bootstrap. No separate webhook database role exists yet.

The shared role is intentionally restricted: it has no `BYPASSRLS`, no DDL, no
direct access to global identity bindings, and reaches sensitive mutations through
reviewed command functions. A separate webhook login is a future hardening option,
not the current runtime contract.

## Commands

```bash
pnpm db:bootstrap   # admin: create dive_migration / dive_app
pnpm db:migrate     # dive_migration: apply drizzle/
pnpm db:generate    # Drizzle Kit schema diff → new SQL under drizzle/
```

Do not run `db:generate` to rewrite applied migrations. Append a new file instead.

The API must not apply migrations or bootstrap roles at startup.

## Phase 1 migration deployment

This pre-pilot, synthetic-data migration is maintenance-only because it replaces direct runtime DML with command functions.

1. Stop the API and worker and prevent new `dive_app` sessions.
2. Apply all pending migrations as `dive_migration` before deploying application code that calls the new commands.
3. Verify the command functions are owned by `dive_migration`, are `SECURITY DEFINER` with the fixed `search_path`, are executable by `dive_app` but not `PUBLIC`, and that `dive_app` has no direct membership, invitation, audit, or outbox mutation grants.
4. Run the focused migration, invitation, and runtime-role integration probes before restoring traffic.
5. Deploy the matching API artifact, then restore traffic.

If a migration fails, keep traffic stopped. PostgreSQL rolls the failed migration transaction back; correct it with a new append-only migration and rerun the probes. If a migration committed but the application artifact is incompatible, roll forward the application or add a corrective migration. Do not recover by restoring direct table DML, using the migration role at runtime, disabling RLS, or granting `BYPASSRLS`.

## Phase 2 identity webhook migrations

Migrations `0005_add_identity_webhook_inbox.sql` and `0006_harden_identity_webhook_tenant_resolution.sql` are an ordered pair. Apply both before deploying the Clerk webhook route. The first adds the inbox and narrow runtime command. The second adds historical identity-to-tenant bindings, restores forced RLS after migration-time validation, and resolves associated tenants without relying on current membership visibility.

The runtime role can execute `apply_identity_webhook_command` but cannot read or mutate the inbox, identity bindings, external identities, audit, outbox, or memberships directly. A resolved `user.deleted` is recorded once and emits one audited `iam.identity.provider_deletion_recorded.v1` signal per associated tenant. The command never mutates external identities or memberships, never grants authorization, and does not have a last-owner-specific outcome; last-owner protection remains enforced by the membership mutation command required by `DIVE-IAM-REQ-018`.

These migrations are additive for pre-pilot synthetic data. Rollback is operational: stop API/worker traffic, restore the pre-migration database backup if the pair has not received useful events, or roll forward with a corrective migration if it has. Do not drop inbox/history rows or invent a retention TTL; retention remains an approved-policy gap.

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
