# SPIKE-DIVE-001 — Last-seat booking concurrency

- **Status:** Draft
- **Hypothesis:** A short transaction with row locking on the slot plus scoped idempotency can satisfy the booking capacity invariant on shared PostgreSQL.

## Question

Can public and internal bookings compete for the last capacity without overselling or duplicating bookings, audit, or notifications?

## Scope

Capacity, concurrency, idempotency, audit, and outbox only. Widget integration and full booking delivery are excluded.

## Method

Implement the smallest representative slice, execute deterministic positive and negative scenarios against real infrastructure where applicable, record commands and environment, and store reproducible evidence without real personal data.

## Required scenarios

1. Two public bookings compete for one seat; exactly one succeeds.
2. A public and a manual booking compete under the same rule.
3. A multi-seat request never exceeds remaining capacity.
4. A repeated idempotency key returns the persisted result without duplicate side effects.
5. Booking competes with slot closure.
6. Booking competes with full slot cancellation.
7. Pending requests release held seats exactly once on rejection, cancellation, or expiry.
8. Audit and outbox represent committed transactions only.
9. Public configuration manipulation cannot cross tenant or center boundaries.

## Dependencies

- specs/booking/SPEC-DIVE-BOOKING-001.md
- specs/architecture/adrs/ADR-DIVE-002.md
- specs/multitenancy/adoption-profile.md

## Closure outcomes

`Accepted`, `Accepted with conditions`, `Requires modification`, or `Rejected`. A conclusion requires committed tests and reproducible evidence; this document alone is not evidence.
