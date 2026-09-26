# Multi-tenant adoption profile — Dive platform

- **Status:** Draft
- **Version:** 0.1
- **Product:** Dive platform

## Authority

This profile instantiates `specs/foundation/multitenancy-architecture.md` for the dive product. It does not redefine the baseline.

## Adoption parameters

| Parameter | Value |
|---|---|
| `solution_slug` | `dive-platform` |
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

The cross-cutting validation covers tenant-context propagation and cleanup, forced RLS, tenant-aware relationships, pool reuse, async/outbox propagation, audit, and negative tests with at least two tenants and two centers.

Booking capacity, booking states, widget behavior, and trip operations remain in their product SPECs and spikes.

## Acceptance gate

This profile becomes Ready to start when ADR-DIVE-001 and ADR-DIVE-002 are accepted as the referenced decisions and the MT-SPIKE-001 documents are reviewed.
