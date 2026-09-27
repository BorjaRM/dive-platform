# ADR-DIVE-013 — Controlled self bootstrap and replaceable guided onboarding

- **Status:** Draft
- **Version:** 0.2
- **Date:** 2026-09-27
- **Deciders:** Product / Security / Frontend Architecture
- **Affected IDs:** `DIVE-ONB-REQ-001..036`; `DIVE-IAM-REQ-001..006`, `017`, `020`, `024`, `025`, `029..032`

## Provenance

| Decision | Provenance | Exact source | Approval / status |
|---|---|---|---|
| Clerk authenticates; PostgreSQL owns memberships and authorization | `Documented` | `SPEC-DIVE-IAM-001` `DIVE-IAM-REQ-001..006`; `ADR-DIVE-008` § Responsibility split | Existing normative constraint |
| Tenant creation and first-center creation are the first walking-skeleton increment | `Documented` | `specs/product/dive-mvp-profile.md` §6 | Existing product direction; no onboarding contract existed |
| Reliable side effects use the transactional outbox | `Documented` | `ADR-DIVE-002` § Decision | Existing normative constraint |
| US-19 is self bootstrap by an invited future Owner; assisted provisioning is outside the MVP story | `Proposed` | PR #36 product-owner revision record | Approved for Draft review; pending merge |
| Controlled invitation, atomic creation, idempotency, fields, limits, rollout, and acceptance matrix | `Proposed` | PR #36 product-owner revision record; `SPEC-DIVE-ONBOARDING-001` Draft | Approved for Draft review; pending merge |
| Driver.js behind a replaceable renderer, local visual state, versioned content port, and no-op analytics port | `Proposed` | PR #36 product-owner revision record; `SPEC-DIVE-ONBOARDING-001` Draft | Approved for Draft review; pending merge |

## Context

The walking skeleton assumes that a tenant and center can be created, but no approved product contract currently allows a future operator Owner to bootstrap itself. IAM starts from an authenticated identity and existing membership. The flow therefore needs a controlled pre-tenant invitation boundary without making the browser, Clerk Organization, platform support, or a tour library authoritative.

The MVP decision is intentionally narrower than an assisted-provisioning model: platform staff may manage bootstrap invitations, but they do not create the tenant, center, or Owner membership for the customer. A guided experience must remain replaceable and must not duplicate the functional flow.

## Decision

### Pre-tenant authority

- No public operator signup is introduced.
- Platform staff with a dedicated pre-tenant capability may issue, reissue, and revoke one-use bootstrap invitations.
- Platform staff do not create the tenant or center, designate an Owner, confirm customer data, or receive a tenant membership through this flow.
- Redemption is authenticated by Clerk, initially matched through the invited verified email, and then bound by `issuer + subject`.
- Existing memberships and tenant roles neither grant nor deny this pre-tenant capability.

### Self-bootstrap use case

The application exposes one provisioning command for US-19:

- `CompleteOwnTenantBootstrap`

Invitation management remains separate:

- `IssueTenantBootstrapInvitation`
- `ReissueTenantBootstrapInvitation`
- `RevokeTenantBootstrapInvitation`

The invited authenticated identity becomes the initial active Tenant Owner. Assisted provisioning is deferred and requires a separate story, SPEC/ADR decision, explicit approval, and stronger controls before it can enter scope.

### Transaction and operability

One PostgreSQL transaction persists the tenant, first center, active Owner membership, invitation consumption, audit, and outbox. External effects occur only after commit through the outbox worker.

Operability is derived from the active Tenant Owner membership; no duplicate tenant lifecycle status is added. The bootstrap invitation is the idempotency key. Store a normalized request fingerprint and result reference; replay the same payload, conflict on a different payload, and serialize concurrent consumption with database constraints and transaction locking.

### Guided experience boundary

Define application-owned ports:

```text
GuidanceRenderer
GuideContentSource
GuideAnalytics
```

Only the Driver.js adapter imports Driver.js. Guides reference stable application anchors and semantic domain outcomes; they do not own routes, forms, server mutations, authorization, or completion. The functional onboarding path works with a no-op renderer. Driver.js is loaded only when guidance is enabled.

### Browser state

A proposed closure uses a stable identity-and-guide-scoped `localStorage` key whose value contains `schemaVersion`, `status`, and `lastSeenGuideVersion` only for `dismissed` / `completed` visual preferences. It never stores functional progress, authorization, invitation secrets, Clerk tokens, form contents, or `X-Tenant-Context`.

A guide does not auto-replay after dismissal/completion or merely because content changes. Manual replay is available through `Help → Repeat guide`. The exact storage representation remains Proposed pending product-owner confirmation.

### Fields and presentation

The bootstrap collects only operator display name, first-center display name, confirmed IANA time zone, and editable `es` / `en` user preference. It does not ask for an assisted mode or a second Owner email.

A proposed validation closure normalizes names to Unicode NFC, trims them, and measures 1–120 Unicode code points identically in client and server. Names are not globally unique and never authorize access. Billing, fiscal, payment, public-contact, custom-domain, and additional-center data remain outside this flow.

Guide content ships in versioned repository catalogs behind `GuideContentSource`. `GuideAnalytics` exposes typed `started`, `dismissed`, `completed`, and `restarted` signals; its MVP implementation is no-op and sends no external analytics.

### Accessibility and rollout

The complete guided experience targets WCAG 2.2 AA before pilot and never blocks the underlying form when a target is absent. Provisioning and visual guidance use independent rollout controls. Provisioning is limited to explicitly invited identities; platform staff are limited to invitation management.

## Consequences

### Positive

- Product behavior remains independent of Driver.js.
- The same functional form works guided or unguided.
- Pre-tenant invitation authority does not leak into tenant roles or read-only support.
- Atomic persistence and outbox prevent orphaned tenants and pre-commit effects.
- The customer Owner confirms the data and becomes active in the same bootstrap transaction.

### Costs and risks

- A pre-tenant invitation store, capability, transaction path, and audit surface must be implemented.
- Verified-email matching is an additional bootstrap-only assurance beyond ordinary dashboard authentication.
- `localStorage` preference does not follow the user across devices.
- Driver.js accessibility claims do not replace product-level WCAG validation.
- `centerKey` allocation and host/origin readiness can still block the final dashboard entry.

## Alternatives considered

### Assisted provisioning by platform staff

Deferred outside US-19. It introduces write-capable platform authority, confused-deputy and escalation risks, Owner-designation errors, tenant-orphan recovery, and stronger step-up/audit requirements. Reconsideration requires a separate story and normative approval.

### Driver.js imported directly by forms

Rejected. It couples domain flow and presentation and lets UI callbacks drift toward completion authority.

### Duplicate guided wizard

Rejected. It would duplicate validation, mutations, and navigation.

### Server-persisted guide preferences

Deferred. Local non-authoritative state is sufficient for the MVP proposal.

### Clerk Organization

Not selected. PostgreSQL remains authoritative for tenant membership and authorization.

### Public signup

Rejected. Bootstrap requires a platform-issued invitation.

## Acceptance criteria / evidence

The implementation must satisfy `SPEC-DIVE-ONBOARDING-001` `DIVE-ONB-REQ-001..036` and its acceptance matrix through domain/API, component, Playwright, isolation, security, and manual accessibility evidence.

This Draft PR changes documentation only. It provides no implementation, migration, test, or pilot evidence.

## Open questions

- Confirm the NFC / Unicode-code-point validation closure.
- Confirm the stable-key `localStorage` representation and replay semantics.
- Decide the safe `centerKey` allocation and host/origin preparation needed before dashboard entry.
- Define implementation-specific HTTP paths, physical database names, audit actions, event names, and payload schemas.
- Define invitation retention/deletion and the operational owner for issue, recovery, and support.

## Implementation authority

None while Draft. Merge records the reviewed proposal but does not promote this ADR to Ready to start, Review, or Accepted without a separate explicit product-owner status decision.
