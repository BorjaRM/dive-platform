# SPIKE-DIVE-001 — Last-seat booking concurrency

- **Status:** Draft
- **Type:** booking MVP spike
- **Hypothesis:** A short transaction with `SELECT … FOR UPDATE` on the slot, plus scoped idempotency, can satisfy the booking capacity invariant on shared PostgreSQL. Optimistic versioning is a comparison path only if contention is measured.

## Question

Can public widget, hosted page, and dashboard bookings compete for the last capacity without overselling or duplicating bookings, audit, or notifications?

## Contract of reference

Capacity semantics belong only to `specs/booking/SPEC-DIVE-BOOKING-001.md`. This spike does not redefine them. It proves they can be implemented.

## Scope

Capacity, concurrency, idempotency, audit, and outbox only.

Excluded: widget CMS integration, RLS as the primary object (belongs to MT-SPIKE-001), check-in/manifest, waitlist, payments, combined boat/instructor/equipment capacity.

## Required scenarios

1. Two public bookings compete for one seat; exactly one succeeds.
2. A public and a manual booking compete under the same rule.
3. A multi-seat request never exceeds remaining capacity.
4. A repeated idempotency key returns the persisted result without duplicate side effects.
5. Individual public cancel, staff cancel with release, and staff cancel with block all preserve `DIVE-BOOK-REQ-003`.
6. Booking competes with slot closure; one observable order.
7. Booking competes with full slot cancellation; no active bookings remain on a cancelled slot.
8. Pending requests release held seats exactly once on rejection, cancellation, or expiry, including concurrent workers.
9. Public configuration cannot replace tenant, center, activity, or slot to reach unauthorized resources.
10. Audit and outbox represent committed transactions only.
11. Concurrent errors do not expose other bookings or internal tenant data.

## Method

- Lock the slot row inside a short transaction
- Enforce idempotency uniqueness within tenant and channel
- Keep a slot version to detect unexpected writes; compare conditional update only if contention appears
- Run each scenario against real PostgreSQL with synchronization barriers, not persistence mocks
- Use at least two tenants and two centers
- Record measurements, limits, and the decision to keep or replace the locking strategy

## Dependencies

- `specs/booking/SPEC-DIVE-BOOKING-001.md`
- `specs/architecture/adrs/ADR-DIVE-002.md`
- `specs/multitenancy/adoption-profile.md`

## Closure outcomes

`Accepted`, `Accepted with conditions`, `Requires modification`, or `Rejected`. A conclusion requires committed tests and reproducible evidence.
