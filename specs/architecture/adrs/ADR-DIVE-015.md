# ADR-DIVE-015 — Activity scheduling, recurrence, and booking calendar

- **Status:** Draft
- **Version:** 0.1
- **Date:** 2026-09-30
- **Deciders:** Product / Architecture / Data / Security
- **Affected IDs:** `DIVE-BOOK-REQ-009..014`, `017..021`, `025..036`, `037..038`, `043`, `049..065`

## Provenance

This ADR records product decisions explicitly confirmed by Borja on 2026-09-30. The decisions are `Proposed` because they change or extend the current `SPEC-DIVE-BOOKING-001` contract. Product approval is recorded, but this ADR remains Draft and is not implementation authority until the owning SPEC, state machines, capacity rules, HTTP contract, and migration impact are reconciled and approved.

| Decision | Provenance | Exact source | Approval / status |
|---|---|---|---|
| Separate activity, scheduled activity, and booking concepts | `Proposed` | Product confirmation by Borja on 2026-09-30 | Product-approved; Draft |
| Staff may structurally edit a booking in place from its detail or calendar drag-and-drop; public customers cancel and create another booking | `Proposed` | Product confirmation by Borja on 2026-09-30 | Product-approved; contradicts current `DIVE-BOOK-REQ-034`; Draft |
| Staff cancellation releases seats by default and may explicitly retain them as blocked | `Proposed` | Product confirmation by Borja on 2026-09-30 | Product-approved; specializes `DIVE-BOOK-REQ-035..036`; Draft |
| Calendar supports day, week, and month views and opens on the current week | `Proposed` | Product confirmation by Borja on 2026-09-30 | Product-approved; Draft |
| Calendar and activity lists support filtering; exact filters remain open | `Proposed` | Product confirmation by Borja on 2026-09-30 | Product-approved capability; filter contract open; Draft |
| An activity may use one-off dates, recurrence with optional exact time, or no published dates | `Proposed` | Product confirmations by Borja on 2026-09-30 | Product-approved; Draft |
| The center defines recurrence validity; no global recurrence horizon is selected here | `Proposed` | Product confirmation by Borja on 2026-09-30 | Product-approved; Draft |
| Weekly closures, specific excluded dates, and closed date ranges override recurrence | `Proposed` | Product confirmation by Borja on 2026-09-30 | Product-approved; Draft |
| Customers choose only center-published days/times, or book the activity without a date; they provide no scheduling preference and receive no counterproposal | `Proposed` | Product confirmations by Borja on 2026-09-30 | Product-approved; Draft |
| Participants have no independent identity in the MVP | `Proposed` | Product confirmation by Borja on 2026-09-30 | Product-approved; Draft |
| Staff assignment is deferred for later definition | `Proposed` | Product confirmation by Borja on 2026-09-30 | Product-approved deferral; Draft |

## Context

The current booking model treats an activity as a catalog offering, a slot as one concrete dated occurrence with capacity, and a booking as seats on exactly one slot. It also requires cancellation-plus-replacement for changes to slot, date/time, or seat count. That model covers fixed occurrences but does not represent center-controlled recurrence without an exact time, booking an activity before scheduling, potentially multi-day courses, or product-approved staff editing that preserves booking identity.

This ADR captures the approved product direction without silently changing the current Ready-to-start SPEC or allocating new requirement IDs before the missing behavioral contract is closed.

## Proposed decision

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
4. Exact recurrence and exclusion persistence, time-zone evaluation, materialization horizon mechanics, and rule-edit behavior.
5. Exact channel inclusion and publication lifecycle for an activity, availability configuration, and scheduled activity.
6. Exact staff mutation command, allowed fields by state, concurrency winner, customer notification, and audit/outbox contract.
7. Exact warning and resolution workflow when a new closure overlaps existing scheduled activities or bookings.
8. Calendar and activity-list filter definitions.
9. Staff-assignment model, eligibility, permissions, and calendar impact.
10. HTTP routes, DTOs, stable errors, idempotency boundaries, migrations, and backward compatibility.

## Acceptance criteria / evidence

This Draft is ready for SPEC reconciliation only when:

- every changed invariant, state, transition, default, and interface has explicit provenance;
- the revised model preserves tenant and center isolation;
- internal catalog records cannot appear in public availability without the approved server-side publication path;
- fixed, recurring-with-time, recurring-without-time, and date-free scenarios have deterministic state and capacity behavior;
- closures and recurrence edits have deterministic treatment of existing bookings;
- staff mutation has concurrency, capacity, idempotency, audit, outbox, and notification acceptance scenarios;
- the owning SPEC is revised without weakening existing public-capability, privacy, and non-disclosure constraints;
- TRACE is updated only for approved relationships and later implementation coverage.
