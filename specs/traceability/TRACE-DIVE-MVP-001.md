# TRACE-DIVE-MVP-001 — Artifact map & traceability (MVP)

- **Status:** initial
- **Purpose:** define where each SDD artifact lives and track coverage without duplicating requirements.

## Artifact map

- MVP product profile → `specs/product/dive-mvp-profile.md`
- ADR-DIVE-001 → `specs/architecture/adrs/ADR-DIVE-001.md`
- ADR-DIVE-002 → `specs/architecture/adrs/ADR-DIVE-002.md`
- Booking spec → `specs/booking/SPEC-DIVE-BOOKING-001.md`
- IAM spec → `specs/iam/SPEC-DIVE-IAM-001.md`
- This trace map → `specs/traceability/TRACE-DIVE-MVP-001.md`

## Maintenance rule

TRACE records relationships and coverage; it must never copy or redefine the normative text of requirements.

Each functional PR should reference:
- implemented/affected requirements
- applicable ADR(s)
- tests
- evidence (when applicable)
- traceability updates (when coverage changes)