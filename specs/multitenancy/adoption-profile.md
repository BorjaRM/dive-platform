# Multi-tenant adoption profile — Dive platform

- **Status:** Draft
- **Version:** 0.5
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
