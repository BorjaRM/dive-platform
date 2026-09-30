# ADR-DIVE-013 — Controlled self bootstrap and simple first-center setup

- **Status:** Ready to start
- **Version:** 0.14
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
| Backend-owned bootstrap invitation administration; Clerk Dashboard excluded as the ordinary production issuance channel; no dedicated administration UI required initially | `Proposed` | Product confirmation 2026-09-29 retaining the backend-owned model after reviewing the dashboard/backend trade-off; `SPEC-DIVE-ONBOARDING-001` v0.11 | Approved for implementation; issue #72 remains the owning increment |
| Platform capability assignment, administration abuse/idempotency controls, separate rollout controls, email normalization, worker retry/dead-letter/reconciliation policy, and exclusion of MFA from issue #72 | `Proposed` | Product confirmation 2026-09-29 approving the implementation-blocking policy proposals and excluding MFA from the increment | Approved for implementation; MFA is out of scope for issue #72 and future step-up remains governed by `ADR-DIVE-006` |
| Guided onboarding, Driver.js, renderer/content/analytics ports, guide browser state, and guidance rollout | `Proposed` | Original PR #36 guidance proposal; product confirmation 2026-09-29 deferring guided onboarding | **Approved for deferral:** excluded from current US-19 implementation authority; future story and flow selection required |
| Clerk Application Invitations own identity ticket/email; dedicated acceptance and setup routes keep signup out of `/dashboard`; PostgreSQL owns the bootstrap grant; Clerk Organizations and metadata authority remain excluded | `Proposed` | [Clerk invitations](https://clerk.com/docs/guides/users/inviting); [custom flow](https://clerk.com/docs/guides/development/custom-flows/authentication/application-invitations); [Next.js sign-up component](https://clerk.com/docs/nextjs/reference/components/authentication/sign-up); `specs/spikes/SPIKE-DIVE-004/results.md`; product confirmation 2026-09-29 | Provider behavior demonstrated; approved for Ready-to-start promotion 2026-09-29 |
| Any active session must be explicitly signed out and reauthenticated through the Clerk invitation ticket before bootstrap setup | `Proposed` | Product confirmation 2026-09-29 choosing mandatory reauthentication instead of active-session preflight; `SPEC-DIVE-ONBOARDING-001` `DIVE-ONB-REQ-038` | Approved for implementation 2026-09-29; no preflight endpoint or active-session account classification |
| Transactional `centerKey`, pre-tenant outbox, Clerk worker adapter, provider-reference persistence, retention, audit, and completion event | `Proposed` | [Clerk createInvitation](https://clerk.com/docs/reference/backend/invitations/create-invitation); `SPEC-DIVE-ONBOARDING-001` v0.11 Ready to start; `specs/multitenancy/MT-SPIKE-001-specification.md` `MT-COND-WORKER-001`; product confirmation 2026-09-29 | Approved for Ready-to-start promotion; worker retry/backoff/exhaustion and dead-letter policy remains an activation gate before external effects |
| Bootstrap grants and ordinary tenant invitations are separate authority kinds and cannot consume or activate each other | `Derived` | `SPEC-DIVE-IAM-001` `DIVE-IAM-REQ-017`; `ADR-DIVE-004` §§ Invitation and identity binding / Lifecycle; product confirmation 2026-09-29 | Approved for Ready-to-start promotion; cross-kind negative tests remain implementation evidence |
| Active-membership revalidation and handle invalidation | `Derived` | `SPEC-DIVE-IAM-001` `DIVE-IAM-REQ-022`, `030..031`; product confirmation 2026-09-28 | Approved for implementation; Product owner confirmation 2026-09-28 after merged PR #62 |

## Context

The walking skeleton assumes that a tenant and center can be created, but no approved product contract currently allows a future operator Owner to bootstrap itself. IAM starts from an authenticated identity and existing membership. The flow therefore needs a controlled pre-tenant invitation boundary without making the browser, Clerk Organization, platform support, or a tour library authoritative.

The MVP decision is intentionally narrower than an assisted-provisioning model: platform staff may manage bootstrap invitations, but they do not create the tenant, center, or Owner membership for the customer. Current US-19 uses a simple setup form and does not include guided onboarding. This pre-tenant grant is distinct from the ordinary tenant invitation in `DIVE-IAM-REQ-017` and `ADR-DIVE-004`, which belongs to an existing tenant and can only activate its linked pending membership.

## Decision

### Pre-tenant authority

- The Clerk application uses invite-only access mode. `/sign-in/[[...sign-in]]` exposes ordinary login only: no public operator signup, bootstrap-invitation discovery, manual code entry, or operator creation. `/dashboard` remains protected, redirects signed-out users to that sign-in route, and never renders `<SignUp />` or bootstrap data entry.
- Platform identities use the PostgreSQL-authoritative `bootstrap_invitation.read|issue|reissue|revoke` capabilities, independent of tenant memberships and read-only support. Mutations require a reason and audit. **Proposed and approved 2026-09-29:** MFA is out of scope for issue #72; future step-up remains governed by `ADR-DIVE-006`.
- Platform principals are normalized by `issuer + subject`; restricted operational tooling exclusively assigns and revokes their explicit capabilities. Tenant roles, support grants, and authentication alone never create platform capabilities.
- The administration boundary permits ten operations per normalized platform principal per minute, counting denied attempts. A secondary IP control may add protection but cannot authorize. Excess returns non-disclosing `429` with `Retry-After`.
- The internal application commands are the ordinary production administration path. A dedicated graphical administration UI is not required initially; controlled platform tooling may invoke the same authenticated API. Clerk Dashboard is limited to diagnostics, development testing, and bounded emergency provider action and never creates PostgreSQL bootstrap authority.
- The API accepts only the approved destination, reason, and idempotency context. Provider expiry, notification, exact redirect, `ignoreExisting` policy, and metadata are server-owned. Callers cannot select tenant, center, role, permission, provider ticket, redirect, expiry, or Clerk metadata. The Clerk credential is confined to the post-commit worker adapter.
- Destination email is trimmed and lowercased without provider-specific dot or plus rewriting. Administrative idempotency is scoped by normalized actor, command, and key; exact normalized replay returns the original result, while changed destination, reason, or target returns `409 idempotency_conflict`. Issue, reissue, and revoke have separate namespaces.
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

The invitation adapter sets `/bootstrap/accept` as the exact allowlisted `redirectUrl`. The acceptance controller handles new invited identities through Clerk enrollment and existing invited identities through Clerk sign-in. **Proposed and approved 2026-09-29:** if any session is already active, the controller asks for explicit confirmation, removes the ticket from the URL while retaining it only in ephemeral component memory, signs out the active session, and requires Clerk ticket authentication before setup. It does not classify the active account, continue directly to setup, or render `<SignUp />` while that session remains active. Clerk prebuilt components or a custom flow are adapter choices only if they satisfy this matrix.

Clerk’s `__clerk_ticket` is confined to the initial acceptance-route query and ephemeral component memory, removed from the URL with history replacement before active-session sign-out or navigation, and consumed by the Clerk SDK before `/bootstrap/setup`. The acceptance route applies `Referrer-Policy: no-referrer`. The ticket is excluded from setup/dashboard URLs, referrers, logs, audit, traces, analytics, errors, and events. Setup completes through `POST /v1/me/tenant-bootstrap` without a provider ticket or application bearer. The server resolves one pending grant from authenticated `issuer + subject` and verified normalized email, never an ordinary invitation or pending membership. **Documented:** success performs the absolute first-center handoff in DIVE-ONB-REQ-035 and ADR-DIVE-017, not relative authentication-host `/dashboard`. Result-recovery resolution remains the explicit Draft follow-up in the onboarding owner.

The invited authenticated identity becomes the initial active Tenant Owner. Assisted provisioning is deferred and requires a separate story, SPEC/ADR decision, explicit approval, and stronger controls before it can enter scope.

### Transaction and operability

One PostgreSQL transaction persists the tenant, first center, active Owner membership, invitation consumption, audit, and outbox. External effects occur only after commit through the outbox worker.

Operability is derived from the active Tenant Owner membership; no duplicate tenant lifecycle status is added. The bootstrap invitation is the idempotency key. Store a normalized request fingerprint and result reference; replay the same payload, conflict on a different payload, and serialize concurrent consumption with row locking and database uniqueness.

The server allocates an immutable, non-reserved `centerKey` from a readable normalized candidate plus a stable collision suffix when required. The bootstrap transaction persists the trusted `centerKey -> tenantId + centerId` mapping. MVP host readiness relies on wildcard platform DNS/TLS; mapping failure rolls back the entire bootstrap and leaves the invitation unconsumed. Custom domains remain out of scope.

`tenant_bootstrap_grants` owns bootstrap authority and terminal results, physically and logically separate from ordinary IAM invitation and pending-membership records. A dedicated `tenant_bootstrap_outbox_events` boundary carries pre-tenant create/revoke/reissue commands because the tenant-scoped outbox cannot represent an invitation before a tenant exists. After commit, the worker calls Clerk and stores only the provider invitation reference plus safe status; it never receives product authority or tenant membership. No Clerk ticket, application bearer, encrypted delivery envelope, or email body is persisted. Reissue supersedes the PostgreSQL grant immediately, then asynchronously revokes the prior Clerk invitation and creates another. Terminal grants and safe provider references are retained for 90 days; audit follows the platform security retention policy.

Provider create requests carry an opaque grant reference in server-owned metadata for reconciliation only. PostgreSQL remains authoritative. Before repeating an ambiguous create, the worker reconciles that reference. Network failures, `408`, `429`, and `5xx` are retryable; other provider `4xx` are terminal. Delivery makes at most eight total attempts with full jitter from zero to `min(5 seconds × 2^(attempt - 1), 15 minutes)` and never retries a `429` before valid `Retry-After`. A valid `Retry-After` is a non-negative delta-seconds value or a future HTTP date; when it is absent, malformed, or in the past, the worker uses the local full-jitter delay. Each outbox command uses delivery states `pending`, `retrying`, `succeeded`, or `dead_letter`, transitioning from `pending` to `retrying` after a retryable failure, to `succeeded` after provider completion, or to `dead_letter` after a terminal or exhausted attempt. Exhausted or terminal commands enter dead-letter state and emit `tenant_bootstrap_invitation.delivery_failed`; recovery is an audited reissue, not in-place replay. **Proposed and approved 2026-09-29:** these explicit delivery-state and invalid-`Retry-After` fallback rules close the worker-policy definition without changing the activation gate.

Audit uses the stable actions `tenant_bootstrap_invitation.issued`, `.reissued`, `.revoked`, `.delivery_failed`, `tenant_bootstrap.completed`, and `tenant_bootstrap.denied`. Successful completion emits `tenant.bootstrap.completed.v1` with tenant, center, membership, invitation, occurrence, and correlation references only.

### Membership and revocation boundary

Every protected request revalidates the handle binding, active membership, current roles, permissions, and center scope in PostgreSQL. Disabling a membership invalidates all handles for that membership and prevents renewal without affecting another active membership of the same global identity. An authenticated identity without an active membership receives no tenant context and only a neutral no-access state. Invalid authentication returns generic `401`; authorization denial returns generic `403`. Both use non-disclosing contracts without tenant, center, membership, invitation, or resource disclosure.

### Deferred guided onboarding

Current US-19 ends with the simple setup form and dashboard entry. It does not select or require Driver.js, another tour library, guidance renderer/content/analytics ports, guide-specific browser persistence, replay semantics, or a guidance rollout control.

A future story must first decide whether guided assistance is needed and which flows justify it. Any later proposal must define its own value, accessibility, privacy, measurement, rollout, and replacement boundaries without becoming authority for product navigation, forms, mutations, authorization, or completion.

### Fields and presentation

The bootstrap collects only operator display name, first-center display name, confirmed IANA time zone, and editable `es` / `en` user preference. It does not ask for an assisted mode or a second Owner email.

The confirmed name contract normalizes names to Unicode NFC, trims outer whitespace, and measures 1–120 Unicode code points identically in client and server. Names are not globally unique and never authorize access. Billing, fiscal, payment, public-contact, custom-domain, and additional-center data remain outside this flow.

### Accessibility and rollout

The simple bootstrap form remains subject to normal product accessibility requirements. Provisioning uses its approved rollout control and is limited to explicitly invited identities; platform staff are limited to invitation management. Guidance-specific accessibility and rollout decisions remain Deferred with `DIVE-ONB-REQ-027..034`.

`BOOTSTRAP_INVITATION_WRITES_ENABLED` and `BOOTSTRAP_INVITATION_DELIVERY_ENABLED` are separate, disabled-by-default controls. Disabled writes leave safe reads available and make mutations return `503 feature_unavailable`. Disabled delivery allows authoritative grant/outbox persistence but prevents worker claims. Delivery cannot be enabled while writes are disabled or required worker/provider configuration is absent.

## Consequences

### Positive

- The MVP avoids an unnecessary tour dependency for a single simple form.
- Future guidance can be evaluated independently against demonstrated product need and specific flows.
- Pre-tenant authority does not leak into tenant roles or read-only support.
- Atomic grant persistence plus the pre-tenant outbox prevent provider calls before commit; completion atomicity prevents orphaned tenants.
- The customer Owner confirms the data and becomes active in the same bootstrap transaction.

### Costs and risks

- A pre-tenant invitation store, capability, transaction path, and audit surface must be implemented and kept separate from ordinary tenant invitations.
- The internal administration endpoint adds an abuse surface and therefore requires platform-only capability checks, reason, audit, idempotency, abuse protection, server-owned provider parameters, safe responses, and a rollout control. MFA is out of scope for issue #72 and is not an administration acceptance criterion. It is not exposed as a tenant operation.
- Cross-kind confusion must be rejected and tested so an employee invitation cannot create a tenant and a bootstrap grant cannot activate a pre-existing tenant membership.
- Clerk invite-only enrollment and verified-email matching are additional bootstrap-only assurances beyond ordinary dashboard authentication.
- The wildcard DNS/TLS boundary and transactional mapping reduce per-center provisioning, but their deployment configuration remains operationally critical.
- Clerk becomes an external dependency for invitation delivery; rate limits, redirect handling, existing-identity behavior, revocation lag, and provider outages require explicit tests and safe retry/reconciliation.

## Alternatives considered

### Guided onboarding and tour libraries

Deferred. Current US-19 does not justify a tour for one simple form. No decision is retained for Driver.js, another library, guide persistence, content catalogs, analytics, replay, or target flows. A future story must re-evaluate these choices from the product need instead of inheriting the earlier proposal.

### Application-owned bearer and email delivery

Superseded by option B. A second application bearer, secret hash, encrypted delivery envelope, and separate email-provider integration duplicate Clerk Application Invitation behavior and increase secret handling. PostgreSQL retains the grant and domain authority, not another emailed credential.

### Clerk Dashboard as the primary issuance channel

Rejected for production bootstrap. Dashboard issuance can send a provider invitation before the application has atomically recorded its grant, audit, idempotency, and outbox intent; it also cannot replace the exact server-owned provider contract. A dashboard-created invitation therefore has no bootstrap authority without a matching PostgreSQL grant and fails neutrally. Dashboard access remains useful for diagnostics, development testing, and bounded emergency provider action accompanied by the authoritative application transition.

### Clerk Organization

Not selected. PostgreSQL remains authoritative for tenant membership and authorization.

### Public signup

Rejected for this scope. Bootstrap requires a platform-issued invitation.

## Acceptance criteria / evidence

The current implementation must satisfy `SPEC-DIVE-ONBOARDING-001` `DIVE-ONB-REQ-001..026` and `035..050` plus its applicable acceptance matrix through domain/API, component, Playwright, isolation, security, Clerk Development, and accessibility evidence. `DIVE-ONB-REQ-027..034` are Deferred and are not implementation targets. MFA is out of scope for issue #72 and is neither an implementation requirement nor a conformance criterion; future step-up remains governed by `ADR-DIVE-006`.

This revision changes the provider boundary. `specs/spikes/SPIKE-DIVE-004/results.md` supplies the bounded Clerk Development evidence required to close the provider-selection questions; implementation, migration, product-route, worker, deployed-host, accessibility, and pilot evidence remain future gates.

## Open questions

None for current US-19 Ready to start. **Documented:** `specs/spikes/SPIKE-DIVE-004/results.md` closed new/existing identity acceptance, `ignoreExisting`, matching/different sessions, invite-only sign-in, Future API composition, ticket cleanup, and bounded revoke/reissue behavior. **Proposed and approved:** guided onboarding is Deferred; the platform-administration and worker policies above are approved; MFA is out of scope for issue #72 and future step-up remains governed by `ADR-DIVE-006`. **Derived:** a real provider `429`, natural expiration, canonical deployed-host behavior, product-route integration, and cross-kind negative tests remain implementation or later conformance evidence. `MT-COND-WORKER-001` blocks external effects until the approved worker policy is implemented and tested.

## Implementation authority

The product owner explicitly approved Ready-to-start promotion for option B on 2026-09-29 after reviewing the executed spike and subsequently reduced current scope to the simple setup form. This ADR and the onboarding SPEC remain Ready to start for `DIVE-ONB-REQ-001..026` and `035..050`. `DIVE-ONB-REQ-027..034` are Deferred. Implementation authority is active for reversible work; `MT-COND-WORKER-001` remains mandatory before external worker effects.
