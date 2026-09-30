# ADR-DIVE-015 — Activity scheduling, recurrence, and booking calendar

- **Status:** Accepted
- **Version:** 0.3
- **Date:** 2026-09-30
- **Deciders:** Product / Architecture / Data / Security
- **Affected IDs:** `DIVE-BOOK-REQ-009..014`, `017..021`, `025..036`, `037..038`, `043`, `049..065`

## Provenance

This ADR records product decisions explicitly confirmed by the product owner on 2026-09-30. `Proposed` records their origin, not a pending approval: the configuration model and stated architectural boundaries are now Accepted. Acceptance does not supply answers to unresolved state machines, HTTP contracts, concurrency, or migration decisions and is not implementation or pilot evidence.

**Proposed, explicitly accepted:** following the simplified-model proposal, viability analysis and documentation request, the product owner confirmed "no lo indiques como draft, esta aceptado" on 2026-09-30. This is the acceptance reference for the decisions below and the [field-level configuration contract](../../booking/SPEC-DIVE-BOOKING-SCHEDULING-001.md#configuration-contract). Open contracts remain implementation gates; no missing answer is inferred from acceptance.

| Decision | Provenance | Exact source | Approval / status |
|---|---|---|---|
| Separate activity, scheduled activity, and booking concepts | `Proposed` | Product confirmation by the product owner on 2026-09-30 | Accepted; acceptance reference above |
| Staff may structurally edit a booking in place from its detail or calendar drag-and-drop; public customers cancel and create another booking | `Proposed` | Product confirmation by the product owner on 2026-09-30 | Accepted direction reconciled in `DIVE-BOOK-REQ-034`; exact command contract remains open |
| Staff cancellation releases seats by default and may explicitly retain them as blocked | `Proposed` | Product confirmation by the product owner on 2026-09-30 | Accepted; specializes `DIVE-BOOK-REQ-035..036`; acceptance reference above |
| Calendar supports day, week, and month views and opens on the current week | `Proposed` | Product confirmation by the product owner on 2026-09-30 | Accepted; acceptance reference above |
| Calendar and activity lists support filtering; exact filters remain open | `Proposed` | Product confirmation by the product owner on 2026-09-30 | Accepted capability; exact filter contract remains open |
| An activity may use one-off dates, recurrence with optional exact time, or no published dates | `Proposed` | Product confirmations by the product owner on 2026-09-30 | Accepted; acceptance reference above |
| The center defines recurrence validity; no global recurrence horizon is selected here | `Proposed` | Product confirmation by the product owner on 2026-09-30 | Accepted; acceptance reference above |
| Weekly closures, specific excluded dates, and closed date ranges override recurrence | `Proposed` | Product confirmation by the product owner on 2026-09-30 | Accepted; acceptance reference above |
| Customers choose only center-published days/times, or book the activity without a date; they provide no scheduling preference and receive no counterproposal | `Proposed` | Product confirmations by the product owner on 2026-09-30 | Accepted; acceptance reference above |
| Participants have no independent identity in the MVP | `Proposed` | Product confirmation by the product owner on 2026-09-30 | Accepted; acceptance reference above |
| Staff assignment is deferred for later definition | `Proposed` | Product confirmation by the product owner on 2026-09-30 | Accepted deferral; acceptance reference above |
| One interval/weekday rule without `kind`; date-free eligibility belongs to Activity rather than a fabricated rule | `Proposed` | Simplified-model proposal and documentation request by the product owner on 2026-09-30 | Accepted; acceptance reference above |
| Center-wide dated closures and one weekly booking-settings record; no per-activity closure or per-rule exception model in this increment | `Proposed` | Same proposal and documentation request | Accepted; acceptance reference above |
| Capacity templates, stable on-demand occurrences, overlap rejection, explicit channel inclusion and non-destructive rule edits | `Proposed` | Viability-analysis recommendations preceding the documentation request on 2026-09-30 | Accepted boundaries; exact identities, concurrency and conflict contracts remain open |

## Context

The current booking model treats an activity as a catalog offering, a slot as one concrete dated occurrence with capacity, and a booking as seats on exactly one slot. It also requires cancellation-plus-replacement for changes to slot, date/time, or seat count. That model covers fixed occurrences but does not represent center-controlled recurrence without an exact time, booking an activity before scheduling, potentially multi-day courses, or product-approved staff editing that preserves booking identity.

This ADR captures the accepted product direction without supplying missing behavioral contracts or allocating new requirement IDs for unresolved behavior. Unaffected fixed-time implementation contracts remain valid.

## Decision

### Domain separation

- An **activity** is the center-scoped catalog offering.
- A **scheduled activity** is a concrete execution of an activity and owns its operational date/time, capacity, and execution state once those are known.
- A **booking** records the customer commitment and seat count. It may initially reference a scheduled activity, a center-published day without an exact time, or an activity that the center will schedule later.
- MVP participants do not have an independent identity or account. The booking retains its responsible booker contact and seat count under the privacy constraints of `SPEC-DIVE-BOOKING-001`.
- Staff assignment is outside this ADR and remains open for a later product decision.

### Center-controlled availability

An activity may be offered through one or more center-controlled availability configurations:

1. A one-off scheduled activity with an exact date and time.
2. A recurrence with a center-defined validity start and end, selected weekdays, and one or more optional exact times.
3. A recurrence with published days but no exact time; the customer selects only an available day and the center assigns the time later.
4. No published dates; the customer books the activity and the center schedules it later.

The customer does not submit preferred dates or times. The public surface offers only dates/times published by the center or a date-free activity booking. The center accepts or rejects where approval applies; there is no counterproposal flow.

### Simplified configuration boundary

**Proposed, accepted:** use one `AvailabilityRule` structure for a single date or bounded recurrence. Equal start/end dates represent one date; an optional weekday filter restricts the interval, and an optional local time distinguishes day selection from exact-time candidates. Multiple rules can represent multiple times without a `kind` field or cron expression.

`Activity.allow_booking_without_date` expresses independent date-free eligibility. Adding a dated rule does not implicitly remove that eligibility; publication still requires the approved channel boundary. `Activity` stays the commercial catalog owner, not the authoritative capacity owner.

`CenterClosure` represents dated center-wide closures, while one `CenterBookingSettings` record owns recurring unavailable weekdays. Closures are not replicated per activity. Positive exceptions, activity-specific closures and per-rule exception tables are not introduced by this proposal.

The [owning configuration contract](../../booking/SPEC-DIVE-BOOKING-SCHEDULING-001.md#configuration-contract) defines fields and candidate interpretation. Configuration is not a second booking engine: concrete slots, capacity, transaction boundaries and publication remain under their existing owners.

### Occurrence and edit boundary

**Proposed, accepted:** generate candidates for requested ranges without mandatory materialization of all future slots. Before committing seats for an exact-time execution, create or reuse one persistent `Slot` with known start, positive duration and authoritative capacity. A rule identifier is not sufficient occurrence identity: overlapping rules must not create independent capacity pools for the same execution.

For the first increment, reject coincident rule configurations with incompatible execution values rather than inventing rule precedence. Exact identity, overlap validation, simultaneous distinct executions and stable errors still need a contract.

Rule or center-setting edits change prospective offers, not committed execution details or existing bookings. Existing bookings and holds require explicit conflict handling, not automatic movement or cancellation. Booking and edit operations must have one observable order and revalidate the current rule, closure, channel and capacity boundaries; exact revision, locking and retry contracts remain open.

### Internal catalog and public availability

- The authorized center application may read the center's internal activities, availability configurations, scheduled activities, closures, and exceptions, including records that are not public.
- Public availability is a server-derived projection, not the internal catalog.
- An activity must be eligible for publication and included by a published channel before any of its availability can be exposed publicly.
- A scheduled activity or availability configuration that is not included by the published channel remains internal even when its activity is otherwise eligible for publication.
- Browser input never promotes internal catalog data into public availability and never establishes tenant, center, activity, or scheduling authority.

### Closures and exceptions

- Weekly unavailable weekdays are excluded from the applicable recurrence.
- The center may define specific excluded dates.
- The center may define inclusive closed date ranges, including seasonal closure.
- A closure or exclusion overrides a recurrence for new availability and bookings.
- Adding a closure does not silently cancel an existing scheduled activity or booking. The exact warning and resolution workflow remains open.

**Proposed, accepted:** apply center closures to new sales of existing concrete slots as well as rule-derived candidates. Separately surface conflicts with existing bookings for authorized resolution. Whether closure overlap evaluates the whole execution interval, and how closure applies to date-free offers, remain open rather than defaulting to start-date-only or blanket denial.

### Booking management and calendar

- Authorized staff may edit a booking while preserving its identity, including from booking detail and calendar drag-and-drop.
- Public customers do not structurally edit a booking; they cancel and create another booking.
- Staff cancellation releases seats by default. An explicit authorized choice may keep the seats blocked.
- The calendar provides day, week, and month views and initially displays the current week.
- Calendar and activity-list filtering are required capabilities; the exact filter fields, combinations, pagination interaction, and URL contract are deliberately left open.

## Consequences

- `DIVE-BOOK-REQ-010`, `012`, `029`, `034`, `037..038`, `043`, `049`, `052`, `057`, and the public-create contract require reconciliation before implementation of this model.
- Existing fixed-slot behavior remains governed by `SPEC-DIVE-BOOKING-001` until a separately reviewed SPEC revision supersedes it.
- `Pending` currently means a capacity-holding booking with a 15-minute TTL. It cannot silently double as “pending scheduling”; scheduling state needs an explicit contract.
- A booking without a scheduled activity cannot consume occurrence capacity under the current invariant. Capacity allocation and contention must be defined before such a booking can be represented as confirmed availability.
- Recurrence persistence, expansion/materialization, time-zone behavior, exception application, and edits to a rule with existing bookings require explicit contracts.
- Public projection needs a precise channel-inclusion and publication lifecycle contract without exposing the internal catalog.
- Staff in-place mutation must preserve capacity, isolation, idempotency, audit, outbox, customer communication, and one observable order under concurrency.
- Multi-session courses may require one booking to relate to multiple scheduled activities; this is not decided here.
- No staff-assignment role, permission, eligibility rule, or schema is introduced.

## Alternatives considered

- Require every booking to select an exact pre-generated slot: rejected by Product because some activities are offered by day or without a preselected date/time.
- Let customers propose preferred dates/times: rejected by Product for the MVP.
- Add free-text scheduling preferences: rejected by Product for the MVP.
- Treat a recurrence day without a time as a slot with a null start: not selected because it conflates availability with a concrete scheduled activity.
- Expose every internally visible scheduled activity once its activity is Published: rejected because internal catalog visibility and public availability are separate concerns.
- Keep cancellation-plus-replacement for all staff structural changes: rejected by Product; staff editing must preserve booking identity.

## Open questions

1. Booking and scheduling state machines, including when a date-free or time-free booking is accepted, confirmed, rejected, expired, or considered scheduled.
2. Capacity and hold behavior before a concrete scheduled activity exists.
3. Whether one booking may relate to several scheduled activities for a multi-day course, and how partial scheduling behaves.
4. Exact occurrence identity and overlap validation; identical versus incompatible rule collisions; simultaneous distinct executions; null/empty normalization and weekday numbering; DST gap/fold and center-timezone-change policy; bounded query/pagination and rule-revision contracts.
5. Exact channel inclusion and publication lifecycle for an activity, availability rule, date-free offer, and scheduled activity; disabling rules with already materialized executions.
6. Exact staff mutation command, allowed fields by state, concurrency winner, customer notification, and audit/outbox contract.
7. Exact warning and resolution workflow when a closure overlaps existing executions, holds or bookings; full-interval versus start-date evaluation; date-free offers during center closures.
8. Calendar and activity-list filter definitions.
9. Staff-assignment model, eligibility, permissions, and calendar impact.
10. HTTP routes, DTOs, stable errors, idempotency boundaries, migrations, and backward compatibility.

## Acceptance criteria / evidence

Acceptance establishes the stated decisions as the normative configuration and architecture boundary. Implementation of affected behavior still requires the following gates; acceptance does not claim they have been executed or met:

- every changed invariant, state, transition, default, and interface has explicit provenance;
- the revised model preserves tenant and center isolation;
- internal catalog records cannot appear in public availability without the approved server-side publication path;
- fixed, recurring-with-time, recurring-without-time, and date-free scenarios have deterministic state and capacity behavior;
- closures and recurrence edits have deterministic treatment of existing bookings;
- the configuration scenarios in SPEC-DIVE-BOOKING-SCHEDULING-001 have executable acceptance coverage before implementation conformance is claimed;
- staff mutation has concurrency, capacity, idempotency, audit, outbox, and notification acceptance scenarios;
- the owning SPEC is revised without weakening existing public-capability, privacy, and non-disclosure constraints;
- TRACE is updated only for approved relationships and later implementation coverage.
