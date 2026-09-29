# ADR-DIVE-013 — Controlled self bootstrap and replaceable guided onboarding

- **Status:** Ready to start
- **Version:** 0.7
- **Date:** 2026-09-29
- **Deciders:** Product / Security / Frontend Architecture
- **Affected IDs:** `DIVE-ONB-REQ-001..050`; `DIVE-IAM-REQ-001..006`, `017`, `020`, `024`, `025`, `029..032`

## Provenance

| Decision | Provenance | Exact source | Approval / status |
|---|---|---|---|
| Clerk authenticates; PostgreSQL owns memberships and authorization | `Documented` | `SPEC-DIVE-IAM-001` `DIVE-IAM-REQ-001..006`; `ADR-DIVE-008` § Responsibility split | Existing normative constraint |
| Tenant creation and first-center creation are the first walking-skeleton increment | `Documented` | `specs/product/dive-mvp-profile.md` §6 | Existing product direction; no onboarding contract existed |
| Reliable side effects use the transactional outbox | `Documented` | `ADR-DIVE-002` § Decision | Existing normative constraint |
| US-19 is self bootstrap by an invited future Owner; assisted provisioning is outside the MVP story | `Proposed` | PR #36 product-owner revision record | Approved for implementation; Product owner confirmation 2026-09-28 after merged PR #62 |
| Controlled invitation, atomic creation, idempotency, fields, limits, rollout, and acceptance matrix | `Proposed` | PR #36 product-owner revision record; `SPEC-DIVE-ONBOARDING-001` Ready to start | Approved for implementation; Product owner confirmation 2026-09-28 after merged PR #62 |
| Driver.js behind a replaceable renderer, local visual state, versioned content port, and no-op analytics port | `Proposed` | PR #36 product-owner revision record; `SPEC-DIVE-ONBOARDING-001` Ready to start | Approved for implementation; Product owner confirmation 2026-09-28 after merged PR #62 |
| Clerk Application Invitations own identity ticket/email; dedicated acceptance and setup routes keep signup out of `/dashboard`; PostgreSQL owns the bootstrap grant; Clerk Organizations and metadata authority remain excluded | `Proposed` | [Clerk invitations](https://clerk.com/docs/guides/users/inviting); [custom flow](https://clerk.com/docs/guides/development/custom-flows/authentication/application-invitations); [Next.js sign-up component](https://clerk.com/docs/nextjs/reference/components/authentication/sign-up); `specs/spikes/SPIKE-DIVE-004/results.md`; product confirmation 2026-09-29 | Provider behavior demonstrated; approved for Ready-to-start promotion 2026-09-29 |
| Transactional `centerKey`, pre-tenant outbox, Clerk worker adapter, provider-reference persistence, retention, audit, and completion event | `Proposed` | [Clerk createInvitation](https://clerk.com/docs/reference/backend/invitations/create-invitation); `SPEC-DIVE-ONBOARDING-001` v0.7 Ready to start; `specs/multitenancy/MT-SPIKE-001-specification.md` `MT-COND-WORKER-001`; product confirmation 2026-09-29 | Approved for Ready-to-start promotion; worker retry/backoff/exhaustion and dead-letter policy remains an activation gate before external effects |
| Bootstrap grants and ordinary tenant invitations are separate authority kinds and cannot consume or activate each other | `Derived` | `SPEC-DIVE-IAM-001` `DIVE-IAM-REQ-017`; `ADR-DIVE-004` §§ Invitation and identity binding / Lifecycle; product confirmation 2026-09-29 | Approved for Ready-to-start promotion; cross-kind negative tests remain implementation evidence |
| Active-membership revalidation and handle invalidation | `Derived` | `SPEC-DIVE-IAM-001` `DIVE-IAM-REQ-022`, `030..031`; product confirmation 2026-09-28 | Approved for implementation; Product owner confirmation 2026-09-28 after merged PR #62 |

## Context

The walking skeleton assumes that a tenant and center can be created, but no approved product contract currently allows a future operator Owner to bootstrap itself. IAM starts from an authenticated identity and existing membership. The flow therefore needs a controlled pre-tenant invitation boundary without making the browser, Clerk Organization, platform support, or a tour library authoritative.

The MVP decision is intentionally narrower than an assisted-provisioning model: platform staff may manage bootstrap invitations, but they do not create the tenant, center, or Owner membership for the customer. A guided experience must remain replaceable and must not duplicate the functional flow. This pre-tenant grant is distinct from the ordinary tenant invitation in `DIVE-IAM-REQ-017` and `ADR-DIVE-004`, which belongs to an existing tenant and can only activate its linked pending membership.

## Decision

### Pre-tenant authority

- The Clerk application uses invite-only access mode. `/sign-in/[[...sign-in]]` exposes ordinary login only: no public operator signup, bootstrap-invitation discovery, manual code entry, or operator creation. `/dashboard` remains protected, redirects signed-out users to that sign-in route, and never renders `<SignUp />` or bootstrap data entry.
- Platform identities use the PostgreSQL-authoritative `bootstrap_invitation.read|issue|reissue|revoke` capabilities, independent of tenant memberships and read-only support. Mutations require MFA, a reason, and audit.
- Platform staff do not create the tenant or center, designate an Owner, confirm customer data, or receive a tenant membership through this flow.
- Clerk Application Invitations own identity enrollment, provider ticket, email delivery, seven-day expiry, revocation, and redirect to the exact authentication-host acceptance route. PostgreSQL owns a separate bootstrap grant and remains the sole authority for tenant, center, Owner, and completion. The application issues no second bearer and uses no Clerk Organization or Clerk metadata as business authority.
- Existing memberships and tenant roles neither grant nor deny this pre-tenant capability.

### Boundary from ordinary tenant invitations

- A bootstrap grant has no tenant or pending membership before completion and can create exactly one tenant, first center, and initial Owner membership.
- An ordinary IAM invitation belongs to one existing tenant, creates one unbound `pending` membership with immutable roles and center scopes, and can only bind and activate that membership. It cannot create a tenant, center, or initial Owner through US-19.
- Bootstrap and ordinary invitation flows use separate application commands, persistence records, acceptance boundaries, audit actions, outbox purposes, and idempotency namespaces. This ADR does not change the ordinary invitation credential or delivery contract in `ADR-DIVE-004`.
- Clerk authentication, a Clerk ticket, redirect route, email match, browser state, and provider metadata never select the domain authority kind. The invoked server command must resolve exactly one record of its expected kind from PostgreSQL and reject absent, multiple, mismatched, or wrong-kind records without disclosure.
- A provider invitation reference maps to exactly one application record kind. It cannot be replayed across bootstrap and ordinary invitation commands, and neither flow may consume, supersede, revoke, or activate the other flow's record.

### Self-bootstrap use case

The application exposes one provisioning command for US-19:

- `CompleteOwnTenantBootstrap`

Invitation management remains separate:

- `IssueTenantBootstrapInvitation` — `POST /v1/platform/bootstrap-invitations`
- safe status read — `GET /v1/platform/bootstrap-invitations/:invitationId`
- `ReissueTenantBootstrapInvitation` — `POST /v1/platform/bootstrap-invitations/:invitationId/reissue`
- `RevokeTenantBootstrapInvitation` — `POST /v1/platform/bootstrap-invitations/:invitationId/revoke`

The web boundary is split into four routes:

| Route | Responsibility |
|---|---|
| `/sign-in/[[...sign-in]]` | Ordinary login only; no public signup or invitation discovery |
| `/bootstrap/accept` | Public, ticket-aware Clerk invitation acceptance controller |
| `/bootstrap/setup` | Authenticated self-bootstrap form and `POST /v1/me/tenant-bootstrap` client |
| `/dashboard` | Protected post-authentication product route; signed-out users are redirected to sign-in |

The invitation adapter sets `/bootstrap/accept` as the exact allowlisted `redirectUrl`. The acceptance controller handles four states: a new invited identity may complete Clerk enrollment; an existing invited identity signs in; an already-authenticated matching identity may continue after the PostgreSQL grant check; and a different authenticated identity is denied neutrally and may switch account. It does not render `<SignUp />` for an already-authenticated session. Clerk prebuilt components or a custom flow are adapter choices only if they satisfy this matrix.

Clerk’s `__clerk_ticket` is confined to the acceptance-route query, consumed by the Clerk SDK, and removed with history replacement before navigation to `/bootstrap/setup`. The acceptance route applies `Referrer-Policy: no-referrer`. The ticket is excluded from setup/dashboard URLs, referrers, logs, audit, traces, analytics, errors, and events. The setup page then completes through `POST /v1/me/tenant-bootstrap` without a provider ticket or application bearer in the request body. The server resolves one pending bootstrap grant from the authenticated `issuer + subject` and verified normalized email. It does not query or consume an ordinary IAM invitation or activate an existing pending membership. Successful completion navigates to `/dashboard`.

The invited authenticated identity becomes the initial active Tenant Owner. Assisted provisioning is deferred and requires a separate story, SPEC/ADR decision, explicit approval, and stronger controls before it can enter scope.

### Transaction and operability

One PostgreSQL transaction persists the tenant, first center, active Owner membership, invitation consumption, audit, and outbox. External effects occur only after commit through the outbox worker.

Operability is derived from the active Tenant Owner membership; no duplicate tenant lifecycle status is added. The bootstrap invitation is the idempotency key. Store a normalized request fingerprint and result reference; replay the same payload, conflict on a different payload, and serialize concurrent consumption with row locking and database uniqueness.

The server allocates an immutable, non-reserved `centerKey` from a readable normalized candidate plus a stable collision suffix when required. The bootstrap transaction persists the trusted `centerKey -> tenantId + centerId` mapping. MVP host readiness relies on wildcard platform DNS/TLS; mapping failure rolls back the entire bootstrap and leaves the invitation unconsumed. Custom domains remain out of scope.

`tenant_bootstrap_grants` owns bootstrap authority and terminal results, physically and logically separate from ordinary IAM invitation and pending-membership records. A dedicated `tenant_bootstrap_outbox_events` boundary carries pre-tenant create/revoke/reissue commands because the tenant-scoped outbox cannot represent an invitation before a tenant exists. After commit, the worker calls Clerk and stores only the provider invitation reference plus safe status; it never receives product authority or tenant membership. No Clerk ticket, application bearer, encrypted delivery envelope, or email body is persisted. Reissue supersedes the PostgreSQL grant immediately, then asynchronously revokes the prior Clerk invitation and creates another. Terminal grants and safe provider references are retained for 90 days; audit follows the platform security retention policy.

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

- A pre-tenant invitation store, capability, transaction path, and audit surface must be implemented and kept separate from ordinary tenant invitations.
- Cross-kind confusion must be rejected and tested so an employee invitation cannot create a tenant and a bootstrap grant cannot activate a pre-existing tenant membership.
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

This revision changes the provider boundary. `specs/spikes/SPIKE-DIVE-004/results.md` supplies the bounded Clerk Development evidence required to close the provider-selection questions; implementation, migration, product-route, worker, deployed-host, accessibility, and pilot evidence remain future gates.

## Open questions

None for Ready to start. **Documented:** `specs/spikes/SPIKE-DIVE-004/results.md` closed new/existing identity acceptance, `ignoreExisting`, matching/different sessions, invite-only sign-in, Future API composition, ticket cleanup, and bounded revoke/reissue behavior. **Derived:** a real provider `429`, natural expiration, canonical deployed-host behavior, product-route integration, cross-kind negative tests, and worker retry/backoff/exhaustion remain implementation or later conformance evidence. `MT-COND-WORKER-001` is implemented and tested with the first real worker and blocks its external effects until its policy and tests are approved.

## Implementation authority

The product owner explicitly approved Ready-to-start promotion for option B on 2026-09-29 after reviewing the executed spike. This ADR and the onboarding SPEC are Ready to start. Implementation authority is active for reversible work; `MT-COND-WORKER-001` remains mandatory before external worker effects.
