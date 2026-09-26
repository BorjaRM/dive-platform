# TRACE-DIVE-MVP-001 — Artifact map and coverage

- **Status:** Ready to start
- **Version:** 0.2
- **Purpose:** locate every SDD artifact and track coverage without copying requirement text.

## Artifact map

| Artifact | Path | Status |
|---|---|---|
| Product profile | `specs/product/dive-mvp-profile.md` | Ready to start |
| Foundation — multitenancy | `specs/foundation/multitenancy-architecture.md` | Ready to start |
| Foundation — IAM | `specs/foundation/iam-baseline.md` | Ready to start |
| Foundation — security/privacy | `specs/foundation/security-privacy-baseline.md` | Ready to start |
| Foundation — operations | `specs/foundation/operations-quality-recovery.md` | Ready to start |
| Foundation — SDD | `specs/foundation/sdd-specs-traceability.md` | Ready to start |
| Adoption profile | `specs/multitenancy/adoption-profile.md` | Draft |
| ADR-DIVE-001 | `specs/architecture/adrs/ADR-DIVE-001.md` | Ready to start |
| ADR-DIVE-002 | `specs/architecture/adrs/ADR-DIVE-002.md` | Ready to start |
| SPEC-DIVE-BOOKING-001 | `specs/booking/SPEC-DIVE-BOOKING-001.md` | Ready to start |
| SPEC-DIVE-IAM-001 | `specs/iam/SPEC-DIVE-IAM-001.md` | Ready to start |
| SPEC-DIVE-OPS-001 | `specs/domain/SPEC-DIVE-OPS-001.md` | Deferred |
| MT-SPIKE-001 | `specs/multitenancy/` | Draft / not executed |
| SPIKE-DIVE-001 | `specs/spikes/SPIKE-DIVE-001/` | Draft / not executed |
| SPIKE-DIVE-002 | `specs/spikes/SPIKE-DIVE-002/` | Deferred |
| SPIKE-DIVE-003 | `specs/spikes/SPIKE-DIVE-003/` | Draft / not executed |
| This map | `specs/traceability/TRACE-DIVE-MVP-001.md` | Ready to start |

Notion pages are indexes only. They are not coverage evidence.

## Requirement groups

### Booking — `DIVE-BOOK-REQ-001` … `048`

| Group | IDs | Tests (expected) | Evidence |
|---|---|---|---|
| Isolation and identity | 001–008 | `tests/integration/multitenancy`, `tests/security` | MT-SPIKE-001 |
| Catalog and model | 009–016 | domain unit tests | implementation PR |
| Lifecycle | 017–024 | booking integration | implementation PR |
| Capacity and concurrency | 025–032 | `tests/concurrency`, SPIKE-DIVE-001 | `evidence/spikes/SPIKE-DIVE-001/` |
| Mutation | 033–036 | booking integration | implementation PR |
| Channels and widget | 037–042 | SPIKE-DIVE-003, e2e | `evidence/spikes/SPIKE-DIVE-003/` |
| Delivery and privacy | 043–048 | outbox, i18n, privacy review | `evidence/` + dated review |

`DIVE-BOOK-REQ-003` is the capacity invariant. `DIVE-BOOK-REQ-029` states that capacity lives on the slot.

### IAM — `DIVE-IAM-REQ-001` … `028`

Covered by IAM unit/integration tests, public-token tests, and support-access tests. Cross-tenant cases also map to MT-REQ-*.

### Multi-tenant — `MT-REQ-001` … `010`

Owned by `specs/multitenancy/MT-SPIKE-001-requirements.md`. Do not merge into `DIVE-*` results.

### Operations — `DIVE-OPS-REQ-001` … `009`

Deferred. Not required to start the booking MVP.

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
Decision: ADR-DIVE-002
Tests: tests/concurrency/last-seat.spec.ts
Evidence: evidence/spikes/SPIKE-DIVE-001/
Traceability: TRACE-DIVE-MVP-001
```

## Current coverage

All MVP booking and IAM requirements are **specified, not implemented**. Spike results are `Not executed`. Do not treat this map as verification.
