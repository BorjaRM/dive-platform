# ADR-DIVE-013 — Controlled self bootstrap and replaceable guided onboarding

- **Status:** Ready to start
- **Version:** 0.4
- **Date:** 2026-09-28
- **Deciders:** Product / Security / Frontend Architecture
- **Affected IDs:** `DIVE-ONB-REQ-001..050`; `DIVE-IAM-REQ-001..006`, `017`, `020`, `024`, `025`, `029..032`

## Provenance

| Decision | Provenance | Exact source | Approval / status |
|---|---|---|---|
| Clerk authenticates; PostgreSQL owns memberships and authorization | `Documented` | `SPEC-DIVE-IAM-001` `DIVE-IAM-REQ-001..006`; `ADR-DIVE-008` § Responsibility split | Existing normative constraint |
| Tenant creation and first-center creation are the first walking-skeleton increment | `Documented` | `specs/product/dive-mvp-profile.md` §6 | Existing product direction; no onboarding contract existed |
| Reliable side effects use the transactional outbox | `Documented` | `ADR-DIVE-002` § Decision | Existing normative constraint |
| US-19 is self bootstrap by an invited future Owner; assisted provisioning is outside the MVP story | `Proposed` | PR #36 product-owner revision record | Approved for implementation; Product owner confirmation 2026-09-28 after merged PR #62 |
| Controlled invitation, atomic creation, idempotency, fields, limits, rollout, and acceptance matrix | `Proposed` | PR #36 product-owner revision record; `SPEC-DIVE-ONBOARDING-001` Draft | Approved for implementation; Product owner confirmation 2026-09-28 after merged PR #62 |
| Driver.js behind a replaceable renderer, local visual state, versioned content port, and no-op analytics port | `Proposed` | PR #36 product-owner revision record; `SPEC-DIVE-ONBOARDING-001` Draft | Approved for implementation; Product owner confirmation 2026-09-28 after merged PR #62 |
| Login-only public entry, single-use fragment credential, internal platform capabilities and routes | `Proposed` | Product confirmation 2026-09-28; `SPEC-DIVE-ONBOARDING-001` v0.3 Draft | Approved for implementation; Product owner confirmation 2026-09-28 after merged PR #62 |
| Transactional `centerKey` mapping, encrypted delivery envelope, physical persistence, retention, audit, and event contract | `Proposed` | Product confirmation 2026-09-28; `SPEC-DIVE-ONBOARDING-001` v0.3 Draft | Approved for implementation; Product owner confirmation 2026-09-28 after merged PR #62 |
| Active-membership revalidation and handle invalidation | `Derived` | `SPEC-DIVE-IAM-001` `DIVE-IAM-REQ-022`, `030..031`; product confirmation 2026-09-28 | Approved for implementation; Product owner confirmation 2026-09-28 after merged PR #62 |

## Context

The walking skeleton assumes that a tenant and center can be created, but no approved product contract currently allows a future operator Owner to bootstrap itself. IAM starts from an authenticated identity and existing membership. The flow therefore needs a controlled pre-tenant invitation boundary without making the browser, Clerk Organization, platform support, or a tour library authoritative.

The MVP decision is intentionally narrower than an assisted-provisioning model: platform staff may manage bootstrap invitations, but they do not create the tenant, center, or Owner membership for the customer. A guided experience must remain replaceable and must not duplicate the functional flow.

## Decision

### Pre-tenant authority

- The public authentication screen exposes ordinary login only: no public operator signup, bootstrap-invitation discovery, manual code entry, or operator creation.
- Platform identities use the PostgreSQL-authoritative `bootstrap_invitation.read|issue|reissue|revoke` capabilities, independent of tenant memberships and read-only support. Mutations require MFA, a reason, and audit.
- Platform staff do not create the tenant or center, designate an Owner, confirm customer data, or receive a tenant membership through this flow.
- A redemption is authenticated by Clerk, initially matched through the invited verified email, and then bound by `issuer + subject`. The fragment credential authorizes bootstrap only, never authentication; opening the link does not consume it.
- Existing memberships and tenant roles neither grant nor deny this pre-tenant capability.

### Self-bootstrap use case

The application exposes one provisioning command for US-19:

- `CompleteOwnTenantBootstrap`

Invitation management remains separate:

- `IssueTenantBootstrapInvitation` — `POST /v1/platform/bootstrap-invitations`
- safe status read — `GET /v1/platform/bootstrap-invitations/:invitationId`
- `ReissueTenantBootstrapInvitation` — `POST /v1/platform/bootstrap-invitations/:invitationId/reissue`
- `RevokeTenantBootstrapInvitation` — `POST /v1/platform/bootstrap-invitations/:invitationId/revoke`

The invited identity completes through `POST /v1/me/tenant-bootstrap`. The email link uses the canonical authentication host with its opaque credential in the URL fragment; the browser submits it only in the HTTPS body after Clerk authentication or identity creation. The credential never enters routes, query strings, referrers, logs, audit, traces, analytics, or events.

The invited authenticated identity becomes the initial active Tenant Owner. Assisted provisioning is deferred and requires a separate story, SPEC/ADR decision, explicit approval, and stronger controls before it can enter scope.

### Transaction and operability

One PostgreSQL transaction persists the tenant, first center, active Owner membership, invitation consumption, audit, and outbox. External effects occur only after commit through the outbox worker.

Operability is derived from the active Tenant Owner membership; no duplicate tenant lifecycle status is added. The bootstrap invitation is the idempotency key. Store a normalized request fingerprint and result reference; replay the same payload, conflict on a different payload, and serialize concurrent consumption with row locking and database uniqueness.

The server allocates an immutable, non-reserved `centerKey` from a readable normalized candidate plus a stable collision suffix when required. The bootstrap transaction persists the trusted `centerKey -> tenantId + centerId` mapping. MVP host readiness relies on wildcard platform DNS/TLS; mapping failure rolls back the entire bootstrap and leaves the invitation unconsumed. Custom domains remain out of scope.

`tenant_bootstrap_invitations` owns invitation authority and terminal results. `tenant_bootstrap_delivery_envelopes` holds the separately encrypted temporary secret needed by the outbox worker. Delivery success, revocation, or expiry deletes the envelope; permanent failure requires reissue. Reissue atomically supersedes the prior invitation and credential. Terminal invitation records are retained for 90 days; audit follows the platform security retention policy.

Audit uses the stable actions `tenant_bootstrap_invitation.issued`, `.reissued`, `.revoked`, `.delivery_failed`, `tenant_bootstrap.completed`, and `tenant_bootstrap.denied`. Successful completion emits `tenant.bootstrap.completed.v1` with tenant, center, membership, invitation, occurrence, and correlation references only.

### Membership and revocation boundary

Every protected request revalidates the handle binding, active membership, current roles, permissions, and center scope in PostgreSQL. Disabling a membership invalidates all handles for that membership and prevents renewal without affecting another active membership of the same global identity. An authenticated identity without an active membership receives no tenant context and only a neutral no-access state. Invalid authentication returns generic `401`; authorization denial returns generic `403`. Both use non-disclosing contracts without tenant, center, membership, invitation, or resource disclosure.

### Guided experience boundary

Define application-owned ports:

```text
GuidanceRenderer
GuideContentSource
GuideAnalytics
```

Only the Driver.js adapter imports Driver.js. Guides reference stable application anchors and semantic domain outcomes; they do not own routes, forms, server mutations, authorization, or completion rules.

The functional onboarding path works with a no-op renderer. Driver.js is loaded only when guidance is enabled.

The confirmed closure uses `localStorage` key `dive:guide:<opaqueIdentityRef>:<guideId>`, where the opaque identity reference is neither personal data nor authorization authority, whose value contains `schemaVersion`, `status`, and `lastSeenGuideVersion` only for `dismissed` / `completed` visual preferences. It never stores functional progress, authorization, invitation secrets, Clerk tokens, form contents, or `X-Tenant-Context`.

A guide does not auto-replay after dismissal/completion or merely because content changes. Manual replay is available through `Help → Repeat guide`.

### Fields and presentation

The bootstrap collects only operator display name, first-center display name, confirmed IANA time zone, and editable `es` / `en` user preference. It does not ask for an assisted mode or a second Owner email.

The confirmed name contract normalizes names to Unicode NFC, trims outer whitespace, and measures 1–120 Unicode code points identically in client and server. Names are not globally unique and never authorize access. Billing, fiscal, payment, public-contact, custom-domain, and additional-center data remain outside this flow.

Guide content ships in versioned repository catalogs behind `GuideContentSource`. A future CMS can replace the source without changing product flows or renderer contracts.

`GuideAnalytics` exposes typed `started`, `dismissed`, `completed`, and `restarted` signals. Its MVP implementation is no-op and sends no external analytics.

### Accessibility and rollout

The complete guided experience targets WCAG 2.2 AA before pilot and never blocks the underlying form when a target is absent.

Provisioning and visual guidance use independent rollout controls. Provisioning is limited to explicitly invited identities; platform staff are limited to invitation management.

## Consequences

### Positive

- Product behavior remains independent of Driver.js and can adopt another renderer later.
- The same functional forms work guided or unguided.
- Pre-tenant authority does not leak into tenant roles or read-only support.
- Atomic persistence and outbox prevent orphaned tenants and pre-commit emails.
- The customer Owner confirms the data and becomes active in the same bootstrap transaction.

### Costs and risks

- A pre-tenant invitation store, capability, transaction path, and audit surface must be implemented.
- Verified-email matching is an additional bootstrap-only assurance beyond ordinary dashboard authentication.
- `localStorage` preference does not follow the user across devices.
- Driver.js accessibility claims do not replace product-level WCAG validation.
- The wildcard DNS/TLS boundary and transactional mapping reduce per-center provisioning, but their deployment configuration remains operationally critical.
- Encrypted delivery envelopes require key rotation and deletion controls.

## Alternatives considered

### Driver.js imported directly by forms

Rejected. It couples domain flow and presentation, making later replacement expensive and allowing UI callbacks to become completion authority.

### Duplicate guided wizard

Rejected. It would create a second implementation of validation, mutations, and navigation that can diverge from the normal flow.

### Server-persisted guide preferences

Deferred. `localStorage` is sufficient for non-authoritative MVP visual state; cross-device consistency is not required.

### Clerk Organization

Not selected. PostgreSQL remains authoritative for tenant membership and authorization.

### Public signup

Rejected for this scope. Bootstrap requires a platform-issued invitation.

## Acceptance criteria / evidence

The implementation must satisfy `SPEC-DIVE-ONBOARDING-001` `DIVE-ONB-REQ-001..050` and its acceptance matrix through domain/API, component, Playwright, isolation, security, and manual accessibility evidence.

This Ready-to-start decision record authorizes reversible implementation with synthetic data but provides no implementation, migration, test, or pilot evidence.

## Open questions

No blocking product decision remains in this Draft revision. Readiness review must still verify internal consistency, operational ownership, and testability. Concrete provider and deployment adapter selection remains implementation work only when it preserves this decision.

## Implementation authority

Ready to start: reversible implementation with synthetic data is authorized. Review, Accepted, real personal data, and pilot gates still require their own evidence and explicit approval.
