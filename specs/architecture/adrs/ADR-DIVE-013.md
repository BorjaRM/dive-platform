# ADR-DIVE-013 — Controlled operator bootstrap and replaceable guided onboarding

- **Status:** Draft
- **Version:** 0.1
- **Date:** 2026-09-27
- **Deciders:** Product / Security / Frontend Architecture
- **Affected IDs:** `DIVE-ONB-REQ-001..036`; `DIVE-IAM-REQ-001..006`, `017`, `024`, `025`, `029..031`

## Provenance

| Decision | Provenance | Exact source | Approval / status |
|---|---|---|---|
| Clerk authenticates; PostgreSQL owns memberships and authorization | `Documented` | `SPEC-DIVE-IAM-001` `DIVE-IAM-REQ-001..006`; `ADR-DIVE-008` § Responsibility split | Existing normative constraint |
| Tenant creation and first-center creation are the first walking-skeleton increment | `Documented` | `specs/product/dive-mvp-profile.md` §6 | Existing product direction; no onboarding contract existed |
| Reliable side effects use the transactional outbox | `Documented` | `ADR-DIVE-002` § Decision | Existing normative constraint |
| Controlled invitation, self/assisted commands, transaction boundary, Owner operability, idempotency, fields, limits, rollout, and acceptance matrix | `Proposed` | Product-owner confirmations 2026-09-27; `SPEC-DIVE-ONBOARDING-001` Draft | Approved by product owner for Draft review; pending merge |
| Driver.js behind a replaceable renderer, local visual state, versioned content port, and no-op analytics port | `Proposed` | Product-owner confirmations 2026-09-27; `SPEC-DIVE-ONBOARDING-001` Draft | Approved by product owner for Draft review; pending merge |

## Context

The walking skeleton assumes that a tenant and center can be created, but no approved product contract currently allows an operator to bootstrap itself. IAM starts from an authenticated identity and existing membership. A guided experience must therefore add a controlled pre-tenant authorization boundary without making the browser, Clerk Organization, or a tour library authoritative.

The product also needs guidance that can be added to later flows without cloning those flows. Driver.js is accepted for the first renderer, but the domain and application behavior must survive its removal or replacement.

## Decision

### Pre-tenant authority

- No public operator signup is introduced.
- Platform staff with a dedicated pre-tenant capability issue and revoke one-use bootstrap invitations.
- A redemption is authenticated by Clerk, initially matched through the invited verified email, and then bound by `issuer + subject`.
- Existing memberships and tenant roles neither grant nor deny this pre-tenant capability.

### Separate use cases, shared transaction service

Expose separate application commands for self bootstrap and assisted provisioning:

- `CompleteOwnTenantBootstrap`
- `ProvisionTenantForOwner`

Platform invitation management uses:

- `IssueTenantBootstrapInvitation`
- `RevokeTenantBootstrapInvitation`

The two provisioning commands share one internal transactional service but retain separate authorization and input contracts. Existing IAM commands own Owner invitation acceptance and reissue.

### Transaction and operability

One PostgreSQL transaction persists tenant, first center, active or pending Owner membership, audit, and outbox. The outbox worker performs external invitation delivery after commit.

Operability is derived from an active Tenant Owner membership. Do not add a duplicate tenant lifecycle status. Assisted provisioning and story completion are separate milestones.

The bootstrap invitation is the idempotency key. Store a normalized request fingerprint and result reference; replay the same payload, conflict on a different payload, and serialize concurrent consumption with database constraints and transaction locking.

### Guided experience boundary

Define application-owned ports:

```text
GuidanceRenderer
GuideContentSource
GuideAnalytics
```

Only the Driver.js adapter imports Driver.js. Guides reference stable application anchors and semantic domain outcomes; they do not own routes, forms, server mutations, authorization, or completion.

The functional onboarding path works with a no-op renderer. Driver.js is loaded only when guidance is enabled.

### Browser state

Use versioned, identity-scoped `localStorage` only for `dismissed` / `completed` visual preferences. It may replay on another device. Do not store functional progress, authorization, invitation secrets, Clerk tokens, form contents, or `X-Tenant-Context`.

A guide does not auto-replay after dismissal/completion or merely because content version changes. Manual replay is available through `Help → Repeat guide`.

### Fields and presentation

The bootstrap collects only operator name, first-center name, confirmed IANA time zone, editable `es` / `en` user preference, self/assisted mode, and the assisted Owner email when applicable.

Names are trimmed Unicode strings of 1–120 characters, are not globally unique, and are never authorization identifiers. Billing, fiscal, payment, public-contact, custom-domain, and additional-center data remain outside this flow.

Guide content ships in versioned repository catalogs behind `GuideContentSource`. Copy ownership is shared; disagreement is resolved in review because no single copy owner was selected. A future CMS replaces the source adapter, not the flow or renderer contract.

`GuideAnalytics` exposes typed `started`, `dismissed`, `completed`, and `restarted` signals. Its MVP implementation is no-op and sends no external analytics.

### Accessibility and rollout

The complete guided experience targets WCAG 2.2 AA before pilot and never blocks the underlying form when a target is absent.

Provisioning and visual guidance use independent rollout controls. The first rollout is limited to explicitly invited identities and authorized internal staff.

## Consequences

### Positive

- Product behavior remains independent of Driver.js and can adopt another renderer later.
- The same functional forms work guided or unguided.
- Pre-tenant authority does not leak into tenant roles or read-only support.
- Atomic persistence and outbox prevent orphaned tenants and pre-commit emails.
- Owner activation remains the single source of tenant operability.

### Costs and risks

- A pre-tenant invitation store, capability, transaction path, and audit surface must be implemented.
- Verified-email matching is an additional bootstrap-only assurance beyond ordinary dashboard authentication.
- `localStorage` preference does not follow the user across devices.
- Shared copy ownership has no predefined final arbiter.
- Driver.js accessibility claims do not replace product-level WCAG validation.

## Alternatives considered

### NextStep as the flow owner

Not selected. It reduces initial routing work but risks spreading library hooks and step state through product components. A renderer adapter preserves replaceability.

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

The implementation must satisfy `SPEC-DIVE-ONBOARDING-001` `DIVE-ONB-REQ-001..036` and its twelve-block acceptance matrix through domain/API, component, Playwright, isolation, security, and manual accessibility evidence.

This Draft PR changes documentation only. It provides no implementation, migration, test, or pilot evidence.

## Open questions

No product decision remains open within this ADR's reviewed scope. HTTP route names, physical database names, and exact event schemas belong to the later contract/implementation PR and may not change these decisions silently.

## Implementation authority

None while Draft. Merge records the reviewed proposal but does not promote this ADR to Ready to start, Review, or Accepted without a separate explicit product-owner status decision.
