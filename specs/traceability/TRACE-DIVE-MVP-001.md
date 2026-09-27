# TRACE-DIVE-MVP-001 — Artifact map and coverage

- **Status:** Ready to start
- **Version:** 0.23
- **Purpose:** locate every SDD artifact and track coverage without copying requirement text.

## Artifact map

| Artifact | Path | Status | Version |
|---|---|---|---|
| Product profile | `specs/product/dive-mvp-profile.md` | Ready to start | 0.5 |
Dashboard tenant-context requirements `DIVE-IAM-REQ-029..032` are Ready to start with `ADR-DIVE-008` v0.9. Implementation coverage is recorded below.
| Foundation — multitenancy | `specs/foundation/multitenancy-architecture.md` | Ready to start | 0.2 |
| Foundation — IAM | `specs/foundation/iam-baseline.md` | Ready to start | 0.2 |
| Foundation — security/privacy | `specs/foundation/security-privacy-baseline.md` | Ready to start | 0.2 |
| Foundation — operations | `specs/foundation/operations-quality-recovery.md` | Ready to start | 0.2 |
| Foundation — SDD | `specs/foundation/sdd-specs-traceability.md` | Ready to start | 0.3 |
| Adoption profile | `specs/multitenancy/adoption-profile.md` | Draft | 0.4 |
| ADR-DIVE-001 | `specs/architecture/adrs/ADR-DIVE-001.md` | Ready to start | 0.2 |
| ADR-DIVE-002 | `specs/architecture/adrs/ADR-DIVE-002.md` | Ready to start | 0.2 |
| ADR-DIVE-003 | `specs/architecture/adrs/ADR-DIVE-003.md` | Ready to start | 0.1 |
| ADR-DIVE-004 | `specs/architecture/adrs/ADR-DIVE-004.md` | Ready to start | 0.3 |
| ADR-DIVE-005 | `specs/architecture/adrs/ADR-DIVE-005.md` | Ready to start | 0.1 |
| ADR-DIVE-006 | `specs/architecture/adrs/ADR-DIVE-006.md` | Ready to start | 0.1 |
| ADR-DIVE-007 | `specs/architecture/adrs/ADR-DIVE-007.md` | Ready to start | 0.2 |
| ADR-DIVE-008 | `specs/architecture/adrs/ADR-DIVE-008.md` | Ready to start | 0.9 |
| ADR-DIVE-009 | `specs/architecture/adrs/ADR-DIVE-009.md` | Draft | 0.1 |
| ADR-DIVE-010 | `specs/architecture/adrs/ADR-DIVE-010.md` | Draft | 0.1 |
| SPEC-DIVE-BOOKING-001 | `specs/booking/SPEC-DIVE-BOOKING-001.md` | Ready to start | 0.6 |
| SPEC-DIVE-IAM-001 | `specs/iam/SPEC-DIVE-IAM-001.md` | Ready to start | 0.10 |
| SPEC-DIVE-OPS-001 | `specs/domain/SPEC-DIVE-OPS-001.md` | Deferred | 0.2-draft |
| MT-SPIKE-001 | `specs/multitenancy/` | Accepted with conditions | 0.3 |
| SPIKE-DIVE-001 | `specs/spikes/SPIKE-DIVE-001/` | Draft / not executed | see spike files |
| SPIKE-DIVE-002 | `specs/spikes/SPIKE-DIVE-002/` | Deferred | see spike files |
| SPIKE-DIVE-003 | `specs/spikes/SPIKE-DIVE-003/` | Draft / not executed | see spike files |
| This map | `specs/traceability/TRACE-DIVE-MVP-001.md` | Ready to start | 0.23 |

Notion indexes must show this map’s version. They must not invent an independent version sequence.

Notion pages are indexes only. They are not coverage evidence.

## Requirement groups

### Booking — `DIVE-BOOK-REQ-001` … `057`

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
| Public create-booking closures | ADR-DIVE-010 Draft; no new SPEC IDs yet | none until ADR approved | none |
| Public create-booking closures | ADR-DIVE-010 Draft; no new SPEC IDs yet | none until ADR approved | none |

`DIVE-BOOK-REQ-003` is the capacity invariant. `DIVE-BOOK-REQ-029` states that capacity lives on the slot.

### IAM — `DIVE-IAM-REQ-001` … `032`

Coverage is recorded in the current-coverage table below. Cross-tenant cases also map to `MT-REQ-*` and remain separate from `DIVE-*` results. Public-token and support-access evidence is not yet available in this vertical.

Dashboard tenant-context requirements `DIVE-IAM-REQ-029..032` remain Ready to start. `ADR-DIVE-008` v0.9 closes center-application bootstrap with a platform subdomain `centerKey` and an equal body `centerRef`; custom center domains remain future scope. Implementation coverage for `DIVE-IAM-REQ-032` is not yet recorded.

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
| Official raw-body webhook verification plus database tenant resolution, idempotency, no grants, no authorization mutation, audit, and safe outbox signals | `DIVE-IAM-REQ-021` | `packages/identity/src/clerk-webhook.spec.ts`, `packages/database/test/integration/iam-identity-webhooks.integration.test.ts` |
| Dashboard tenant-context paths, opaque session-bound handles, active operator selection, request-time authorization, revocation, and non-disclosing cross-tenant denial | `DIVE-IAM-REQ-029..031` | `apps/api/test/iam.e2e-spec.ts`, `packages/database/test/integration/iam-api.integration.test.ts`, `packages/database/test/integration/migrations.integration.test.ts` |

### Partial or not yet demonstrated

Clerk authentication and session revocation (`DIVE-IAM-REQ-004`, `DIVE-IAM-REQ-016`, `DIVE-IAM-REQ-022`) remain Partial. `apps/api/test/iam.clerk.sandbox.e2e-spec.ts` records a dated Clerk Development run for browser authentication and provider session revocation; natural expiry, browser logout, Clerk-delivered webhooks, and production integration remain unproven. `packages/identity/src/clerk-token-verifier.spec.ts` and the deterministic seams cover the remaining contract cases. See `evidence/releases/iam-phase-2-revocation.md`.

Non-disclosure and complete sensitive-operation audit coverage (`DIVE-IAM-REQ-024`, `DIVE-IAM-REQ-025`) remain partial beyond the exposed center-read, membership-disable, and invitation persistence paths. Purpose-limited customer-contact access and booking-operation audit belong to later approved slices and are not demonstrated here.

Public capabilities and token limits (`DIVE-IAM-REQ-007..009`, `DIVE-IAM-REQ-026`) and support access plus expiry evidence (`DIVE-IAM-REQ-020`, `DIVE-IAM-REQ-028`) remain follow-ups. Provider-neutral assurance is demonstrated for current dashboard authentication, while the exact Clerk step-up contract remains open for Phase 4. See `docs/architecture/iam-vertical-follow-ups.md`. `DIVE-IAM-REQ-027` remains governed by deferred `SPEC-DIVE-OPS-001` scope. `MT-COND-IAM-001` and `MT-COND-WORKER-001` remain activation gates; Option B channels remain deferred. Do not treat this map as additional verification.

Approved Phase 0 decision relationships are recorded in `ADR-DIVE-004` through `ADR-DIVE-008`. Approval authorizes implementation but is not implementation evidence.
