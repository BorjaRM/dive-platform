# IAM conformance plan

This is a non-normative delivery plan. `specs/iam/SPEC-DIVE-IAM-001.md` remains the normative source, and `specs/traceability/TRACE-DIVE-MVP-001.md` remains the coverage map.

## Outcome

Reach evidence-backed conformance for `DIVE-IAM-REQ-001..028` without silently changing permissions, states, TTLs, invariants, or acceptance criteria. `DIVE-IAM-REQ-027` remains governed by the deferred `SPEC-DIVE-OPS-001` scope and is not implemented in this plan.

## Working rules

- Deliver one coherent capability per pull request.
- Every PR names its affected `DIVE-IAM-*` IDs, ADRs, tests, evidence, and rollback impact.
- Keep `MT-REQ-*` results separate from `DIVE-IAM-*` results.
- Treat `Derived` and `Proposed` decisions as open until the required human approval is recorded.
- Update TRACE only with relationships and proof that exists.
- Do not promote `SPEC-DIVE-IAM-001` to `Review` or `Accepted` as part of implementation work.
- Use synthetic data until the repository's pilot gates are explicitly satisfied.

## Delivery sequence

### Phase 0: decision closure

**Purpose:** remove implementation blockers without inventing defaults.

**Status:** Complete on 2026-09-26. The selected decisions are approved; listed external/product questions remain explicit blockers only for the affected later slices.

**Decision preparation:** see [IAM Phase 0 recommendations](iam-phase-0-recommendations.md). The recommendations are approved through `ADR-DIVE-004` to `ADR-DIVE-007`; remaining blockers are tracked there and do not authorize implicit defaults.

**IDs:** `DIVE-IAM-REQ-007..009`, `014..017`, `019..022`, `024..026`, `028`.

**Work:** record approved decisions or open questions for invitation transitions, public-token purpose and expiry, step-up assurance, support grants, session invalidation, and the audit envelope. Confirm whether the disabled external collaborator is rejected at assignment time or remains a capability-free membership.

**Approved decision records:** `ADR-DIVE-004` through `ADR-DIVE-007` are Ready to start and authorize implementation of their selected decisions. Their remaining open questions do not authorize implicit defaults.

**Exit evidence:** approved decision records or explicitly tracked open questions. No code implementation should depend on an unapproved value. Support activation, exact public-origin enforcement, Clerk event/retry behavior, and retention policies remain blocked until their open questions close.

### Phase 1: authorization matrix and membership controls

**Purpose:** complete the internal authorization boundary before adding external identity or public capabilities.

**IDs:** `DIVE-IAM-REQ-001..003`, `005..006`, `010..014`, `017..018`, `023..025`.

**Work:** complete the stable permission catalog, role/permission/scope evaluation, invitation persistence, membership state transitions, cross-tenant non-disclosure, and audit enforcement. Preserve database-level last-owner protection and tenant context re-resolution.

**Required proof:** parameterized role matrix tests, center-scope tests, invitation tests, cross-tenant negative tests, direct app-role mutation tests, audit/outbox atomicity tests, and concurrency tests.

### Phase 2: Clerk adapter and session lifecycle

**Purpose:** replace the rejecting runtime identity adapter with the approved identity boundary.

**IDs:** `DIVE-IAM-REQ-004`, `005`, `016`, `021..022`.

**Work:** implement Clerk behind `IdentityProviderPort`; verify token/session claims through the adapter; verify, tenant-resolve, and deduplicate webhooks; enforce logout, expiry, invalidation, and membership-disable behavior on subsequent calls.

**Required proof:** adapter contract tests, invalid/expired credential tests, webhook signature and idempotency tests, session lifecycle e2e tests, and a documented revocation-window measurement.

### Phase 3: public capabilities and tokens

**Purpose:** implement public booking authorization without granting dashboard roles.

**IDs:** `DIVE-IAM-REQ-007..009`, `024`, `026`, `028`.

**Dependencies:** approved Phase 0 token/channel decisions and the applicable `SPEC-DIVE-BOOKING-001` and `SPIKE-DIVE-003` contracts.

**Work:** resolve tenant, center, and published resources from server-side channel configuration; implement opaque, single-purpose, expiring tokens; restrict confirmation and cancellation to the linked booking; prevent disclosure of roles, other bookings, and other tenants.

**Required proof:** published/unpublished channel tests, token purpose and expiry tests, replay and tampering tests, cross-tenant tests, and public-response non-disclosure tests.

### Phase 4: purpose-limited data and support access

**Purpose:** add the privileged and privacy-sensitive paths after the authorization and session boundaries are stable.

**IDs:** `DIVE-IAM-REQ-015`, `019..020`, `024..025`, `028`.

**Work:** implement purpose-limited `customer_contact.read`, future step-up fields, and read-only support access with explicit tenant, justification, expiry, and audit context. Keep write support disabled until the SPEC permits it.

**Required proof:** purpose enforcement, step-up compatibility, support expiry, wrong-tenant, missing-justification, write-denial, and audit tests.

### Phase 5: conformance closeout

**Purpose:** prove the whole contract and remove stale partial-coverage claims.

**IDs:** `DIVE-IAM-REQ-001..028`, excluding implementation of deferred `DIVE-IAM-REQ-027`.

**Work:** run the complete unit, integration, contract, isolation, concurrency, API e2e, and operational evidence set. Reconcile the requirement matrix, TRACE, follow-ups, PR validation, and known gaps. Keep unresolved decisions and deferred operations explicit.

**Exit gate:** every in-scope requirement has executable proof or an approved documented exception; no public-token, support-expiry, revocation, audit, or cross-tenant evidence is represented as complete without the corresponding test or evidence artifact.

## Pull request slices

Recommended order:

1. Decision records and test fixtures for Phase 0.
2. Permission catalog and complete internal role matrix.
3. Membership invitations, state transitions, audit, and outbox.
4. Clerk adapter, webhooks, and sessions.
5. Public channels and public tokens.
6. Purpose-limited contact access and support grants.
7. Conformance evidence and TRACE closeout.

Each slice should remain independently reviewable and should not claim requirements owned by a later slice.

## Per-PR completion checklist

- Affected `DIVE-IAM-*` IDs and applicable ADRs are listed.
- Any new decision is labeled `Documented`, `Derived`, or `Proposed`.
- Tests exercise observable authorization behavior and boundary failures.
- Isolation, security, privacy, audit, rollback, and migration impact are recorded when applicable.
- Validation lists commands actually run and separates known gaps.
- TRACE points only to existing proof.
- Follow-ups are updated without restating or changing the SPEC.