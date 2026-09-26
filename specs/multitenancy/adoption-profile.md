# Multi-tenant adoption profile — Dive platform

- **Status:** Draft
- **Version:** 0.2
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

## Acceptance gate

This profile becomes Ready to start when ADR-DIVE-001 and ADR-DIVE-002 are Accepted as referenced decisions and MT-SPIKE-001 documents are reviewed.

The baseline is adopted only when:

1. MT-SPIKE-001 passes, and
2. the product-critical concurrency spike (SPIKE-DIVE-001) passes.

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
