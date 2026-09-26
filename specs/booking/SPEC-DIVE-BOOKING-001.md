# SPEC-DIVE-BOOKING-001 — Bookings, widget, and calendar

- **Status:** Ready to start
- **Scope:** operable MVP for acquisition + booking management (including minimum support functionality).

## Normative authority

This SPEC is the single normative source for:
- booking service/activity, scheduled activity/slot, booking, capacity, confirmation, modification, cancellation, and channels.

Other docs (profile, spikes, traceability, deliverables) must link to this contract, not redefine it.

## Goal

Allow a center to publish availability, accept online bookings, and manage a simple internal calendar that combines online + manual bookings.

## MVP surfaces

1. Public embedded widget (responsive iframe)
2. Online booking flow (availability → seats → minimum contact → confirmation)
3. Internal dashboard (calendar, booking management, manual bookings)

A hosted public booking page must exist as a fallback and alternative integration method.

## Minimal domain model

- Tenant + Center (scope)
- Booking service (activity)
- Slot (scheduled occurrence) with its own identity, capacity, and state
- Booking (pending/confirmed/canceled/expired) with stable `booking_channel`
- Booker/responsible contact (first name, last name, email; optional phone)
- Participants (optional emails)
- Controlled form configuration (no silent expansion into sensitive data)
- Channel configuration (opaque, server-side)
- Optional external reference per channel (idempotency/reconciliation, never authorization)

## Minimal states

- Service: Draft → Published → Disabled
- Slot: Available → Full → Closed/Cancelled
- Booking: Pending → Confirmed → Cancelled/Expired

## Key requirements (operational extract)

- Isolation: no cross-tenant relations
- No overselling under concurrency (“last seat”)
- Idempotency with no duplicate side effects
- Public cancellation uses opaque, single-purpose, expiring tokens
- Stable channel identifiers (not just “online/manual”)
- Transactional email is outbox-driven via a portable port
- English + Spanish supported from MVP

## Dependencies

- ADR-DIVE-001, ADR-DIVE-002
- SPEC-DIVE-IAM-001
- Cross-cutting multi-tenant validation evidence
- SPIKE-DIVE-001 (last-seat concurrency)
- SPIKE-DIVE-003 (widget integration/security)