# Multi-tenant adoption profile — Dive platform

- **Status:** Draft
- **Version:** 0.6
- **Product:** Dive platform
- **solution_name:** Plataforma para centros de buceo
- **solution_slug:** `dive-platform`

## Authority

This profile instantiates `specs/foundation/multitenancy-architecture.md` for the dive product. It does not redefine the baseline. Notion page `01 — Perfil de adopción multi-tenant` is an index only.

## Adoption parameters

| Parameter | Value |
|---|---|
| `solution_name` | Plataforma para centros de buceo |
| `solution_slug` | `dive-platform` |
| Package name | `dive-center-platform` |
| Tenant entity | Dive operator |
| Tenant key | `tenant_id` |
| Operational scope | Center/base |
| Identity provider | Clerk behind an internal façade/adapter |
| Persistence | Shared PostgreSQL database and schema |
| Isolation control | Non-null tenant keys, tenant-aware constraints, forced RLS |
| Primary data region | EU |

## Product-specific invariants

- Each center belongs to exactly one tenant.
- Center identifiers never authorize access by themselves.
- Public channels resolve tenant, center, and published activity server-side.
- A global identity may have independent memberships in multiple tenants.
- External distributors are integration principals, not tenant roles and not RLS bypasses.

## Validation scope

Cross-cutting validation covers tenant-context propagation and cleanup, forced RLS, tenant-aware relationships, pool reuse, async/outbox propagation, audit, and negative tests with at least two tenants and two centers.

Booking capacity, booking states, widget behavior, and trip operations remain in their product SPECs and spikes. Sharing fixtures or pipeline with those spikes does not merge their results.

### Per-table selected-tenant isolation proof

**Proposed, explicitly approved -- Product validation obligation:** source: product-owner documentation direction in the selected-handle isolation test discussion on 2026-10-01. This adds a product-specific validation obligation under the [baseline test strategy](../foundation/multitenancy-architecture.md#14-minimum-test-strategy); the profile remains Draft and no executed coverage or artifact promotion is implied.

- For every table whose data must not be shared between tenants, provide a reproducible negative test that attempts to access tenant A's data while tenant B is selected by the handle. Use the same identity with active memberships and the relevant permissions in both tenants, so denial cannot be explained only by missing authorization in A.
- Include a positive control showing that the same identity and operation can access A's data with A's handle. Exercise both tenant directions, including the corresponding permitted operation with B's handle, without changing identity or permissions between the permitted and denied requests.
- Exercise the applicable public application boundary and the persistence isolation boundary against real PostgreSQL. Cover the table's supported reads, lists or aggregates without foreign rows or contributions, and supported mutations without foreign changes or associated audit/outbox effects. A denial at HTTP admission alone does not prove that table's RLS or persistence controls.
- Maintain per-table coverage in the existing product isolation inventory and owning tests. Add or extend this proof when introducing a non-shared table or a new access path; a passing center-list test or a representative harness table does not establish coverage for other tables. Reuse the existing test harness rather than creating a separate suite for every table.
- Only data explicitly classified as global or shared by its owning contract are outside this obligation. Missing tenant keys, broad roles or missing tests do not establish that classification. Unexecuted or missing per-table checks remain coverage gaps, not completed proof.

### Option B — channels not in MT-SPIKE-001

**Provenance:** approved scope decision (product owner, 2026-09-26). This adoption profile remains Draft. The decision does not waive baseline invariants.

Cache, files, search, export, deletion, restore, support access, and noisy-neighbor are **out of the executed MT-SPIKE-001 harness**, not necessarily absent from the current product. Each introducing owner must supply isolation evidence; client query caching does not close the baseline cache scenario. Assignment:

| Channel | Owner |
|---|---|
| Cache / files / search | The SPEC/spike that introduces the channel. Do not invent the ID now. |
| Export / deletion | Future product rights/privacy SPEC; until opened, `specs/foundation/security-privacy-baseline.md` and the product-profile privacy gate |
| Restore | Future recovery SPEC; until opened, `specs/foundation/operations-quality-recovery.md` |
| Support access | `specs/iam/SPEC-DIVE-IAM-001.md` (`DIVE-IAM-REQ-020`, `DIVE-IAM-REQ-028`) |
| Noisy neighbor | Future operations SPEC; until opened, `specs/foundation/operations-quality-recovery.md` |

Details: `specs/multitenancy/MT-SPIKE-001-requirements.md` (Option B) and `MT-SPIKE-001-traceability.md` (`MT-SC-044`…`051`).

## Acceptance gate

This profile becomes Ready to start when ADR-DIVE-001 and ADR-DIVE-002 are Accepted as referenced decisions and MT-SPIKE-001 documents are reviewed.

`MT-SPIKE-001` plus `SPIKE-DIVE-001` are necessary for the persistence and booking-concurrency slice of the walking skeleton. They are **not** sufficient to declare the reusable baseline fully adopted.

The baseline is adopted only when:

1. MT-SPIKE-001 is Accepted with conditions and every condition is satisfied before its activation gate, and
2. the product-critical concurrency spike (SPIKE-DIVE-001) passes, and
3. each Option B channel has isolation evidence in its owning artifact (or that channel is still absent and remains explicitly deferred).


### Activated follow-ups from MT-SPIKE-001

- `MT-COND-IAM-001`: first IAM/API vertical owns HTTP isolation, authorized producer context, and API error/log redaction.
- `MT-COND-WORKER-001`: first real outbox worker owns external delivery, retry/backoff/exhaustion, dead-letter, and worker-log evidence.

The parent `MT-REQ-*` obligations remain in the multitenancy baseline. The follow-up verticals own evidence, not a rewritten copy of the requirements.

## Expected GitHub evidence

```text
specs/multitenancy/
├── adoption-profile.md
├── MT-SPIKE-001-specification.md
├── MT-SPIKE-001-requirements.md
├── MT-SPIKE-001-execution-checkpoints.md
├── MT-SPIKE-001-traceability.md
└── MT-SPIKE-001-results.md
```
