# TRACE-DIVE-MVP-001 — Artifact map and coverage

- **Status:** Ready to start
- **Version:** 0.59
- **Purpose:** locate every SDD artifact and track coverage without copying requirement text.

## Artifact map

| Artifact | Path | Status | Version |
|---|---|---|---|
| Product profile | `specs/product/dive-mvp-profile.md` | Ready to start | 0.7 |
Dashboard tenant-context requirements `DIVE-IAM-REQ-029..032` are Ready to start with `ADR-DIVE-008` v0.14. Implementation coverage is recorded below.
| Foundation — multitenancy | `specs/foundation/multitenancy-architecture.md` | Ready to start | 0.2 |
| Foundation — IAM | `specs/foundation/iam-baseline.md` | Ready to start | 0.2 |
| Foundation — security/privacy | `specs/foundation/security-privacy-baseline.md` | Ready to start | 0.2 |
| Foundation — operations | `specs/foundation/operations-quality-recovery.md` | Ready to start | 0.2 |
| Foundation — SDD | `specs/foundation/sdd-specs-traceability.md` | Ready to start | 0.3 |
| Adoption profile | `specs/multitenancy/adoption-profile.md` | Draft | 0.4 |
| ADR-DIVE-001 | `specs/architecture/adrs/ADR-DIVE-001.md` | Ready to start | 0.2 |
| ADR-DIVE-002 | `specs/architecture/adrs/ADR-DIVE-002.md` | Ready to start | 0.3 |
| ADR-DIVE-003 | `specs/architecture/adrs/ADR-DIVE-003.md` | Ready to start | 0.1 |
| ADR-DIVE-004 | `specs/architecture/adrs/ADR-DIVE-004.md` | Ready to start | 0.3 |
| ADR-DIVE-005 | `specs/architecture/adrs/ADR-DIVE-005.md` | Ready to start | 0.3 |
| ADR-DIVE-006 | `specs/architecture/adrs/ADR-DIVE-006.md` | Ready to start | 0.1 |
| ADR-DIVE-007 | `specs/architecture/adrs/ADR-DIVE-007.md` | Ready to start | 0.2 |
| ADR-DIVE-008 | `specs/architecture/adrs/ADR-DIVE-008.md` | Ready to start | 0.14 |
| ADR-DIVE-009 | `specs/architecture/adrs/ADR-DIVE-009.md` | Draft | 0.3 |
| ADR-DIVE-010 | `specs/architecture/adrs/ADR-DIVE-010.md` | Ready to start | 0.3 |
| ADR-DIVE-011 | `specs/architecture/adrs/ADR-DIVE-011.md` | Draft | 0.3 |
| ADR-DIVE-012 | `specs/architecture/adrs/ADR-DIVE-012.md` | Draft | 0.4 |
| ADR-DIVE-013 | `specs/architecture/adrs/ADR-DIVE-013.md` | Ready to start | 0.13 |
| ADR-DIVE-014 | `specs/architecture/adrs/ADR-DIVE-014.md` | Draft | 0.4 |
| SPEC-DIVE-BOOKING-001 | `specs/booking/SPEC-DIVE-BOOKING-001.md` | Ready to start | 1.3 |
| SPEC-DIVE-IAM-001 | `specs/iam/SPEC-DIVE-IAM-001.md` | Ready to start | 0.18 |
| SPEC-DIVE-MARKETING-001 | `specs/marketing/SPEC-DIVE-MARKETING-001.md` | Ready to start | 0.1 |
| SPEC-DIVE-ONBOARDING-001 | `specs/onboarding/SPEC-DIVE-ONBOARDING-001.md` | Ready to start | 0.15 |
| SPEC-DIVE-OPS-001 | `specs/domain/SPEC-DIVE-OPS-001.md` | Deferred | 0.2-draft |
| MT-SPIKE-001 | `specs/multitenancy/` | Accepted with conditions | 0.3 |
| SPIKE-DIVE-001 | `specs/spikes/SPIKE-DIVE-001/` | Draft / not executed | see spike files |
| SPIKE-DIVE-002 | `specs/spikes/SPIKE-DIVE-002/` | Deferred | see spike files |
| SPIKE-DIVE-003 | `specs/spikes/SPIKE-DIVE-003/` | Draft / not executed | see spike files |
| SPIKE-DIVE-004 | `specs/spikes/SPIKE-DIVE-004/` | Draft / executed 2026-09-29 (Documented: spike results and dated provider evidence) | see spike files |
| This map | `specs/traceability/TRACE-DIVE-MVP-001.md` | Ready to start | 0.59 |

Notion indexes must show this map’s version. They must not invent an independent version sequence.

Notion pages are indexes only. They are not coverage evidence.

## Requirement groups

### Booking — `DIVE-BOOK-REQ-001` … `072`

| Group | IDs | Tests (expected) | Evidence |
|---|---|---|---|
| Isolation and identity | 001–008 | `packages/database/test/integration/*.integration.test.ts` | MT-SPIKE-001 |
| Catalog and model | 009–016 | domain unit tests | implementation PR |
| Lifecycle | 017–024 | booking integration | implementation PR |
| Capacity and concurrency | 025–032 | `tests/concurrency`, SPIKE-DIVE-001 | `evidence/spikes/SPIKE-DIVE-001/` |
| Mutation | 033–036 | booking integration | implementation PR |
| Channels and widget | 037–042 | SPIKE-DIVE-003, e2e | `evidence/spikes/SPIKE-DIVE-003/` |
| Delivery and privacy | 043–048 | outbox, i18n, privacy review | `evidence/` + dated review |
| Catalog HTTP and center-scoped dashboard catalog | 049–057 | catalog API tests in the implementation PR | implementation PR |
| Catalog page pagination, response DTO, and physical persistence naming | 049–057; ADR-DIVE-014 Draft | catalog contract and migration tests in the implementation PR | implementation PR |
| Public booking lifecycle and rejection | 068–069 | booking integration and rejection contract tests | implementation PR |
| Public booking capabilities | 070–072 | public capability contract tests | implementation PR |
| Public availability query and presentation closures | ADR-DIVE-011 Draft; no new SPEC IDs yet | none until ADR approved | none |
| Public create-booking | 058–067 | public-create API, idempotency, origin, channel-policy, token, and contention tests in implementation PR | implementation PR |

`DIVE-BOOK-REQ-003` is the capacity invariant. `DIVE-BOOK-REQ-029` states that capacity lives on the slot.
`DIVE-BOOK-REQ-037..038` publish future `Available` and `Full` slots; `Full` is visible as non-bookable.

### IAM — `DIVE-IAM-REQ-001` … `032`

Coverage is recorded in the current-coverage table below. Cross-tenant cases also map to `MT-REQ-*` and remain separate from `DIVE-*` results. Public-token and support-access evidence is not yet available in this vertical.

Dashboard tenant-context requirements `DIVE-IAM-REQ-029..032` remain Ready to start. `ADR-DIVE-008` v0.14 closes reserved keys, database-resolved exact CORS, mandatory environment host configuration, `center.read`, the Owner/Admin-only active/disabled center-entry lifecycle with immutable keys, idempotent transitions, scoped disablement, fail-closed resolver errors, and audit, the absolute post-bootstrap center handoff, one Next.js deployment for canonical authentication and center hosts, and the MVP ban on center-entry without `Origin`. `SPEC-DIVE-BOOKING-001` v1.3 closes US-08 activity/slot page pagination, minimal DTOs, and physical activity/slot naming; ADR-DIVE-014 remains the Draft decision record. Backend coverage for `DIVE-IAM-REQ-032` is recorded below; the web handoff and deployed-host activation evidence remain incomplete.

### Onboarding — `DIVE-ONB-REQ-001` … `050`

| Group | IDs | Tests (expected) | Evidence |
|---|---|---|---|
| Controlled bootstrap and authority | 001–009 | domain/API authorization, invitation, expiry, rate-limit, and non-disclosure tests | implementation PR |
| Invited self bootstrap | 010–019 | no-assisted-path, transaction, rollback, outbox, Owner activation, idempotency, and concurrency tests | Partial in PR #78 plus residual integration tests: atomic success, Owner activation, replay, concurrency, induced rollback, and terminal/wrong-kind denial are represented by `packages/database/test/integration/onboarding-invitations.integration.test.ts` |
| Fields and completion boundary | 020–026, 035 | validation, time-zone, locale, Owner-mode, and dashboard-landing tests | Partial in PR #78 plus the center-entry backend: setup validation and the legacy `/dashboard` redirect exist; exact center-origin context issuance is demonstrated, but the setup client does not yet navigate to that origin |
| Guided onboarding | 027–034 | Deferred; no implementation tests until a future story reactivates and redefines the scope | none |
| Acceptance matrix | 036 | evidence mapped to every applicable row above | implementation PR |
| Login and bootstrap HTTP boundary | 037–041 | Clerk invite-only, application-invitation custom-flow, mandatory active-session sign-out and ticket reauthentication, ticket-redaction, platform-capability, abuse/idempotency, rollout, safe-state, and completion contract tests; MFA is out of scope for issue #72 | implementation PR plus Clerk Development evidence; future step-up remains governed by `ADR-DIVE-006` |
| Center entry, provider delivery, persistence, and retention | 042–047 | `centerKey` mapping/rollback, pre-tenant outbox, Clerk create/revoke/reissue/reconciliation, delivery-state transitions, retry/dead-letter, valid and invalid `Retry-After` handling, redirect, retention, audit, and event contract tests | Partial in PR #78 plus residual backend tests: mapping, dynamic exact-origin resolution, completion audit/event, provider delivery, and induced completion rollback are represented; deployed DNS/TLS/Clerk readiness remains an activation evidence gap |
| Revocation and no-active-membership safety | 048–050 | stale-handle denial, renewal denial, unrelated-membership continuity, neutral UI, and non-disclosure tests | Demonstrated by `apps/api/test/iam.e2e-spec.ts`, `packages/database/test/integration/iam-api.integration.test.ts`, `apps/web/src/features/dashboard/dashboard-tenant-context.test.tsx`, and `apps/web/src/features/dashboard/tenant-context.test.ts`; center-entry denial uses the same non-disclosing contract |

**Issue #73 reconciliation (Derived, 2026-09-29):** PR #78 contains the core self-bootstrap command and its persistence path. Residual integration tests represent induced transaction rollback and rejection of terminal or ordinary IAM grants without tenant side effects, and the existing IAM/dashboard paths plus the neutral no-access test cover `DIVE-ONB-REQ-048..050`. The backend now resolves exact center origins from trusted mappings, implements `POST /v1/me/center-entry-contexts` with current membership, `center.read`, and center-scope checks, and implements the approved Owner/Admin-only active/disabled lifecycle with immutable keys and audit. The setup client still lacks the absolute first-center navigation, which remains outside the issue #73 backend brief. This note records coverage only; it does not change requirement text or promote an artifact.

`SPEC-DIVE-ONBOARDING-001` and `ADR-DIVE-013` are Ready to start for `DIVE-ONB-REQ-001..026` and `035..050`; guided-onboarding requirements `027..034` are Deferred. Current US-19 uses a simple setup form and selects no tour library, guide state, guide analytics, or guidance rollout. Option B replaces the application-owned bearer/email design with Clerk Application Invitations plus a PostgreSQL bootstrap grant. Production invitation administration remains application-owned through the protected platform API, authoritative grant transaction, pre-tenant outbox, and post-commit worker; no dedicated administration UI is required initially. Clerk Dashboard is diagnostic/provider tooling rather than the ordinary issuance channel and cannot create bootstrap authority. Platform capability assignment, administration abuse/idempotency/rollout, and worker retry/dead-letter/reconciliation are approved implementation relationships. MFA is out of scope for issue #72; future step-up remains governed by `ADR-DIVE-006`. US-19 remains limited to invited self bootstrap; assisted provisioning and Clerk Organizations remain outside the story. The bootstrap-grant relationship is explicitly separate from ordinary tenant invitations governed by `SPEC-DIVE-IAM-001` `DIVE-IAM-REQ-017` and `ADR-DIVE-004`; neither flow can consume or activate the other. `specs/spikes/SPIKE-DIVE-004/results.md` owns the bounded Clerk Development evidence for `ignoreExisting`, new/existing identities, active-session states, invite-only behavior, and redirect/ticket cleanup. Its direct provider calls are measurement-only; production invitation delivery remains assigned to the post-commit pre-tenant outbox worker. Remaining provider lifecycle behavior stays in implementation tests unless the spike exposes an architectural contradiction. `SPEC-DIVE-IAM-001` v0.14 only clarifies the authority boundary; this TRACE relationship is not implementation coverage. Implementation authority is active for reversible work, subject to the onboarding activation gates.

### Public product landing — `DIVE-MKT-REQ-001` … `012`

| Group | IDs | Tests (expected) | Evidence |
|---|---|---|---|
| Canonical product host and fail-closed routing | 001–003 | product-host, `www` redirect, unknown/center-like/cross-environment host tests | implementation PR |
| Public tenant-neutral behavior and contact action | 004–009 | page/component tests for contact-only behavior and absence of auth/signup/prices/tracking | implementation PR |
| Content, responsive/keyboard behavior, and indexing metadata | 010–012 | page metadata, accessibility-focused, keyboard, and responsive checks | implementation PR |

`SPEC-DIVE-MARKETING-001` v0.1 is Ready to start for the initial Spanish product landing. It adds no API, persistence, tenant selector, authentication entry, signup, price presentation, lead form, or marketing tracker. Pricing remains a future product decision.

### Multi-tenant — `MT-REQ-001` … `010`

Owned by `specs/multitenancy/MT-SPIKE-001-requirements.md`. Scenario matrix: `specs/multitenancy/MT-SPIKE-001-traceability.md`. Do not merge into `DIVE-*` results. Do not treat a file mapping as coverage.

### Operations — `DIVE-OPS-REQ-001` … `009`

Deferred. Not required to start the booking MVP.

### Baseline channels deferred from MT-SPIKE-001 (Option B)

Not copied as requirement text. Owners:

| Channel | Owner |
|---|---|
| Cache, files, search | SPEC/spike that introduces the channel (ID not invented) |
| Export, deletion | Future rights/privacy SPEC; until opened, security/privacy baseline + product-profile privacy gate |
| Restore | Future recovery SPEC; until opened, operations-quality-recovery baseline |
| Support access | SPEC-DIVE-IAM-001 |
| Noisy neighbor | Future operations SPEC; until opened, operations-quality-recovery baseline |

These rows block declaring the reusable baseline fully adopted. They do not invalidate the accepted PostgreSQL/Drizzle persistence result.

### MT-SPIKE-001 activation conditions

| Condition | Evidence owner | Gate |
|---|---|---|
| `MT-COND-IAM-001` | First IAM/API vertical | Before production traffic or production outbox emission |
| `MT-COND-WORKER-001` | First real outbox worker | Before external effects |

Owning verticals must link their tests and evidence back to the existing `MT-SC-*` rows; they must not duplicate or silently weaken `MT-REQ-*`.

## Maintenance rule

TRACE records relationships and coverage. It never restates requirement text.

Each functional PR must list:

- implemented/affected requirement IDs
- applicable ADR(s)
- tests
- evidence when applicable
- TRACE updates when coverage changes

Example:

```text
Implements: DIVE-BOOK-REQ-003, DIVE-BOOK-REQ-025, DIVE-BOOK-REQ-028
Decision: ADR-DIVE-001, ADR-DIVE-002
Tests: tests/concurrency/last-seat.spec.ts
Evidence: evidence/spikes/SPIKE-DIVE-001/
Traceability: TRACE-DIVE-MVP-001
```

## Current coverage

The first IAM/API vertical is partially implemented in `apps/api`, `packages/identity`, and `packages/database`. It is not full conformance with `SPEC-DIVE-IAM-001`.

### Demonstrated coverage

| Slice | IDs | Proof |
|---|---|---|
| Identity resolution, independent memberships, issuer + subject, and requested-tenant enforcement | `DIVE-IAM-REQ-001`, `002`, `005`, `006` | `packages/database/test/integration/iam-api.integration.test.ts`, `apps/api/test/iam.e2e-spec.ts` |
| Explicit Phase 1 role grants, permission-granting-role scope, inactive membership denial, and disabled external-collaborator fail-closed behavior | `DIVE-IAM-REQ-003`, `010..014`, `023` | `apps/api/src/iam.roles.spec.ts`, `apps/api/test/iam.e2e-spec.ts` |
| Provider-neutral identity assertion; invitation and pending-membership lifecycle; no-bearer retries; deliberate reissue; concurrent acceptance/reissue; non-disclosing scope denial; transactional audit/outbox | `DIVE-IAM-REQ-005`, `017`, `024`, `025` | `apps/api/src/iam.identity.spec.ts`, `packages/database/test/integration/iam-invitations.integration.test.ts` |
| Command-only membership mutation, last-owner protection, and atomic disable audit/outbox | `DIVE-IAM-REQ-018`, `025` | `apps/api/test/iam.e2e-spec.ts`, `packages/database/test/integration/iam-api.integration.test.ts`, `packages/database/test/integration/migrations.integration.test.ts` |
| Non-disclosing errors for the exposed center, membership-disable, and invitation persistence paths | `DIVE-IAM-REQ-024` | `apps/api/test/iam.e2e-spec.ts`, `packages/database/test/integration/iam-invitations.integration.test.ts` |
| Provider-neutral assurance and ordinary authentication without a verified address | `DIVE-IAM-REQ-005`, `019` | `packages/identity/src/clerk.spec.ts`, `apps/api/src/iam.identity.spec.ts`, `apps/api/test/iam.e2e-spec.ts` |
| Authenticated self-bootstrap command, closed setup input, verified-email grant resolution, atomic tenant/center/Owner creation, idempotency, concurrency, redemption rate limit, center-key mapping, completion audit, and safe completion event | `DIVE-ONB-REQ-004`, `006`, `008..009`, `012`, `018..021`, `041..042`, `047` | Partial: `apps/api/src/onboarding/tenant-bootstrap.validation.spec.ts`, `apps/api/src/onboarding/tenant-bootstrap.service.spec.ts`, `apps/api/test/onboarding.e2e-spec.ts`, `packages/database/test/integration/onboarding-invitations.integration.test.ts`, `packages/database/test/integration/product-security.integration.test.ts`; rollback, terminal/wrong-kind completion negatives, and first-center host/origin handoff remain open |
| Official raw-body webhook verification plus database tenant resolution, idempotency, no grants, no authorization mutation, audit, and safe outbox signals | `DIVE-IAM-REQ-021` | `packages/identity/src/clerk-webhook.spec.ts`, `packages/database/test/integration/iam-identity-webhooks.integration.test.ts` |
| Dashboard tenant-context contract and frontend consumer boundary | `DIVE-IAM-REQ-029..031` | `ADR-DIVE-008` tenant-context contract; `ADR-DIVE-009` frontend state boundary; server authorization proof: `apps/api/test/iam.e2e-spec.ts`, `packages/database/test/integration/iam-api.integration.test.ts`, `packages/database/test/integration/migrations.integration.test.ts`; web consumer proof: `apps/web/src/features/dashboard/tenant-context.test.ts`, `apps/web/src/features/dashboard/dashboard-tenant-context.test.tsx` |
| Exact center-origin resolution, center-entry context issuance, `center.read`, center scope, dynamic CORS failure behavior, and non-disclosing cross-tenant denial | `DIVE-IAM-REQ-032`; `MT-REQ-004..005`, `010` | `apps/api/src/common/tenant-context/tenant-context.crypto.spec.ts`, `apps/api/src/common/tenant-context/dashboard-cors.spec.ts`, `apps/api/src/iam/tenant-context/tenant-context.service.spec.ts`, `apps/api/test/iam.e2e-spec.ts`, `packages/database/test/integration/iam-api.integration.test.ts`, `packages/database/test/integration/migrations.integration.test.ts` |
| Center-entry lifecycle authority, active/disabled resolution, idempotent retries, immutable-key preservation, tenant-scoped audit, and manager/cross-tenant denial | `DIVE-IAM-REQ-003`, `023`, `025`, `032`; `MT-REQ-004..005`, `010` | `packages/identity/src/index.ts`, `apps/api/src/iam/iam.roles.spec.ts`, `apps/api/src/iam/iam.audit-contracts.spec.ts`, `apps/api/test/iam.e2e-spec.ts`, `packages/database/test/integration/iam-api.integration.test.ts`, `packages/database/drizzle/0006_keen_silver_fox.sql` |
| Forced tenant-context RLS and tenant-scoped issue, resolve, revoke, cleanup, and session-revocation commands | `MT-REQ-002`, `004..006`, `010` | `packages/database/test/integration/iam-api.integration.test.ts`, `packages/database/test/integration/iam-identity-webhooks.integration.test.ts`, `packages/database/test/integration/migrations.integration.test.ts` |
| Center-scoped catalog lifecycle, pagination, time filters, and DTO/error contract | `DIVE-BOOK-REQ-049..057` | `apps/api/test/iam.e2e-spec.ts`, `apps/api/src/catalog.time.spec.ts`, `packages/database/test/integration/migrations.integration.test.ts`, `apps/web/src/features/dashboard/catalog-api.test.ts`, `apps/web/src/features/dashboard/catalog-panel.test.tsx` |
| Public create-booking app-role transaction, idempotent replay/conflict, non-disclosing cross-tenant rejection, and atomic booking/verifier/audit/outbox effects | `DIVE-BOOK-REQ-001`, `028`, `045`, `058..065`; `MT-REQ-004`, `007`, `010` | `apps/api/test/iam.e2e-spec.ts`, `apps/api/src/booking/public-booking.service.spec.ts`, `packages/database/test/integration/booking-catalog.integration.test.ts` |
| Public-booking capability primitives, exact hosted-origin middleware, and tenant-isolated booking persistence | `DIVE-IAM-REQ-007..008`, `026`; `MT-REQ-001`, `004..006`, `009..010` | `apps/api/src/booking/public-booking.crypto.spec.ts`, `apps/api/src/booking/public-booking.cors.spec.ts`, `apps/api/src/booking/public-booking.validation.pipe.spec.ts`, `packages/database/test/integration/booking-catalog.integration.test.ts` |

### Partial or not yet demonstrated

Clerk authentication and session revocation (`DIVE-IAM-REQ-004`, `DIVE-IAM-REQ-016`, `DIVE-IAM-REQ-022`) remain Partial. `apps/web/src/features/dashboard/clerk-dashboard-session.test.tsx` proves only the mocked browser-adapter wiring and stable session-source identity. `apps/api/test/iam.clerk.sandbox.e2e-spec.ts` records a dated Clerk Development run for browser authentication and provider session revocation; natural expiry, browser logout, Clerk-delivered webhooks, and production integration remain unproven. `packages/identity/src/clerk-token-verifier.spec.ts` and the deterministic seams cover the remaining contract cases. See `evidence/releases/iam-phase-2-revocation.md`.

Non-disclosure and complete sensitive-operation audit coverage (`DIVE-IAM-REQ-024`, `DIVE-IAM-REQ-025`) remain partial beyond the exposed center-read, membership-disable, and invitation persistence paths. Purpose-limited customer-contact access and booking-operation audit belong to later approved slices and are not demonstrated here.

Public capability coverage is now partial for purpose-separated token primitives and tenant-isolated verifier persistence (`DIVE-IAM-REQ-007..008`, `DIVE-IAM-REQ-026`); full HTTP contract, one-time consumption, token limits, and expiry evidence remain follow-ups. Support access plus expiry evidence (`DIVE-IAM-REQ-020`, `DIVE-IAM-REQ-028`) also remain follow-ups. Provider-neutral assurance is demonstrated for current dashboard authentication, while the exact Clerk step-up contract remains open for Phase 4. See `docs/architecture/iam-vertical-follow-ups.md`. `DIVE-IAM-REQ-027` remains governed by deferred `SPEC-DIVE-OPS-001` scope. `MT-COND-IAM-001` and `MT-COND-WORKER-001` remain activation gates; Option B channels remain deferred. Do not treat this map as additional verification.

Invitation application-boundary hardening is a Draft follow-up in `SPEC-DIVE-IAM-001`, with no implementation coverage before invitation HTTP exposure. Related requirements: `DIVE-IAM-REQ-006`, `DIVE-IAM-REQ-017`, `DIVE-IAM-REQ-024`, `DIVE-IAM-REQ-025`, `DIVE-IAM-REQ-028`, and `DIVE-IAM-REQ-030`.

Approved Phase 0 decision relationships are recorded in `ADR-DIVE-004` through `ADR-DIVE-008`. Approval authorizes implementation but is not implementation evidence.
