# SPEC-DIVE-IAM-001 — Roles, permissions, and scopes

- **Status:** Ready to start
- **Version:** 0.27
- **Last reviewed:** 2026-10-01
- **Approved by:** Product owner
- **Approval reference:** PR #1, provenance migration PR, PR #13 (`ADR-DIVE-008` Ready to start), product confirmation 2026-09-27 for `ADR-DIVE-008` v0.7 implementation closures, product confirmation 2026-09-27 for center-application bootstrap (`ADR-DIVE-008` v0.9), product confirmation 2026-09-27 for reserved keys, generated CORS, authentication host, environment namespace, and no-`Origin` bootstrap (`ADR-DIVE-008` v0.10), product confirmation 2026-09-29 for `center.read` on center-entry issuance (`ADR-DIVE-008` v0.11), product confirmation 2026-09-29 applying the center-entry lifecycle recommendation (`ADR-DIVE-008` v0.12), PR #32 Draft authority-boundary clarification, Product, Security, and Architecture approval on 2026-09-27 for the `booking.reject` permission, and PR #36 Draft self-bootstrap authority-boundary clarification
- **Owner:** Product / Security
- **IDs:** Only the requirements declared below; moved IDs retain their identifiers in the ownership map.

## Normative authority

**Documented:** this file remains the entry point and owns the requirements declared here. Each moved ID has one owner below; existing references can continue to enter through this map. The structural split preserves requirement text and original provenance. New proposals remain Draft.

| Contract | Requirement owner |
|---|---|
| Dashboard context and center entry | [SPEC-DIVE-IAM-DASHBOARD-001](SPEC-DIVE-IAM-DASHBOARD-001.md) |
| Ordinary tenant invitations | [SPEC-DIVE-IAM-INVITATIONS-001](SPEC-DIVE-IAM-INVITATIONS-001.md) |
| Privileged read-only platform support | [SPEC-DIVE-IAM-SUPPORT-001](SPEC-DIVE-IAM-SUPPORT-001.md) |

## Requirement provenance

| Requirement IDs | Provenance | Exact source | Decision status |
|---|---|---|---|
| `DIVE-IAM-REQ-001..DIVE-IAM-REQ-003` | `Derived` | `specs/foundation/iam-baseline.md`; `specs/architecture/adrs/ADR-DIVE-001.md`; PR #1 | Approved by product owner |
| `DIVE-IAM-REQ-004` | `Documented` | Original requirement introduced as `Derived`: `specs/foundation/iam-baseline.md`, `specs/architecture/adrs/ADR-DIVE-001.md`, PR #1. Product-owner selection of expiry-based JWT acceptance and explicit contract-update authorization in the authentication/BFF planning conversation on 2026-10-01; subsequent product-owner approval and contract-closure request on the same date for the [verified-email lookup boundary](#verified-email-lookup-boundary) | Original approval preserved; JWT validity and use-case-specific verified-email boundary approved 2026-10-01; implementation and provider verification pending, no status promotion |
| `DIVE-IAM-REQ-005..DIVE-IAM-REQ-009` | `Derived` | `specs/foundation/iam-baseline.md`; `specs/architecture/adrs/ADR-DIVE-001.md`; PR #1 | Approved by product owner |
| `DIVE-IAM-REQ-010..DIVE-IAM-REQ-015` | `Derived` | `specs/foundation/iam-baseline.md`; `specs/product/dive-mvp-profile.md`; PR #1 | Approved by product owner |
| `DIVE-IAM-REQ-016` | `Documented` | Original requirement introduced as `Proposed`: PR #1 revocation-window decision. Product-owner contract-update authorization 2026-10-01; [dashboard JWT validity boundary](#dashboard-jwt-validity-boundary) | Original product-owner approval for MVP validation preserved; existing five-minute limit unchanged; provider verification gates activation |
| `DIVE-IAM-REQ-018..DIVE-IAM-REQ-019` | `Proposed` | PR #1 invitation, owner-lockout, MFA-readiness, and support-access decisions | Approved by product owner for MVP validation |
| `DIVE-IAM-REQ-021` | `Derived` | `specs/foundation/iam-baseline.md`; `specs/foundation/security-privacy-baseline.md`; PR #1 | Approved by product owner |
| `DIVE-IAM-REQ-022` | `Documented` | Original requirement introduced as `Derived`: `specs/foundation/iam-baseline.md`, `specs/foundation/security-privacy-baseline.md`, PR #1. Product-owner contract-update authorization 2026-10-01; [dashboard JWT validity boundary](#dashboard-jwt-validity-boundary) | Original approval preserved; previously issued JWT expiry window approved 2026-10-01; local authorization and context revocation preserved, implementation pending |
| `DIVE-IAM-REQ-023..DIVE-IAM-REQ-028` | `Derived` | `specs/foundation/iam-baseline.md`; `specs/foundation/security-privacy-baseline.md`; PR #1 | Approved by product owner |
| Commercial profile and policy grants under `DIVE-IAM-REQ-003`, `010..013`, `023`, `028` | `Proposed` | Product-owner acceptance in this chat on 2026-10-01 of the preceding seven-block recommendations, followed by documentation authorization | Explicitly approved `center_profile.update` and `cancellation_policy.manage` grants below; existing catalog/channel permissions unchanged, no implementation or status promotion |
| Calendar phase-two read grants under `DIVE-IAM-REQ-003`, `010..013`, `015`, `023`, `025`, `028` | `Proposed` | Product-owner confirmation on 2026-10-01 of the calendar phase-two eight-block recommendation, followed by the request to document those changes in the same conversation | Explicitly approved `booking.read` grants, calendar/detail/contact permission separation below; precise read/audit contracts and implementation remain pending, no artifact promotion |
| Calendar phase-two concrete contact/audit boundary under `DIVE-IAM-REQ-003`, `015`, `023`, `025`, `028` | `Proposed` | Subsequent product-owner approval and documentation-update authorization on 2026-10-01 of the eight-point concrete calendar read recommendation | Explicitly approved both contact-read permissions, the contact route and reuse of existing read audit actions below; unselected audit details and implementation remain pending, no artifact promotion |
| Calendar phase-two audit-identifier clarification under `DIVE-IAM-REQ-015`, `025`, `028` | `Proposed` | Product-owner registration authorization on 2026-10-01 for the subsequent five-part implementation-convention recommendation | Explicitly approved reuse of the audit mechanism with actor/resource/result identifiers retained and contact values/payloads excluded; unselected granularity/purpose/timing and implementation proof remain pending, no artifact promotion |
| Calendar phase-two concrete read-audit contract under `DIVE-IAM-REQ-015`, `025`, `028` | `Proposed` | Product-owner direction on 2026-10-01 authorizing selection/documentation, followed by explicit confirmation of the resulting IAM and Scheduling blocks on the same date | Explicitly approved request-level audit, purpose, denial and fail-closed choices below; no artifact status promotion, implementation, executed coverage or publication is inferred |

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

- **DIVE-IAM-REQ-018:** The last Tenant Owner cannot be disabled without transferring ownership.

- **DIVE-IAM-REQ-019:** MFA is not mandatory for MVP dashboard users, but the model must support future step-up without schema rewrite.

- **DIVE-IAM-REQ-021:** Webhooks from Clerk are verified, tenant-resolved internally, idempotent, and never trusted as authorization by themselves.

- **DIVE-IAM-REQ-022:** Session expiry, logout, and membership disable prevent further authorized dashboard calls, subject to the [dashboard JWT validity boundary](#dashboard-jwt-validity-boundary) for previously issued Clerk tokens.

- **DIVE-IAM-REQ-023:** Permission names are stable strings. UI labels may change; authorization keys must not.

- **DIVE-IAM-REQ-024:** Errors do not disclose whether an identity, membership, or resource exists in another tenant.

- **DIVE-IAM-REQ-025:** Every authorization deny/allow on sensitive booking, membership, and center-entry lifecycle operations is auditable.

- **DIVE-IAM-REQ-026:** Public tokens never include internal roles, other bookings, or other tenants’ identifiers.

- **DIVE-IAM-REQ-027:** Operational trip roles required by SPEC-DIVE-OPS-001 are not granted in the MVP and require a SPEC change.

- **DIVE-IAM-REQ-028:** Tests must cover cross-tenant access, center-scope enforcement, public-token limits, and support-access expiry.

## Dashboard JWT validity boundary

**Documented -- Source and approval:** product-owner decision in the authentication/BFF planning conversation on 2026-10-01 selects acceptance of an already issued Clerk JWT until expiry rather than querying session and user status on every request; the subsequent explicit contract-update authorization records that selection here. Historical approvals remain identifiable above. This changes the authentication policy, not artifact status, implementation coverage or deployment authorization.

- **Documented:** every protected dashboard request must cryptographically verify the standard Clerk session JWT, expiry and temporal validity, exact issuer, approved `azp` and required identity/session claims through the identity adapter. Unverified payloads grant no authority. No custom token profile or application audience is introduced. [ADR-DIVE-007](../architecture/adrs/ADR-DIVE-007.md#revocation-and-session-boundary) owns the verification boundary.
- **Documented:** ordinary authentication does not consult Clerk session/user status to detect external logout, revocation, blocking or deletion. A previously issued JWT remains eligible until expiry; no status cache or revocation list is selected. This is not a guarantee of continued access: current local membership, permission, resource and context checks can deny sooner.
- **Documented:** dashboard logout stops browser calls and clears browser tenant context; explicit context revocation and the verified session-event handling in [ADR-DIVE-008](../architecture/adrs/ADR-DIVE-008.md#lifetime-renewal-and-revocation) remain unchanged. Revoking one local context does not invalidate the JWT or every other context. Local membership, role and scope changes remain effective through request-time authorization, independently of JWT expiry.
- **Documented:** the BFF continues to authenticate service and user separately and enforce the trusted application/tenant/resource association in `DIVE-IAM-REQ-030..032`. Expiry-based authentication neither grants cross-center access nor replaces application scope.
- **Documented -- Activation gate:** `DIVE-IAM-REQ-016` retains its five-minute limit. Verify actual provider token lifetime, verifier clock tolerance and cessation of token issuance/renewal after revocation, blocking or deletion before activation. Do not assume token lifetime from fixtures or depend exclusively on webhook arrival. A conflicting residual-access window requires an explicit configuration or requirement decision; this update selects neither a new TTL nor an exception to the existing limit.

### Verified-email lookup boundary

**Documented -- Source and approval:** the product owner explicitly approved the proposed separation of ordinary JWT authentication from use-case-specific verified-email lookup, then requested closure of this contract in the authentication/BFF planning conversation on 2026-10-01. This closes the prior Draft boundary under `DIVE-IAM-REQ-004`; it does not promote artifact status, claim implementation or authorize deployment.

- **Documented:** ordinary request authentication verifies the JWT without fetching the Clerk session or user. Only invitation acceptance and onboarding completion that require verified-email matching obtain those addresses through the existing identity facade/adapter. Creating an invitation does not require this recipient-identity lookup.
- **Documented:** the lookup consumes the authenticated principal and derives the provider identity from its trusted `issuer + subject`; caller-supplied user identifiers or email addresses cannot select the provider user or become verified data. The provider-neutral result must remain associated with that same identity. Preserve the existing matching and permanent-binding rules owned by [IAM invitations](SPEC-DIVE-IAM-INVITATIONS-001.md) and [onboarding](../onboarding/SPEC-DIVE-ONBOARDING-001.md), `DIVE-ONB-REQ-006`, `041`.
- **Documented:** the provider query establishes verified addresses only. It neither queries session status nor uses provider blocking or revocation state as an additional authentication condition. Missing email claims in the standard JWT are not evidence of a verified address; a browser-supplied email is never a substitute for provider verification.
- **Documented:** if the provider lookup cannot establish verified addresses for the authenticated identity, or no verified address matches the applicable invitation/grant, the use case must not complete acceptance or bootstrap. Preserve the owning operation's existing non-disclosing failures, authorization, transaction, audit and outbox boundaries; no invitation consumption, membership activation or bootstrap success is justified by an unavailable or unverified result.
- **Documented:** the lookup executes automatically during the relevant acceptance/completion operation. It introduces no per-invitation deployment or manual operational step, no session-status cache and no new token profile. JWT expiry, local context revocation and application A/B isolation remain governed by their unchanged owners.

## Goal

Authorize dashboard users by identity + tenant + center + permission + resource + state, and grant public bookers only token-limited capabilities.

## Scope

In scope:

- Global identity with tenant-scoped memberships
- Clerk behind an internal façade/adapter
- Internal identities, memberships, roles, and center scopes in PostgreSQL
- Public booking capabilities without internal roles
- Invitation, disable, and revocation for MVP dashboard users
- Reversible center-entry activation and disablement for tenant administrators
- Read-only platform support path
- Dashboard tenant-context credential and path contract (`DIVE-IAM-REQ-029..032`)

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
- `center_profile.update`
- `cancellation_policy.manage`
- `center_entry.manage`
- `booking_service.create` `booking_service.read` `booking_service.update` `booking_service.publish`
- `availability.read` `availability.manage`
- `booking.create` `booking.read` `booking.update` `booking.confirm` `booking.cancel`
- `booking.reject`
- `calendar.read`
- `customer_contact.read` (purpose-limited)
- `audit.read` `audit.export`
- `membership.invite` `membership.disable` `membership.read`
- `channel.read` `channel.manage`
- `support.tenant.read`

Write variants of `audit.*` and `support.tenant.write` are out of MVP.

## Matrix (MVP)

| Permission | Owner | Admin | Ops Lead | Auditor | Center Manager | Reception | Public |
|---|---|---|---|---|---|---|---|
| `center.read` | Y | Y | Y | Y | assigned | assigned | channel-published only |
| `center_profile.update` | Y | Y | no | no | assigned | no | no |
| `cancellation_policy.manage` | Y | Y | no | no | assigned | no | no |
| `center_entry.manage` | Y | Y | no | no | no | no | no |
| `booking_service.*` | Y | Y | Y | read | assigned | read | no |
| `availability.manage` | Y | Y | Y | no | assigned | assigned | no |
| `booking.create` | Y | Y | Y | no | assigned | assigned | channel only |
| `booking.read` | Y | Y | Y | Y | assigned | assigned | no |
| `booking.confirm/cancel/reject` | Y | Y | Y | no | assigned | assigned | token cancel only |
| `calendar.read` | Y | Y | Y | Y | assigned | assigned | no |
| `customer_contact.read` | Y | Y | Y | Y | assigned | assigned | no |
| `audit.read` | Y | Y | Y | Y | assigned limited | no | no |
| `membership.*` | Y | Y | no | read | no | no | no |
| `channel.manage` | Y | Y | no | no | assigned | no | no |
| `support.tenant.read` | n/a | n/a | n/a | n/a | n/a | n/a | platform support only |

“assigned” means authorized centers only.

### Calendar phase-two read permissions

**Proposed, explicitly approved -- Source:** the product owner confirmed the calendar phase-two recommendation on 2026-10-01 and subsequently requested documentation. This owns the new `booking.read` matrix row and permission separation for [the bounded calendar read scope](../booking/SPEC-DIVE-BOOKING-SCHEDULING-001.md#calendar-phase-two-read-scope); it does not promote this artifact, implement grants or approve still-open read/audit transports.

**Proposed, explicitly approved:** grant existing `booking.read` to Tenant Owner, Tenant Admin, Operations Lead and Auditor/Compliance; grant it to Center Manager and Reception / Booking Manager only in their assigned centers. Public callers receive no dashboard booking-read grant. This closes the previously incomplete role grants for this permission, not `booking.update` or unrelated permissions. Auditor remains read-only; a read grant never implies booking creation, confirmation, cancellation, rejection or structural editing.

**Proposed, explicitly approved:** calendar summaries require `calendar.read`; the selected execution's operational booking list requires `booking.read`. The subsequent concrete recommendation approved on 2026-10-01 selects `GET /v1/centers/:centerId/bookings/:bookingId/contact` with both `booking.read` and `customer_contact.read`, subject to the same booking/center scope and purpose-limited audit. Neither permission alone exposes contacts. Request the existing contact data only when the user explicitly opens contact detail; do not place names/emails in calendar events, the operational booking list, URLs or logs. [Scheduling concrete read refinements](../booking/SPEC-DIVE-BOOKING-SCHEDULING-001.md#concrete-phase-two-read-refinements) own transport/representation and remaining metadata questions.

**Proposed, explicitly approved:** reuse existing `booking.read` and `customer_contact.read` audit actions and the existing tenant-scoped audit mechanism. The subsequent implementation-convention recommendation, whose registration the product owner authorized on 2026-10-01, retains the required actor/resource/result identifiers while excluding names, email addresses, phone numbers and contact request/response payloads from audit/log records. This supersedes the earlier overly broad personal-data exclusion; audit identifiers remain subject to their owning privacy/retention duties. [Audit actions/results](../../packages/contracts/src/index.ts), [audit schema](../../packages/database/src/iam-schema.ts) and [scheduling conventions](../booking/SPEC-DIVE-BOOKING-SCHEDULING-001.md#calendar-phase-two-implementation-conventions) are the reuse references, not proof of route coverage. No new read-generated outbox event is selected; the later [confirmed audit contract](#calendar-phase-two-read-audit-proposal) selects granularity, purpose metadata and allow/deny timing under its separate 2026-10-01 confirmation, without extending historical approval.

**Documented:** `DIVE-IAM-REQ-003`, `015`, `025`, `028` and [dashboard application scope](SPEC-DIVE-IAM-DASHBOARD-001.md), `DIVE-IAM-REQ-030..032`, continue to govern current membership, tenant/center/resource checks, sensitive-read audit and negative tests. Tenant-wide roles do not bypass the confirmed center-application restriction. The new matrix row is approval of grants, not evidence that PostgreSQL, the API or BFF already enforces them.

Expected checks, not executed proof: each named role's read grant/denial; assigned versus unassigned centers; Auditor read without writes; operational booking reads without contact disclosure; both contact-read permissions and purpose-limited audit retaining required identifiers without contact values/payloads; public denial; cross-tenant, cross-center and application A/B denial through the existing trusted boundaries. No new permission key or automatic grant migration is selected.

### Calendar phase-two read audit proposal

**Proposed, explicitly approved -- Source and limits:** product-owner direction on 2026-10-01 authorized selecting and documenting the remaining calendar read-audit solutions, followed by explicit confirmation of this concrete block and the Scheduling block on the same date. The choices retain Proposed provenance and are now approved without artifact status promotion. This contract adds no permission, role, audit action/result vocabulary or outbox event. It specifies the existing mechanism's use for the three [phase-two read contracts](../booking/SPEC-DIVE-BOOKING-SCHEDULING-001.md#calendar-phase-two-remaining-contract-solutions), not application-wide audit coverage.

**Proposed -- One audit record per authorized read request:** calendar pages use action `booking.read`, resource type `center` and the resolved center ID; booking-list pages use action `booking.read`, resource type `slot` and the selected slot ID; contact reads use action `customer_contact.read`, resource type `booking` and the selected booking ID. Audit-action naming is not a substitute for each route's separately selected permission requirements. Empty calendar/booking pages still produce one success record, not one record per returned row. A contact request requires both permissions but produces one contact-read record, not duplicate success records for permission checks.

**Proposed -- Purpose and metadata:** use server-selected purpose `calendar_operations` for calendar pages and `booking_operations` for booking lists/contact details. Do not accept a client-supplied purpose or free-text justification on these GETs. Retain the trusted tenant, verified actor identity, resource, result, correlation ID and audit timestamp under the [audit schema](../../packages/database/src/iam-schema.ts). Allow source metadata only for the resolved `centerId` and, for a booking contact's validated relation, `slotId`; exclude contact values/payloads, raw URLs/query strings and resource names. These identifiers retain existing privacy/retention duties and are not treated as anonymous.

**Proposed -- Success and failure timing:** obtain the authorized read and append its `success` record in the same tenant-scoped transaction, then commit before returning any response data. This is an audited read, not a booking lifecycle mutation or an outbox-producing command. If auditing/commit fails, discard the result and return the existing generic operational failure; never return contacts or a successful page whose required audit was rolled back. Do not record success for a failed query, validation rejection or aborted transaction. Successful delivery is not guaranteed merely because a committed audit exists; disconnected callers do not trigger read-side retries.

**Proposed -- Denial handling:** use the existing `denied` result and structured denial reason vocabulary. Where the security owner has already established a trusted tenant and actor context, record permission/scope/resource denial once, before returning its existing non-disclosing error. Record the denial in a committed tenant-scoped audit transaction that survives the failed read transaction; do not swallow it in a rollback or expose contact fields while checking access. A syntactically valid requested resource UUID can identify a denied attempt without asserting that the resource exists. Never establish tenant context from URL input solely to audit a denial. For unauthenticated/unresolved-tenant requests, malformed identifiers and input-validation failures, keep the existing admission/security/error handling and do not manufacture a tenant-owned read audit. An audit persistence failure remains an operational failure, not a success or a reason to bypass RLS.

Expected checks, not executed evidence: one record for each successful request including empty pages; selected action/resource/purpose metadata; a single contact record with both permissions enforced; no contacts or raw URLs in records/logs; denied-read persistence surviving rollback; no fabricated tenant for admission/validation failures; audit/commit failure suppressing all response data; cross-tenant/center/application denial and correlation propagation. Product-owner confirmation of this block on 2026-10-01 closes its decision gate, not the required implementation/review/validation gates or proof that existing primitives/routes satisfy it.

### Commercial profile and policy permissions

**Proposed, explicitly approved:** the seven-block product-owner acceptance on 2026-10-01 selects `center_profile.update` and `cancellation_policy.manage`. Grant both to Tenant Owner, Tenant Admin and Center Manager in assigned centers only; deny Operations Lead, Auditor, Reception and public callers. These grants remain subject to authenticated identity, active membership, trusted tenant/application context, center scope and resource state under `DIVE-IAM-REQ-003`, not client-selected authority.

**Proposed, explicitly approved:** dashboard public-profile GET requires existing `center.read`; PUT requires `center_profile.update`. Commercial catalog content retains its existing catalog permissions. Policy management is separate from channel enablement, which retains `channel.manage`; neither new write permission grants publication. Public channels can expose only their authorized safe projection, not the dashboard profile route or internal policy-management surface. [Catalog](../booking/SPEC-DIVE-BOOKING-CATALOG-001.md#accepted-commercial-refinements) owns profile/policy content and channel-readiness direction; HTTP, migration and public projection details remain with their owners.

Expected checks, not executed proof: each role's read/write grants and denials; assigned versus unassigned centers; cross-tenant and application-scope denial; Reception/Auditor read without write; and profile/policy mutation without implied channel enablement. No new permission is inferred for staff cancellation requests or unscheduled booking.

## Dependencies

- ADR-DIVE-001, ADR-DIVE-002, ADR-DIVE-007, ADR-DIVE-008
- `specs/foundation/iam-baseline.md`
- `specs/booking/SPEC-DIVE-BOOKING-001.md` for public capabilities
- `specs/multitenancy/adoption-profile.md`
- `specs/onboarding/SPEC-DIVE-ONBOARDING-001.md` (approved pre-tenant bootstrap boundary; its marked recovery-lookup follow-up remains Draft)

## Tests and expected evidence

- Membership and role assignment tests
- Center-scope negative tests
- Public channel and token negative tests
- Revocation timing test or documented measurement
- Support access expiry test
- Dashboard routes without `/tenants/:tenantId`; old tenant-path shapes rejected; handle/session/identity mismatch; automatic and explicit operator selection; non-disclosing invalid `operatorRef`; center-entry without `operatorRef`; required equality of `centerRef` and host-derived `centerKey`; non-disclosing missing, mismatched, or unauthorized selection; no cross-center mix in a center application
- Center-entry lifecycle tests must cover Owner/Admin authority, manager denial, active/disabled resolution, reversible state changes, immutable key preservation, cross-tenant denial, non-empty purpose, and tenant-scoped audit

## Open questions

**Documented:** permission keys include the approved `center_entry.manage`. The [calendar phase-two decision](#calendar-phase-two-read-permissions) closes `booking.read` role grants; concrete read/audit choices in the [confirmed audit contract](#calendar-phase-two-read-audit-proposal) and scheduling owner were explicitly approved on 2026-10-01, with implementation/review/proof still pending. Explicit grants for `booking.update`, `availability.read`, `channel.read` and `audit.export` are not completely specified by the matrix; resolve them before their routes rely on an inferred grant. ADR-DIVE-014 closes pagination, catalog DTO and physical-name decisions. Ordinary invitation transport follows its own owner; bootstrap is Ready to start, not Draft.
