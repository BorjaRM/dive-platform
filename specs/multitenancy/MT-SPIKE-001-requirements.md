# MT-SPIKE-001 — Requirements

- **Status:** Draft
- **Version:** 0.2

These ten IDs are unchanged. The bullets under each ID are verifiable criteria unpacked from documented sources. They are not new product requirements.

## Requirement provenance

| Requirement IDs | Provenance | Exact source | Decision status |
|---|---|---|---|
| `MT-REQ-001` | `Documented` | `specs/foundation/multitenancy-architecture.md` §4, §7; `specs/multitenancy/MT-SPIKE-001-specification.md` required scenario 1 | Spike Draft; not promoted |
| `MT-REQ-002` | `Documented` | baseline §3 last paragraph, §4, §5; specification required scenario 1; `specs/iam/SPEC-DIVE-IAM-001.md` `DIVE-IAM-REQ-006` | Spike Draft; not promoted |
| `MT-REQ-003` | `Documented` | baseline §4, §7; specification required scenario 2; adoption profile “tenant-aware relationships” | Spike Draft; not promoted |
| `MT-REQ-004` | `Documented` | baseline §7, §14 (migrations that do not weaken controls); specification required scenario 3 | Spike Draft; not promoted |
| `MT-REQ-005` | `Documented` | baseline §4, §8; specification required scenario 4; adoption profile “pool reuse” | Spike Draft; not promoted |
| `MT-REQ-006` | `Documented` | baseline §8, §14 (missing context, spoofed tenant key); specification required scenario 5 | Spike Draft; not promoted |
| `MT-REQ-007` | `Documented` | baseline §4, §9, §14 (atomic business+audit+outbox, jobs/events); specification required scenario 6 | Spike Draft; not promoted |
| `MT-REQ-008` | `Documented` | baseline §9, §14 (retries and idempotency); specification required scenario 6 | Spike Draft; not promoted |
| `MT-REQ-009` | `Documented` | baseline §4, §11, §14 (non-leaking errors); specification required scenario 2 | Spike Draft; not promoted |
| `MT-REQ-010` | `Documented` | adoption profile validation scope; specification required scenario 7; baseline §14 | Spike Draft; not promoted |

Verifiable criteria below are `Derived` unpackings of those sources. Scenario IDs in `MT-SPIKE-001-traceability.md` are a `Proposed` index for the matrix. Option B is a `Proposed` scope decision recorded in this Draft spike; it is not a status promotion.

Drizzle schema-alignment and escaped-handle tests are `Derived` from `ADR-DIVE-002` and the SPIKE-001 `tenant-schema` / application UoW tests. Prototype memberships are `Proposed` tables. Permission strings `center.read` and `booking.create` are `Documented` names from `SPEC-DIVE-IAM-001`, reused here as typical membership payload until product IAM is implemented.

## Requirements

- **MT-REQ-001:** Every tenant-owned row has a non-null tenant key.
  - Inserting a tenant-owned row under authorized context persists the tenant key of that context.
  - Inserting a tenant-owned row with a null tenant key is rejected.
  - Every tenant-owned table in the representative slice (`centers`, `notes`, `outbox_events`, `audit_records`, `consumer_receipts`, `memberships`) has a non-null tenant column.
  - Drizzle table definitions match PostgreSQL columns, nullability, and foreign keys for the representative slice.
- **MT-REQ-002:** Every tenant-owned operation runs under explicit authorized tenant context.
  - Authorized reads and writes succeed inside the tenant and center scope of that context.
  - Tenant context is created only after the actor’s identity–tenant relationship is validated.
  - An identity without membership in tenant T cannot establish tenant context for T.
  - A client-supplied tenant identifier is not sufficient to authorize the operation.
  - The unit of work receives an already-authorized tenant identifier; it does not treat an arbitrary UUID as authorization.
  - Prototype membership uses documented IAM permission names (`center.read`, `booking.create`) as payload only; they are not the product permission matrix.
- **MT-REQ-003:** Cross-tenant relationships are rejected by constraints.
  - Inserting a tenant-owned child that references another tenant’s operational scope is rejected by application and database controls.
  - Updating an existing relationship so that the two tenant-owned ends belong to different tenants is rejected.
  - The representative composite foreign key (`notes → centers`) is exercised; the same class of failure applies to other tenant-owned relations in the slice when they exist.
- **MT-REQ-004:** Runtime database role has forced RLS, no BYPASSRLS, and no DDL.
  - The application role has `rolbypassrls = false` and is not superuser.
  - The application role cannot execute DDL (at least `CREATE TABLE`).
  - Every tenant-owned table has RLS enabled and forced (`relrowsecurity`, `relforcerowsecurity`).
  - Each such table has policies that constrain `SELECT`/`INSERT`/`UPDATE`/`DELETE` with both `USING` and `WITH CHECK` on the tenant key.
  - The application role is not table owner, is not the migrations role, and cannot disable RLS, drop isolation policies, or grant itself `BYPASSRLS`.
- **MT-REQ-005:** Tenant context is transaction-local and cleared before pooled connection reuse.
  - Context is set after `BEGIN` and before any tenant-owned query, with a transaction-local mechanism (`set_config(..., true)` or equivalent).
  - After commit, the next checkout of the **same** physical connection has no leftover `app.tenant_id`.
  - After rollback, the same physical connection has no leftover context.
  - After a SQL error that aborts the transaction, the same physical connection has no leftover context.
  - Reuse is demonstrated by forcing a pool of size 1 (or asserting the same `pg_backend_pid`) and alternating tenants A and B more than once.
- **MT-REQ-006:** Operations without valid tenant context fail closed.
  - `SELECT`, `INSERT`, `UPDATE`, and `DELETE` on tenant-owned tables without context fail closed.
  - Missing, empty, and malformed tenant context fail closed.
  - A spoofed tenant key on the row that does not match the authorized context is rejected (`WITH CHECK` / equivalent).
  - Drizzle queries and inserts outside the unit of work fail closed.
  - Parameterized SQL executed through Drizzle inside the unit of work remains tenant-scoped.
  - A Drizzle handle captured after the unit of work ends cannot read or write tenant-owned rows.
- **MT-REQ-007:** Async work propagates tenant and correlation identifiers.
  - Producer records tenant and correlation ID from authorized context.
  - Consumer rebuilds a tenant-aware unit of work before read or write.
  - Domain change, audit record, and outbox event of the same operation commit or roll back together.
  - Retries, dead-letter, and worker logs preserve tenant and correlation ID and do not switch tenant.
- **MT-REQ-008:** Outbox processing is idempotent and cannot act in another tenant context.
  - A second sequential delivery of the same tenant-scoped idempotency key does not apply the effect twice.
  - A worker in tenant B cannot consume or acknowledge an event that belongs to tenant A.
  - Concurrent workers processing the same event do not double-apply the effect.
  - Retry after a persisted receipt whose ACK was lost is idempotent.
  - Retry limits / backoff exist as documented for consumers; exhaustion does not process the event under another tenant.
- **MT-REQ-009:** Audit and errors do not disclose another tenant data.
  - List, get-by-id, and aggregate queries in tenant B do not return tenant A rows, counts, or identifiers.
  - Tenant B cannot read tenant A audit records.
  - Failures (missing context, cross-tenant access, worker errors) do not reveal another tenant’s payloads, tokens, emails, or resource existence beyond a generic closed failure.
- **MT-REQ-010:** Reproducible evidence uses at least two tenants and two centers.
  - Fixtures include at least two tenants and two centers (including two centers of the same tenant).
  - Repeatable negative tests use both tenants and more than one center; a single happy-path insert is not sufficient evidence.

## Completion rule

Every verifiable criterion must map to a row in `MT-SPIKE-001-traceability.md` with scenario, test, assertion, and evidence. Mapping a requirement ID to a file is not completion. A row may be `Deferred` only if it appears in Option B below. A row may be `Excluded` only if it is a product concern assigned to `SPIKE-DIVE-001`, `SPIKE-DIVE-003`, or `SPEC-DIVE-OPS-001`.

Evidence lives in `MT-SPIKE-001-results.md` or `evidence/multitenancy/MT-SPIKE-001/`. This spike remains Draft until tests and evidence cover every non-deferred criterion.

## Option B — deferred baseline channels

**Provenance:** `Proposed` (product owner instruction to apply Option B on 2026-09-26). **Status:** Draft. Does not promote this spike, the adoption profile, or the baseline.

These baseline §10–§13 / §14 categories are **not** in `MT-SPIKE-001` because the channels do not exist in this harness. They are not waived. The reusable baseline is **not** fully adopted until each has isolation evidence in its owning artifact.

| Channel | Why not this spike | Owning artifact when the channel exists | Evidence still required for baseline adoption |
|---|---|---|---|
| Cache | No cache | The SPEC/spike that introduces cache | Cache keys include tenant and contract version |
| Files | No file storage | The SPEC/spike that introduces files | Paths/metadata include tenant; access URLs validated |
| Search | No search index | The SPEC/spike that introduces search | Tenant is a mandatory server-side filter |
| Export | No export flow | Future product rights/privacy SPEC; until opened, `specs/foundation/security-privacy-baseline.md` and the product-profile privacy gate | Export does not mix tenants |
| Deletion / erasure | No deletion flow | Same as export | Originals and derived data are deleted without cross-tenant residue |
| Restore | No backup rehearsal | Future recovery SPEC; until opened, `specs/foundation/operations-quality-recovery.md` | Global restore and logical tenant recovery are distinct and rehearsed |
| Support access | Not a PostgreSQL harness concern | `specs/iam/SPEC-DIVE-IAM-001.md` (`DIVE-IAM-REQ-020`, `DIVE-IAM-REQ-028`) | Time-bounded, tenant-explicit, audited support access with expiry tests |
| Noisy neighbor | No quotas/rate limits in this slice | Future operations SPEC; until opened, `specs/foundation/operations-quality-recovery.md` | Uneven load / per-tenant limits |

Do not invent SPEC IDs for artifacts that do not exist. Opening those SPECs is a later decision.

## Excluded product scenarios (already documented)

Not this spike:

- Booking capacity / last seat → `SPIKE-DIVE-001`
- Widget / public HTTP channel behavior → `SPIKE-DIVE-003` and `SPEC-DIVE-BOOKING-001`
- Trip operations → `SPEC-DIVE-OPS-001` / `SPIKE-DIVE-002`

## Open questions

- The spike **question** names HTTP; the **method** is a representative PostgreSQL slice and this harness has no HTTP server. Whether an HTTP fixture is required before closing `MT-SPIKE-001`, or only with the first API implementation plus `DIVE-IAM-REQ-006`, is unresolved. Do not treat persistence tests as HTTP isolation evidence.

## Classification reminder

- `Documented`: the ten `MT-REQ-*` statements and the cited baseline/specification/adoption/IAM text.
- `Derived`: the verifiable bullets (test implications of those statements).
- `Proposed`: Option B assignment table and scenario IDs.
- `Open question`: HTTP fixture obligation.
