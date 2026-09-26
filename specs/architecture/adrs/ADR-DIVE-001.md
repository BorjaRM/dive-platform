# ADR-DIVE-001 — Tenant, center, and multi-tenant access model

- **Status:** Ready to start
- **Version:** 0.2
- **Decision date:** 2026-09-26

## Context

An operator may run one or many centers. Staff and instructors may collaborate with more than one operator. Data and permissions must never leak across tenants. Public booking pages cannot be trusted to supply `tenant_id`.

## Decision

- **Tenant:** the dive operator (legal entity / business unit) contracting the platform.
- **Operational scope:** center/base inside the tenant. Centers are not shared across tenants in the MVP.
- **Identity:** global. Independent memberships per tenant.
- **Access:** tenant-scoped relationship with status, roles, and authorized centers.
- **Public widget/hosted page:** tenant, center, and published offering are resolved server-side from controlled channel configuration.
- **Future distribution (OTA):** a separate integration principal and agreements; never a human role and never an RLS bypass.

## Consequences

- All tenant-owned data includes non-null `tenant_id`.
- Multi-center readiness from day one, even if the pilot uses one center.
- IAM and booking SPECs inherit this boundary.
- Adoption profile instantiates the baseline with `tenant_key = tenant_id` and `operational_scope = center/base`.

## Alternatives considered

- Center as tenant: rejected; operators with several bases would become several customers and could not share staff correctly.
- Person as tenant: rejected; the operator owns the catalog and the data.

## Acceptance criteria

- Pilot fits without exceptions to this model
- IAM matrix is implementable
- Tenant-aware tests including MT-SPIKE-001 prove isolation
