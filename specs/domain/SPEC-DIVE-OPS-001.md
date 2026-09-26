# SPEC-DIVE-OPS-001 — Trip, participation, and manifest

- **Status:** Deferred
- **Version:** 0.3-draft
- **Last reviewed:** 2026-09-26
- **Approved by:** Borja (Product owner)
- **Approval reference:** PR #1 and this provenance migration PR
- **Owner:** Product / Operations

## Normative authority

This SPEC will be the normative source for advanced trip operations when the capability is activated. It does not modify the booking MVP governed by `specs/booking/SPEC-DIVE-BOOKING-001.md`.

A booking may produce zero, one, or many participations. The conversion contract is **not accepted** and must be defined before activation.

## Requirement provenance

This Deferred SPEC existed before the provenance migration. The immutable pre-migration commit and PR #1 are retained as its documentary source; activation still requires the gates below.

| Requirement IDs | Provenance | Exact source | Decision status |
|---|---|---|---|
| `DIVE-OPS-REQ-001..DIVE-OPS-REQ-009` | `Documented` | `specs/domain/SPEC-DIVE-OPS-001.md` at commit `341a2de0acad4c1677bde9e848eaa84f5cf063b9`; PR #1 | Approved as Deferred design; not approved for implementation |

## Goal

Provide one auditable operational record for a dive trip from preparation through return: participants, responsible staff, check-in, manifest, departure, return, discrepancies, and closure.

## Scope

- Trip planning within one tenant and center
- Participation linked to, but distinct from, booking
- Check-in and manifest closure
- Departure and return records
- Auditable corrections after departure

## Out of scope

- Payments and invoicing
- Equipment inventory and maintenance
- Medical questionnaires or document copies
- Automatic certification verification
- Offline operation and synchronization

## Model

- **Trip:** center-scoped operational occurrence with schedule, activity, capacity, responsible staff, and state
- **Participation:** a person's operational participation in a trip
- **Manifest:** immutable, auditable snapshot of participants and staff at departure
- **Return record:** reconciliation between departed and returned people

## Proposed states

- Trip: `Draft -> Open -> Ready -> In progress -> Completed`; `Cancelled` is terminal
- Participation: `Reserved -> Checked in -> Departed -> Returned`; `Cancelled` and `No show` are alternatives

## Requirements

- **DIVE-OPS-REQ-001:** every trip belongs to exactly one tenant and one center of that tenant
- **DIVE-OPS-REQ-002:** a trip cannot become Ready without responsible staff and an identifiable manifest
- **DIVE-OPS-REQ-003:** only explicitly authorized capabilities may close a manifest, depart, cancel, or complete a trip
- **DIVE-OPS-REQ-004:** corrections after departure preserve actor, reason, timestamp, previous value, and new value
- **DIVE-OPS-REQ-005:** closure reconciles departed and returned people and requires every discrepancy to be resolved or escalated
- **DIVE-OPS-REQ-006:** errors never reveal trips or participants from another tenant or unauthorized center
- **DIVE-OPS-REQ-007:** domain change, audit event, and outbox event are atomic when emitted by the same operation
- **DIVE-OPS-REQ-008:** no diagnosis, medical answer, or document image is stored without a later legal and product decision
- **DIVE-OPS-REQ-009:** operational transitions emit idempotent events carrying tenant and correlation identifiers

## Activation gate

Deferred until the booking MVP is validated, the booking-to-participation contract is defined, IAM includes operational roles, multi-tenant evidence exists, and SPIKE-DIVE-002 has completed legal/privacy discovery.

Do not implement this SPEC in the booking walking skeleton.
