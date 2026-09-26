# TRACE-DIVE-MVP-001 — Artifact map and coverage

- **Status:** Ready to start
- **Version:** 0.5
- **Purpose:** locate every SDD artifact and track coverage without copying requirement text.

## Artifact map

| Artifact | Path | Status | Version |
|---|---|---|---|
| Product profile | `specs/product/dive-mvp-profile.md` | Ready to start | 0.5 |
| Foundation — multitenancy | `specs/foundation/multitenancy-architecture.md` | Ready to start | 0.2 |
| Foundation — IAM | `specs/foundation/iam-baseline.md` | Ready to start | 0.2 |
| Foundation — security/privacy | `specs/foundation/security-privacy-baseline.md` | Ready to start | 0.2 |
| Foundation — operations | `specs/foundation/operations-quality-recovery.md` | Ready to start | 0.2 |
| Foundation — SDD | `specs/foundation/sdd-specs-traceability.md` | Ready to start | 0.3 |
| Adoption profile | `specs/multitenancy/adoption-profile.md` | Draft | 0.3 |
| ADR-DIVE-001 | `specs/architecture/adrs/ADR-DIVE-001.md` | Ready to start | 0.2 |
| ADR-DIVE-002 | `specs/architecture/adrs/ADR-DIVE-002.md` | Ready to start | 0.2 |
| ADR-DIVE-003 | `specs/architecture/adrs/ADR-DIVE-003.md` | Ready to start | 0.1 |
| SPEC-DIVE-BOOKING-001 | `specs/booking/SPEC-DIVE-BOOKING-001.md` | Ready to start | 0.4 |
| SPEC-DIVE-IAM-001 | `specs/iam/SPEC-DIVE-IAM-001.md` | Ready to start | 0.3 |
| SPEC-DIVE-OPS-001 | `specs/domain/SPEC-DIVE-OPS-001.md` | Deferred | 0.2-draft |
| MT-SPIKE-001 | `specs/multitenancy/` | Draft / harness in PR, not closed | see spike files |
| SPIKE-DIVE-001 | `specs/spikes/SPIKE-DIVE-001/` | Draft / not executed | see spike files |
| SPIKE-DIVE-002 | `specs/spikes/SPIKE-DIVE-002/` | Deferred | see spike files |
| SPIKE-DIVE-003 | `specs/spikes/SPIKE-DIVE-003/` | Draft / not executed | see spike files |
| This map | `specs/traceability/TRACE-DIVE-MVP-001.md` | Ready to start | 0.5 |

Notion indexes must show this map’s version. They must not invent a second sequence (the previous Notion “mapa documental 0.7” is retired).

Notion pages are indexes only. They are not coverage evidence.

## Requirement groups

### Booking — `DIVE-BOOK-REQ-001` … `048`

| Group | IDs | Tests (expected) | Evidence |
|---|---|---|---|
| Isolation and identity | 001–008 | `packages/database/test/integration/*.integration.test.ts` | MT-SPIKE-001 |
| Catalog and model | 009–016 | domain unit tests | implementation PR |
| Lifecycle | 017–024 | booking integration | implementation PR |
| Capacity and concurrency | 025–032 | `tests/concurrency`, SPIKE-DIVE-001 | `evidence/spikes/SPIKE-DIVE-001/` |
| Mutation | 033–036 | booking integration | implementation PR |
| Channels and widget | 037–042 | SPIKE-DIVE-003, e2e | `evidence/spikes/SPIKE-DIVE-003/` |
| Delivery and privacy | 043–048 | outbox, i18n, privacy review | `evidence/` + dated review |

`DIVE-BOOK-REQ-003` is the capacity invariant. `DIVE-BOOK-REQ-029` states that capacity lives on the slot.

### IAM — `DIVE-IAM-REQ-001` … `028`

Covered by IAM unit/integration tests, public-token tests, and support-access tests. Cross-tenant cases also map to MT-REQ-*. Support-access expiry (`DIVE-IAM-REQ-020`, `DIVE-IAM-REQ-028`) is **not** an `MT-SPIKE-001` result (Option B).

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

These rows block declaring the reusable baseline fully adopted. They do not block closing `MT-SPIKE-001` once every `Gap` in that spike’s matrix is gone.

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

All MVP booking and IAM requirements are **specified, not implemented**. MT-SPIKE-001 has a PostgreSQL harness and tests; the scenario matrix still has `Gap` and `Partial` rows; results remain `Not executed` until CI evidence is recorded. Option B channels are deferred. Do not treat this map as verification.
