# ADR-DIVE-001 — Tenant, center, and multi-tenant access model

- **Status:** Ready to start
- **Proposed decision:** the dive operator is the tenant; each center/base is an internal operational scope.

## Context

An operator may run one or many centers. Staff and instructors may collaborate with more than one operator, but data and permissions must never leak across tenants.

## Decision

- **Tenant / provider:** the operator (legal entity / business unit) contracting the platform.
- **Scope:** center/base as an internal scope within the tenant.
- **Identity:** global; may have independent memberships in multiple tenants.
- **Access:** tenant-scoped relationship with status, roles, and authorized centers.
- Public widget/hosted page: tenant/center/service must be resolved server-side from controlled configuration. The browser is not trusted for `tenant_id`.

## Consequences

- All tenant-owned data includes non-null `tenant_id`.
- No shared centers across tenants in the MVP.
- Multi-center readiness from day one (even if pilot uses one center).
- Future distribution (OTA) is a separate integration principal + agreements; never a human role and never a bypass of RLS.

## Acceptance criteria

Pilot fits without exceptions, IAM matrix is validated, and tenant-aware tests (including multi-tenant validation) prove isolation.