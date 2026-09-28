# ADR-DIVE-013 — Controlled self bootstrap and replaceable guided onboarding

- **Status:** Draft
- **Version:** 0.5
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
| Clerk Application Invitations own identity ticket/email; PostgreSQL owns the bootstrap grant; Clerk Organizations and metadata authority remain excluded | `Proposed` | [Clerk invitations](https://clerk.com/docs/guides/users/inviting); [custom flow](https://clerk.com/docs/guides/development/custom-flows/authentication/application-invitations); product confirmation 2026-09-28 selecting option B | Approved for Draft review; provider-behavior evidence pending |
| Transactional `centerKey`, pre-tenant outbox, Clerk worker adapter, provider-reference persistence, retention, audit, and completion event | `Proposed` | [Clerk createInvitation](https://clerk.com/docs/reference/backend/invitations/create-invitation); `SPEC-DIVE-ONBOARDING-001` v0.5 Draft; product confirmation 2026-09-28 | Approved for Draft review; worker/security review pending |
| Active-membership revalidation and handle invalidation | `Derived` | `SPEC-DIVE-IAM-001` `DIVE-IAM-REQ-022`, `030..031`; product confirmation 2026-09-28 | Approved for implementation; Product owner confirmation 2026-09-28 after merged PR #62 |

## Context

The walking skeleton assumes that a tenant and center can be created, but no approved product contract currently allows a future operator Owner to bootstrap itself. IAM starts from an authenticated identity and existing membership. The flow therefore needs a controlled pre-tenant invitation boundary without making the browser, Clerk Organization, platform support, or a tour library authoritative.

The MVP decision is intentionally narrower than an assisted-provisioning model: platform staff may manage bootstrap invitations, but they do not create the tenant, center, or Owner membership for the customer. A guided experience must remain replaceable and must not duplicate the functional flow.

## Decision

### Pre-tenant authority

- The Clerk application uses invite-only access mode. The public authentication screen exposes ordinary login only: no public operator signup, bootstrap-invitation discovery, manual code entry, or operator creation.
- Platform identities use the PostgreSQL-authoritative `bootstrap_invitation.read|issue|reissue|revoke` capabilities, independent of tenant memberships and read-only support. Mutations require MFA, a reason, and audit.
- Platform staff do not create the tenant or center, designate an Owner, confirm customer data, or receive a tenant membership through this flow.
- Clerk Application Invitations own identity enrollment, provider ticket, email delivery, seven-day expiry, revocation, and redirect to the exact authentication-host acceptance route. PostgreSQL owns a separate bootstrap grant and remains the sole authority for tenant, center, Owner, and completion. The application issues no second bearer and uses no Clerk Organization or Clerk metadata as business authority.
- Existing memberships and tenant roles neither grant nor deny this pre-tenant capability.

### Self-bootstrap use case

The application exposes one provisioning command for US-19:

- `CompleteOwnTenantBootstrap`

Invitation management remains separate:

- `IssueTenantBootstrapInvitation` — `POST /v1/platform/bootstrap-invitations`
- safe status read — `GET /v1/platform/bootstrap-invitations/:invitationId`
- `ReissueTenantBootstrapInvitation` — `POST /v1/platform/bootstrap-invitations/:invitationId/reissue`
- `RevokeTenantBootstrapInvitation` — `POST /v1/platform/bootstrap-invitations/:invitationId/revoke`

The invited identity accepts Clerk’s Application Invitation through the Clerk signup/sign-in flow, then completes through `POST /v1/me/tenant-bootstrap` without a provider ticket or application bearer in the request body. The server resolves one pending grant from the authenticated `issuer + subject` and verified normalized email. Clerk’s `__clerk_ticket` is confined to the provider custom flow and is removed from application-visible history and excluded from referrers, logs, audit, traces, analytics, errors, and events.

The invited authenticated identity becomes the initial active Tenant Owner. Assisted provisioning is deferred and requires a separate story, SPEC/ADR decision, explicit approval, and stronger controls before it can enter scope.

### Transaction and operability

One PostgreSQL transaction persists the tenant, first center, active Owner membership, invitation consumption, audit, and outbox. External effects occur only after commit through the outbox worker.

Operability is derived from the active Tenant Owner membership; no duplicate tenant lifecycle status is added. The bootstrap invitation is the idempotency key. Store a normalized request fingerprint and result reference; replay the same payload, conflict on a different payload, and serialize concurrent consumption with row locking and database uniqueness.

The server allocates an immutable, non-reserved `centerKey` from a readable normalized candidate plus a stable collision suffix when required. The bootstrap transaction persists the trusted `centerKey -> tenantId + centerId` mapping. MVP host readiness relies on wildcard platform DNS/TLS; mapping failure rolls back the entire bootstrap and leaves the invitation unconsumed. Custom domains remain out of scope.

`tenant_bootstrap_grants` owns bootstrap authority and terminal results. A dedicated `tenant_bootstrap_outbox_events` boundary carries pre-tenant create/revoke/reissue commands because the tenant-scoped outbox cannot represent an invitation before a tenant exists. After commit, the worker calls Clerk and stores only the provider invitation reference plus safe status; it never receives product authority or tenant membership. No Clerk ticket, application bearer, encrypted delivery envelope, or email body is persisted. Reissue supersedes the PostgreSQL grant immediately, then asynchronously revokes the prior Clerk invitation and creates another. Terminal grants and safe provider references are retained for 90 days; audit follows the platform security retention policy.

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
- Atomic grant persistence plus the pre-tenant outbox prevent provider calls before commit; completion atomicity prevents orphaned tenants.
- The customer Owner confirms the data and becomes active in the same bootstrap transaction.

### Costs and risks

- A pre-tenant invitation store, capability, transaction path, and audit surface must be implemented.
- Clerk invite-only enrollment and verified-email matching are additional bootstrap-only assurances beyond ordinary dashboard authentication.
- `localStorage` preference does not follow the user across devices.
- Driver.js accessibility claims do not replace product-level WCAG validation.
- The wildcard DNS/TLS boundary and transactional mapping reduce per-center provisioning, but their deployment configuration remains operationally critical.
- Clerk becomes an external dependency for invitation delivery; rate limits, redirect handling, existing-identity behavior, revocation lag, and provider outages require explicit tests and safe retry/reconciliation.

## Alternatives considered

### Driver.js imported directly by forms

Rejected. It couples domain flow and presentation, making later replacement expensive and allowing UI callbacks to become completion authority.

### Duplicate guided wizard

Rejected. It would create a second implementation of validation, mutations, and navigation that can diverge from the normal flow.

### Server-persisted guide preferences

Deferred. `localStorage` is sufficient for non-authoritative MVP visual state; cross-device consistency is not required.

### Application-owned bearer and email delivery

Superseded by option B. A second application bearer, secret hash, encrypted delivery envelope, and separate email-provider integration duplicate Clerk Application Invitation behavior and increase secret handling. PostgreSQL retains the grant and domain authority, not another emailed credential.

### Clerk Organization

Not selected. PostgreSQL remains authoritative for tenant membership and authorization.

### Public signup

Rejected for this scope. Bootstrap requires a platform-issued invitation.

## Acceptance criteria / evidence

The implementation must satisfy `SPEC-DIVE-ONBOARDING-001` `DIVE-ONB-REQ-001..050` and its acceptance matrix through domain/API, component, Playwright, isolation, security, Clerk Development, and manual accessibility evidence.

This Draft revision changes the provider boundary and provides no implementation, migration, test, or pilot evidence.

## Open questions

Blocking provider questions remain: validate new-identity and existing-identity invitation acceptance, including `ignoreExisting`; invite-only behavior for existing sign-in; exact redirect and `__clerk_ticket` cleanup/referrer behavior; revoke/reissue ordering; and `429`/`Retry-After` handling. Clerk Development evidence must close these questions before a new Ready-to-start promotion.

## Implementation authority

None while Draft. The previously Ready-to-start application-owned bearer contract is superseded by option B. Implementation issues must wait for provider evidence, review, and a new explicit Ready-to-start promotion.
