# SPEC-DIVE-BOOKING-001 — Bookings, widget, and calendar

- **Status:** Draft
- **Version:** 1.5
- **Last reviewed:** 2026-09-30
- **Approved by:** Product owner
- **Approval reference:** PR #1, provenance migration PR, product confirmations 2026-09-27 for catalog HTTP, slot time representation, public visibility of full slots, ADR-DIVE-010 public create closures, and explicit approval by Product, Security, and Architecture on 2026-09-27 of the point 1 rejection contract and public capability contract; PR #35 product-owner confirmations on 2026-09-27 for simple page pagination on activity and slot lists, catalog DTOs, and persistence naming; merged ADR-DIVE-015 and explicit product-owner confirmation on 2026-09-30 that its decisions govern the booking-model reconciliation
- **Owner:** Product / Booking
- **IDs:** Only the requirements declared below; moved IDs retain their identifiers in the ownership map.

## Normative authority

**Documented:** this file remains the entry point and owns the requirements declared here. Each moved ID has one owner below; existing references can continue to enter through this map. The structural split preserves requirement text and original provenance. New proposals remain Draft.

| Contract | Requirement owner |
|---|---|
| Fixed-time catalog and HTTP | [SPEC-DIVE-BOOKING-CATALOG-001](SPEC-DIVE-BOOKING-CATALOG-001.md) |
| Published channels and public creation | [SPEC-DIVE-BOOKING-PUBLIC-001](SPEC-DIVE-BOOKING-PUBLIC-001.md) |
| Public booking credentials and recovery | [SPEC-DIVE-BOOKING-CAPABILITIES-001](SPEC-DIVE-BOOKING-CAPABILITIES-001.md) |
| Widget integration and hosted fallback | [SPEC-DIVE-BOOKING-WIDGET-001](SPEC-DIVE-BOOKING-WIDGET-001.md) |
| Expanded scheduling and calendar | [SPEC-DIVE-BOOKING-SCHEDULING-001](SPEC-DIVE-BOOKING-SCHEDULING-001.md) |

## Requirement provenance

| Requirement IDs | Provenance | Exact source | Decision status |
|---|---|---|---|
| `DIVE-BOOK-REQ-001..DIVE-BOOK-REQ-003` | `Derived` | `specs/foundation/multitenancy-architecture.md`; `specs/architecture/adrs/ADR-DIVE-001.md`; PR #1 | Approved by product owner |
| `DIVE-BOOK-REQ-005..DIVE-BOOK-REQ-006` | `Derived` | `specs/foundation/multitenancy-architecture.md`; `specs/architecture/adrs/ADR-DIVE-001.md`; PR #1 | Approved by product owner |
| `DIVE-BOOK-REQ-008` | `Derived` | `specs/foundation/multitenancy-architecture.md`; `specs/architecture/adrs/ADR-DIVE-001.md`; PR #1 | Approved by product owner |
| `DIVE-BOOK-REQ-013..DIVE-BOOK-REQ-014` | `Derived` | `specs/product/dive-mvp-profile.md`; PR #1 | Approved by product owner |
| `DIVE-BOOK-REQ-016` | `Derived` | `specs/product/dive-mvp-profile.md`; PR #1 | Approved by product owner |
| `DIVE-BOOK-REQ-024` | `Proposed` | PR #1 booking lifecycle consolidation | Approved by product owner for MVP validation |
| `DIVE-BOOK-REQ-025..DIVE-BOOK-REQ-028` | `Derived` | `specs/spikes/SPIKE-DIVE-001/specification.md`; `specs/spikes/SPIKE-DIVE-001/requirements.md`; PR #1 | Approved by product owner |
| `DIVE-BOOK-REQ-030..DIVE-BOOK-REQ-032` | `Derived` | `specs/spikes/SPIKE-DIVE-001/specification.md`; `specs/spikes/SPIKE-DIVE-001/requirements.md`; PR #1 | Approved by product owner |
| `DIVE-BOOK-REQ-033` | `Proposed` | PR #1 mutation and cancellation consolidation | Approved by product owner for MVP validation |
| `DIVE-BOOK-REQ-035..DIVE-BOOK-REQ-036` | `Proposed` | PR #1 mutation and cancellation consolidation | Approved by product owner for MVP validation |
| `DIVE-BOOK-REQ-044..DIVE-BOOK-REQ-046` | `Derived` | `specs/foundation/security-privacy-baseline.md`; `specs/foundation/operations-quality-recovery.md`; `specs/product/dive-mvp-profile.md`; PR #1 | Approved by product owner |
| `DIVE-BOOK-REQ-048` | `Derived` | `specs/foundation/security-privacy-baseline.md`; `specs/foundation/operations-quality-recovery.md`; `specs/product/dive-mvp-profile.md`; PR #1 | Approved by product owner |
| `DIVE-BOOK-REQ-068..DIVE-BOOK-REQ-069` | `Proposed` | Product, Security, and Architecture approval on 2026-09-27 of the rejected-booking state and internal rejection contract | Approved; Ready to start |

## Requirements

- **DIVE-BOOK-REQ-001:** Every activity, slot, booking, channel, and booking-related audit/outbox record belongs to exactly one tenant and one center of that tenant. Cross-tenant relations are impossible.

- **DIVE-BOOK-REQ-002:** A center is an operational scope. Center identifiers never authorize access by themselves.

- **DIVE-BOOK-REQ-003:** Confirmed, held, and blocked seats never exceed the slot’s authoritative capacity.

- **DIVE-BOOK-REQ-005:** Every tenant-owned booking table has a non-null `tenant_id`.

- **DIVE-BOOK-REQ-006:** Errors, empty results, and not-found responses never reveal bookings, slots, or contacts of another tenant or unauthorized center.

- **DIVE-BOOK-REQ-008:** Logs and traces carry a correlation ID and a safe tenant identifier when needed, and omit unnecessary PII.

- **DIVE-BOOK-REQ-013:** Booker contact in the MVP is first name, last name, and email; phone is optional. No medical, certification, or emergency fields.

- **DIVE-BOOK-REQ-014:** Participant records, if collected, are limited to non-sensitive identifiers such as name and optional email. They are not an operational manifest.

- **DIVE-BOOK-REQ-016:** An optional external reference per channel may be stored for idempotency or reconciliation. It is never an authorization credential.

- **DIVE-BOOK-REQ-024:** Manual confirmation, rejection, and expiry of `Pending` bookings are deterministic. Held seats are released or blocked exactly once.

- **DIVE-BOOK-REQ-025:** When two bookings compete for the last remaining seat, exactly one confirms or holds that seat; the other receives a stable unavailability result.

- **DIVE-BOOK-REQ-026:** Public and manual channels apply the same capacity rule.

- **DIVE-BOOK-REQ-027:** A multi-seat request consumes or holds exactly the requested number of seats and never exceeds remaining sellable capacity.

- **DIVE-BOOK-REQ-028:** Idempotency keys are unique within tenant and channel. A retry returns the persisted result without duplicating booking, seats, audit, email, or outbox.

- **DIVE-BOOK-REQ-030:** A booking competing with slot closure has one observable order: if closure wins, the booking is rejected; if the booking wins, it is confirmed or held and closure only prevents further new bookings.

- **DIVE-BOOK-REQ-031:** A booking competing with full slot cancellation has one observable order, leaves no active bookings on a cancelled slot, and emits coherent audit and outbox records.

- **DIVE-BOOK-REQ-032:** Expiry, rejection, and cancellation release or block seats exactly once, including concurrent workers.

- **DIVE-BOOK-REQ-033:** Non-structural fields (copy, notes, localization, non-capacity metadata) may be edited in place with audit.

- **DIVE-BOOK-REQ-035:** Staff cancellation releases seats back to sellable capacity by default. An explicit authorized choice may instead retain them as blocked under `DIVE-BOOK-REQ-036`.

- **DIVE-BOOK-REQ-036:** Staff cancellation may instead block those seats. Blocked seats remain counted in the invariant until explicitly released by an authorized capability.

- **DIVE-BOOK-REQ-044:** Confirmation and cancellation emails are produced through `TransactionalEmailPort` via the transactional outbox. The worker is idempotent.

- **DIVE-BOOK-REQ-045:** Domain change, audit record, and outbox record for the same operation commit atomically or not at all.

- **DIVE-BOOK-REQ-046:** MVP booking does not collect payments, medical answers, diagnoses, document images, emergency contacts, or certification evidence.

- **DIVE-BOOK-REQ-048:** Booking-related personal data is limited to contact and booking operation. Retention, export, correction, and deletion follow the privacy baseline and must be defined before any real-data pilot.

- **DIVE-BOOK-REQ-068:** Booking states are `Pending`, `Confirmed`, `Rejected`, `Cancelled`, and `Expired`. The allowed booking transitions are `Pending → Confirmed | Rejected | Cancelled | Expired` and `Confirmed → Cancelled`. `Rejected`, `Cancelled`, and `Expired` are terminal. Rejection applies only to `Pending` bookings and releases their held seats exactly once. Blocking a rejected booking is outside this command and requires a separate explicitly authorized action.

- **DIVE-BOOK-REQ-069:** Authorized staff reject a booking through `POST /v1/centers/:centerId/bookings/:bookingId/reject` with Clerk authentication, `X-Tenant-Context`, current center scope, and `booking.reject`. The request has no required body or free-text reason. A `Pending` booking returns `204`, transitions to `Rejected`, releases held seats exactly once, and atomically records the booking change, audit event, and `booking.rejected` outbox event. Repeating the command for an already `Rejected` booking returns `204` without duplicating effects. A command for `Confirmed`, `Cancelled`, or `Expired` returns `409 booking_state_conflict`; missing authentication/context returns `401`, a missing capability returns `403`, and an out-of-scope resource returns the existing non-disclosing `404` contract. A competing confirmation, cancellation, or expiry has one observable order and only the winning transition applies its side effects.

## Goal

Let a dive center publish availability, accept online bookings, and manage a simple internal calendar that combines online and manual bookings, without overselling and without storing medical or operational-trip data.

## Scope

In scope for the MVP:

- Tenant + center scoped catalog of activities and slots
- Public availability
- Online booking from widget or hosted page
- Manual booking from the dashboard
- Calendar of slots and bookings
- Confirmation and cancellation
- Idempotency, audit, and transactional outbox
- Spanish and English

Out of scope:

- Payments, deposits, invoicing, refunds
- Check-in, manifest, departure, return, incidents
- Certifications, eligibility, emergency contacts, medical answers or document images
- Waitlists, dynamic pricing, multi-center public catalogs
- Marketplace / OTA distribution
- Offline operation

## Booking rejection HTTP

This authenticated dashboard command is separate from public cancellation. `:centerId` and `:bookingId` are selectors; tenant, center scope, roles, and permissions come from the authenticated request and PostgreSQL authorization state.

| Method and path | Required authorization | Effect |
|---|---|---|
| `POST /v1/centers/:centerId/bookings/:bookingId/reject` | Clerk session, `X-Tenant-Context`, center scope, `booking.reject` | Reject a `Pending` booking and release its held seats once |

The command uses `application/problem+json` for failures. A repeated command against `Rejected` is idempotent success; incompatible terminal states return `409 booking_state_conflict`. No customer email is emitted by this command in the MVP.

## Security, privacy, and operations

Authorization follows `SPEC-DIVE-IAM-001`. Isolation, RLS, pooling, and async propagation follow `specs/foundation/multitenancy-architecture.md` and `specs/multitenancy/adoption-profile.md`.

No real personal data in development, preview, or staging for this increment.

## Dependencies

- `specs/architecture/adrs/ADR-DIVE-001.md`
- `specs/architecture/adrs/ADR-DIVE-002.md`
- `specs/architecture/adrs/ADR-DIVE-005.md`
- `specs/architecture/adrs/ADR-DIVE-008.md`
- `specs/architecture/adrs/ADR-DIVE-010.md`
- `specs/iam/SPEC-DIVE-IAM-001.md`
- `specs/spikes/SPIKE-DIVE-001/` for last-seat evidence
- `specs/spikes/SPIKE-DIVE-003/` for widget evidence
- Cross-cutting `MT-SPIKE-001` evidence before a real-data pilot

## Tests and open contracts

**Documented:** test capacity/state transitions, real PostgreSQL last-seat and lifecycle concurrency with barriers (SPIKE-DIVE-001), and atomic audit/outbox. No real personal data is allowed for this increment. Applicable MT-SPIKE-001 evidence remains separate. Catalog test fixtures are not an onboarding API; SPEC-DIVE-ONBOARDING-001 now owns bootstrap.

**Proposed, Draft:** complete the manual-create, staff-confirm, staff-cancel, blocked-seat release and internal expiry command contracts before implementation. Specify permissions, closed input, HTTP/errors, replay scope, concurrent state ordering, notifications and atomic seat/audit/outbox effects. Existing permissions must not silently imply a new blocking capability. Structural mutation belongs to the scheduling owner.
