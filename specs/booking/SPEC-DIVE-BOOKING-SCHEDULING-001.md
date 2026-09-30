# SPEC-DIVE-BOOKING-SCHEDULING-001 - Expanded scheduling and calendar

- **Status:** Draft
- **Version:** 0.1
- **Last reviewed:** 2026-09-30
- **Owner:** Product / Booking
- **Approval reference:** Unchanged requirements and approval records extracted from SPEC-DIVE-BOOKING-001 at commit `86e9d97`; documentation split requested 2026-09-30. No new semantic approval or status promotion is inferred.

## Normative authority

**Documented:** owns only the requirements declared below, extracted verbatim from [SPEC-DIVE-BOOKING-001](SPEC-DIVE-BOOKING-001.md). Original Derived/Proposed classifications, sources and approvals are preserved. This file does not authorize unrelated contracts or infer conformance from implementation existence.

## Requirement provenance

| Requirement IDs | Provenance | Exact source | Decision status |
|---|---|---|---|
| `DIVE-BOOK-REQ-010` | `Derived` | `specs/product/dive-mvp-profile.md`; PR #1 | Approved by product owner |
| `DIVE-BOOK-REQ-012` | `Derived` | `specs/product/dive-mvp-profile.md`; PR #1 | Approved by product owner |
| `DIVE-BOOK-REQ-021` | `Proposed` | PR #1 booking lifecycle consolidation | Approved by product owner for MVP validation |
| `DIVE-BOOK-REQ-029` | `Derived` | `specs/spikes/SPIKE-DIVE-001/specification.md`; `specs/spikes/SPIKE-DIVE-001/requirements.md`; PR #1 | Approved by product owner |
| `DIVE-BOOK-REQ-034` | `Proposed` | PR #1 mutation and cancellation consolidation | Approved by product owner for MVP validation |
| `DIVE-BOOK-REQ-037..DIVE-BOOK-REQ-038` | `Derived` | `specs/architecture/adrs/ADR-DIVE-002.md`; `specs/spikes/SPIKE-DIVE-003/specification.md`; PR #1; product confirmation by the product owner on 2026-09-27 for public visibility of full slots | Approved by product owner, including `Available` + `Full` visibility on 2026-09-27 |
| `DIVE-BOOK-REQ-043` | `Derived` | `specs/foundation/security-privacy-baseline.md`; `specs/foundation/operations-quality-recovery.md`; `specs/product/dive-mvp-profile.md`; PR #1 | Approved by product owner |
| `DIVE-BOOK-REQ-049` | `Proposed` | Product confirmation by the product owner on 2026-09-27 for US-08 catalog HTTP, center-scoped operations, slot time representation, listing defaults, and PR #35 page-pagination contract for activity/slot listing | Approved by product owner 2026-09-27 for MVP validation |

## Requirements

- **DIVE-BOOK-REQ-010:** A scheduled activity is distinct from both its activity and its availability configuration. Once exact scheduling exists, it has start time, duration or end time, capacity, and state. A recurrence day without an exact time and a date-free offer MUST NOT be represented as a concrete scheduled activity with a fabricated or null start.

- **DIVE-BOOK-REQ-012:** A booking references exactly one activity, a positive seat count, a stable `booking_channel`, and a booker contact. It may initially reference one scheduled activity, one center-published day without an exact time, or no date. Whether one booking may later relate to multiple scheduled activities for a multi-session course remains an open Draft decision.

- **DIVE-BOOK-REQ-021:** For a booking assigned to a scheduled activity, `Pending` holds seats and `Confirmed` consumes seats. `Cancelled` and `Expired` do not consume seats unless staff explicitly blocks them. A booking without a scheduled activity does not consume or hold occurrence capacity; its scheduling and commercial states remain Draft and MUST NOT silently reuse `Pending`.

- **DIVE-BOOK-REQ-029:** Authoritative occurrence capacity resides on the scheduled activity, not on the activity catalog record or availability configuration. No capacity guarantee exists before a booking is assigned to a scheduled activity unless a later approved contract defines one.

- **DIVE-BOOK-REQ-034:** An authorized staff operation may change the scheduled activity, date/time, or seat count while preserving booking identity. It MUST revalidate capacity and apply the booking change, capacity effects, audit, and outbox atomically with one observable concurrency order. Public customers do not perform this structural edit; they cancel and create another booking. Exact HTTP, idempotency, notification, and incompatible-state rules remain Draft.

- **DIVE-BOOK-REQ-037:** Channel type `center_catalog` exposes a server-derived public projection of eligible published activities and the availability configurations or scheduled activities explicitly included by that published channel. Future scheduled activities in `Available` or `Full` may appear; `Full` is non-bookable and `Closed` or `Cancelled` is excluded. Internal catalog visibility never implies public publication.

- **DIVE-BOOK-REQ-038:** Channel type `single_activity` exposes one eligible published activity and only the center-controlled availability included by that published channel: fixed scheduled activities, published recurrence days with optional exact times, or date-free booking. `Full` scheduled activities are visible as non-bookable; `Closed`, `Cancelled`, excluded dates, and closed ranges are excluded.

- **DIVE-BOOK-REQ-043:** The center dashboard calendar shows authorized online and manual bookings and scheduled activities in day, week, and month views, opening on the current week. It distinguishes bookings still missing a date or exact time from concrete scheduled activities. Filtering is required; exact filter fields and URL behavior remain Draft.

- **DIVE-BOOK-REQ-049:** A concrete scheduled activity persists `starts_at` as timestamptz and `duration_minutes` as a positive integer; end is derived and remaining sellable seats are derived from bookings. Recurrence without an exact time and date-free booking belong to availability or scheduling records and MUST NOT fabricate `starts_at`. Their physical persistence remains Draft.

### ADR-DIVE-015 precedence and reconciliation boundary

`ADR-DIVE-015` records product decisions explicitly approved by the product owner on 2026-09-30. Where this SPEC's previous fixed-slot-only wording conflicts with that ADR, the ADR governs the product direction. This revision marks the SPEC Draft while the affected state, capacity, recurrence, publication, HTTP, persistence, migration, and compatibility contracts are reconciled.

The existing fixed-time slot contract remains valid for that implemented slice, but it is no longer the exclusive booking model. This Draft does not authorize implementation of date-free or time-free booking, multi-session courses, recurrence materialization, or staff structural mutation until their open contracts below are closed. Unaffected Ready-to-start behavior must not be weakened by this reconciliation.

## Definitions

- **Activity (booking service):** catalog offering configured by a center, e.g. “Discover Scuba Dive”. It may propose a default capacity. It is not the authoritative capacity record.
- **Availability configuration:** center-controlled rule that offers one-off dates, recurrence with optional exact time, or date-free booking; it is distinct from a concrete scheduled activity.
- **Scheduled activity (`Slot` in the current fixed-time implementation):** concrete execution of an activity once its exact start, duration, capacity, and state are known. It is the authoritative capacity record for bookings assigned to it.
- **Booking:** customer commitment for one or more seats in an activity. It may initially select a scheduled activity, a center-published day without an exact time, or no date when the center will schedule it later. Multi-session cardinality remains open in this Draft.
- **Booker:** responsible contact for the booking.
- **Channel:** server-side public or internal entry configuration. Browser input never authorizes tenant, center, activity, or slot.
- **Held seats:** seats reserved by a `Pending` booking that has not yet confirmed, expired, or been rejected.
- **Blocked seats:** seats withheld from sale after a staff cancellation or full slot cancellation, until explicitly released.
- **Session:** authentication/session lifecycle only. Do not use “session” for a slot.

## Open questions

The existing US-08 fixed-time catalog contract remains closed for its implemented slice. ADR-DIVE-015 opens the following blocking reconciliation questions for the expanded model:

1. Booking and scheduling state machines for day-without-time and date-free booking.
2. Capacity and hold behavior before a concrete scheduled activity exists.
3. Multi-session course cardinality and partial scheduling.
4. Recurrence, exclusion, time-zone, materialization, and rule-edit semantics.
5. Channel inclusion and publication lifecycle for availability configurations and scheduled activities.
6. Exact staff structural-mutation HTTP, idempotency, incompatible-state, notification, and concurrency contract.
7. Resolution workflow when closures overlap existing scheduled activities or bookings.
8. Exact calendar and activity-list filters.
9. HTTP routes, DTOs, stable errors, persistence, migration, and backward compatibility for the expanded model.

Cursor pagination remains deferred. Staff assignment remains deferred and no permission, role, eligibility rule, or schema is authorized by this revision.
