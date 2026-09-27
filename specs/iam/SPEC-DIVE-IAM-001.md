# SPEC-DIVE-IAM-001 — Roles, permissions, and scopes

- **Status:** Ready to start
- **Version:** 0.8
- **Last reviewed:** 2026-09-27
- **Approved by:** Borja (Product owner)
- **Approval reference:** PR #1, provenance migration PR, PR #13 (`ADR-DIVE-008` Ready to start), and product confirmation 2026-09-27 for `ADR-DIVE-008` v0.7 implementation closures
- **Owner:** Product / Security
- **IDs:** `DIVE-IAM-REQ-001` … `DIVE-IAM-REQ-031`

## Normative authority

This SPEC is the single normative source for MVP identity, membership, roles, permissions, scopes, public capabilities, revocation, and privileged support access.

It adopts `specs/foundation/iam-baseline.md`. Dive-specific roles and public-channel capabilities are defined here. Clerk is an adapter, not the authorization source of truth.

Dashboard tenant-context HTTP contract is owned with `ADR-DIVE-008`.

## Requirement provenance

The ranges below cover every requirement in this SPEC. Decisions originating in the PR #1 consolidation remain visibly classified as `Proposed` even after owner approval.

| Requirement IDs | Provenance | Exact source | Decision status |
|---|---|---|---|
| `DIVE-IAM-REQ-001..DIVE-IAM-REQ-009` | `Derived` | `specs/foundation/iam-baseline.md`; `specs/architecture/adrs/ADR-DIVE-001.md`; PR #1 | Approved by product owner |
| `DIVE-IAM-REQ-010..DIVE-IAM-REQ-015` | `Derived` | `specs/foundation/iam-baseline.md`; `specs/product/dive-mvp-profile.md`; PR #1 | Approved by product owner |
| `DIVE-IAM-REQ-016` | `Proposed` | PR #1 revocation-window decision | Approved by product owner for MVP validation |
| `DIVE-IAM-REQ-017..DIVE-IAM-REQ-020` | `Proposed` | PR #1 invitation, owner-lockout, MFA-readiness, and support-access decisions | Approved by product owner for MVP validation |
| `DIVE-IAM-REQ-021..DIVE-IAM-REQ-028` | `Derived` | `specs/foundation/iam-baseline.md`; `specs/foundation/security-privacy-baseline.md`; PR #1 | Approved by product owner |
| `DIVE-IAM-REQ-029..DIVE-IAM-REQ-031` | `Proposed` | `ADR-DIVE-008`; product confirmation 2026-09-27 | Approved by product owner 2026-09-27 for MVP validation; Ready to start |

## Goal

Authorize dashboard users by identity + tenant + center + permission + resource + state, and grant public bookers only token-limited capabilities.

## Scope

In scope:

- Global identity with tenant-scoped memberships
- Clerk behind an internal façade/adapter
- Internal identities, memberships, roles, and center scopes in PostgreSQL
- Public booking capabilities without internal roles
- Invitation, disable, and revocation for MVP dashboard users
- Read-only platform support path
- Dashboard tenant-context credential and path contract (`DIVE-IAM-REQ-029..031`)

Out of scope:

- Mandatory MFA for all users (model must allow future step-up)
- Write-capable platform support
- Operational trip roles beyond the MVP catalog
- Customer accounts / customer portal
- External collaborator role in the first pilot (modeled, disabled)

## Authorization decision

```text
allow = identity is authenticated
      AND membership in tenant is active
      AND requested tenant matches authorized context
      AND permission is granted
      AND resource center is in authorized scopes, if the permission is center-scoped
      AND resource state allows the action
```

Default deny. Client-supplied roles, permissions, or tenant IDs are never authoritative.

For dashboard HTTP after the implementation cut-over, authorized tenant context is resolved from an internal tenant-scoped handle after Clerk authentication. It is not taken from `/tenants/:tenantId`, query, or body.

## Roles (MVP)

Tenant-wide:

| Role | Intent |
|---|---|
| Tenant Owner | Full tenant administration, including billing later; cannot be locked out of the last owner |
| Tenant Admin | Day-to-day administration except ownership transfer |
| Operations Lead | Cross-center booking operations |
| Auditor/Compliance | Read-only operational and audit access |

Center-scoped:

| Role | Intent |
|---|---|
| Center Manager | Manage one or more assigned centers |
| Reception / Booking Manager | Create/manage bookings and calendar in assigned centers |
| External collaborator | Modeled, **disabled in first pilot** |

Public:

- No internal role. Capabilities are bound to a published channel and/or a single-purpose token.

## Permissions

Stable capability names:

- `center.read`
- `booking_service.create` `booking_service.read` `booking_service.update` `booking_service.publish`
- `availability.read` `availability.manage`
- `booking.create` `booking.read` `booking.update` `booking.confirm` `booking.cancel`
- `calendar.read`
- `customer_contact.read` (purpose-limited)
- `audit.read` `audit.export`
- `membership.invite` `membership.disable` `membership.read`
- `channel.read` `channel.manage`
- `support.tenant.read`

Write variants of `audit.*` and `support.tenant.write` are out of MVP.

## Requirements

- **DIVE-IAM-REQ-001:** Identities are global. Access is a tenant-scoped membership with status, roles, and authorized centers.
- **DIVE-IAM-REQ-002:** A person may belong to multiple tenants. Memberships, roles, and data never leak across tenants.
- **DIVE-IAM-REQ-003:** Authorization uses identity + tenant + center + permission + resource + state. Missing any element denies.
- **DIVE-IAM-REQ-004:** Clerk authenticates. PostgreSQL stores internal identity, memberships, roles, and scopes. Clerk is reached only through the façade/adapter.
- **DIVE-IAM-REQ-005:** Email is not a stable identifier. External identity is bound by `issuer + subject`.
- **DIVE-IAM-REQ-006:** The backend derives tenant context from the session and internal assignments, never from an untrusted client tenant field.
- **DIVE-IAM-REQ-007:** Public channels do not grant dashboard roles.
- **DIVE-IAM-REQ-008:** Public create-booking is authorized by a published server-side channel configuration.
- **DIVE-IAM-REQ-009:** Public cancellation and confirmation-read are authorized by opaque, single-purpose, expiring tokens.
- **DIVE-IAM-REQ-010:** Tenant Owner and Tenant Admin are tenant-wide.
- **DIVE-IAM-REQ-011:** Center Manager and Reception / Booking Manager can act only in assigned centers.
- **DIVE-IAM-REQ-012:** Operations Lead may operate across centers of the same tenant and still cannot cross tenants.
- **DIVE-IAM-REQ-013:** Auditor/Compliance is read-only.
- **DIVE-IAM-REQ-014:** External collaborator exists in the model and is disabled for the first pilot.
- **DIVE-IAM-REQ-015:** `customer_contact.read` is purpose-limited to booking operations and must be audited.
- **DIVE-IAM-REQ-016:** Ordinary revocation (disable membership, role removal, session invalidation) takes effect within 5 minutes.
- **DIVE-IAM-REQ-017:** Invitation creates a pending membership in one tenant with explicit roles and centers.
- **DIVE-IAM-REQ-018:** The last Tenant Owner cannot be disabled without transferring ownership.
- **DIVE-IAM-REQ-019:** MFA is not mandatory for MVP dashboard users, but the model must support future step-up without schema rewrite.
- **DIVE-IAM-REQ-020:** Platform support in MVP is read-only, time-bounded, justified, tenant-explicit, and audited. Write support is disabled until step-up/MFA exists.
- **DIVE-IAM-REQ-021:** Webhooks from Clerk are verified, tenant-resolved internally, idempotent, and never trusted as authorization by themselves.
- **DIVE-IAM-REQ-022:** Session expiry, logout, and membership disable prevent further authorized dashboard calls.
- **DIVE-IAM-REQ-023:** Permission names are stable strings. UI labels may change; authorization keys must not.
- **DIVE-IAM-REQ-024:** Errors do not disclose whether an identity, membership, or resource exists in another tenant.
- **DIVE-IAM-REQ-025:** Every authorization deny/allow on sensitive booking and membership operations is auditable.
- **DIVE-IAM-REQ-026:** Public tokens never include internal roles, other bookings, or other tenants’ identifiers.
- **DIVE-IAM-REQ-027:** Operational trip roles required by SPEC-DIVE-OPS-001 are not granted in the MVP and require a SPEC change.
- **DIVE-IAM-REQ-028:** Tests must cover cross-tenant access, center-scope enforcement, public-token limits, and support-access expiry.
- **DIVE-IAM-REQ-029:** Dashboard HTTP paths MUST NOT include `/tenants/:tenantId` or another tenant-identifier segment. Product routes MUST NOT take tenant context from query string or body. `:centerId` and `:membershipId` remain resource selectors and never select the tenant.
- **DIVE-IAM-REQ-030:** After Clerk authentication, dashboard tenant context is an opaque server-stored handle presented in `X-Tenant-Context`, bound to the authenticated identity and Clerk `sid`. The handle selects a tenant and is not sufficient authorization. Roles, permissions, center scopes, and membership state are read from PostgreSQL on the request.
- **DIVE-IAM-REQ-031:** The server lists only the identity’s active operator memberships as opaque `operatorRef` values. Zero active memberships issue no handle. Exactly one active membership may be selected automatically. Several require an explicit `operatorRef` from that list. Invalid, inactive, unrelated, or cross-identity selections fail without disclosure. Several handles may exist for one Clerk session. The handle is tenant-scoped, not center-scoped.

## Dashboard API (`ADR-DIVE-008`)

Ready to start. The dashboard route contract is defined by `ADR-DIVE-008` v0.7.

```text
GET    /v1/me/operators
POST   /v1/me/tenant-contexts
DELETE /v1/me/tenant-contexts
GET    /v1/centers
GET    /v1/centers/:centerId
PATCH  /v1/memberships/:membershipId/disable
```

Protected product requests send `Authorization: Bearer <clerk-session-token>` and `X-Tenant-Context`. They MUST NOT use `/tenants/:tenantId`.

## Matrix (MVP)

| Permission | Owner | Admin | Ops Lead | Auditor | Center Manager | Reception | Public |
|---|---|---|---|---|---|---|---|
| `center.read` | Y | Y | Y | Y | assigned | assigned | channel-published only |
| `booking_service.*` | Y | Y | Y | read | assigned | read | no |
| `availability.manage` | Y | Y | Y | no | assigned | assigned | no |
| `booking.create` | Y | Y | Y | no | assigned | assigned | channel only |
| `booking.confirm/cancel` | Y | Y | Y | no | assigned | assigned | token cancel only |
| `calendar.read` | Y | Y | Y | Y | assigned | assigned | no |
| `customer_contact.read` | Y | Y | Y | Y | assigned | assigned | no |
| `audit.read` | Y | Y | Y | Y | assigned limited | no | no |
| `membership.*` | Y | Y | no | read | no | no | no |
| `channel.manage` | Y | Y | no | no | assigned | no | no |
| `support.tenant.read` | n/a | n/a | n/a | n/a | n/a | n/a | platform support only |

“assigned” means authorized centers only.

## Dependencies

- ADR-DIVE-001, ADR-DIVE-002, ADR-DIVE-007, ADR-DIVE-008
- `specs/foundation/iam-baseline.md`
- `specs/booking/SPEC-DIVE-BOOKING-001.md` for public capabilities
- `specs/multitenancy/adoption-profile.md`

## Tests and expected evidence

- Membership and role assignment tests
- Center-scope negative tests
- Public channel and token negative tests
- Revocation timing test or documented measurement
- Support access expiry test
- Dashboard routes without `/tenants/:tenantId`; old tenant-path shapes rejected; handle/session/identity mismatch; automatic and explicit operator selection; non-disclosing invalid `operatorRef`

## Open questions

The product-level questions for the dashboard tenant-context slice are closed by `ADR-DIVE-008` v0.7, with provenance `Proposed` and explicit product-owner approval on 2026-09-27. The implementation may choose physical table/index names and deployment secret names only when those choices preserve the approved contract and do not introduce new defaults. Active-handle TTL policy and cleanup execution remain explicit follow-up decisions.
