# SPEC-DIVE-BOOKING-SCHEDULING-001 - Expanded scheduling and calendar

- **Status:** Accepted
- **Version:** 0.14
- **Last reviewed:** 2026-10-01
- **Owner:** Product / Booking
- **Approval reference:** Historical approvals extracted from SPEC-DIVE-BOOKING-001 at commit `86e9d97` are retained. The product owner explicitly accepted the configuration model and stated boundaries on 2026-09-30 with "no lo indiques como draft, esta aceptado"; unresolved contracts and implementation evidence are not approved by implication.

## Normative authority

**Documented:** owns the requirements declared below, retaining their IDs and historical source/approval records from [SPEC-DIVE-BOOKING-001](SPEC-DIVE-BOOKING-001.md). Original Derived/Proposed classifications describe provenance, not whether a later explicit acceptance exists. This file does not authorize unrelated contracts or infer conformance from implementation existence.

The [configuration contract](#configuration-contract) and stated architectural boundaries are explicitly Accepted. This is normative acceptance of the specified model, not approval of answers absent from the open contracts or evidence of a completed implementation. Affected behavior remains blocked where an implementation contract is unresolved.

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
| Configuration refinements for `DIVE-BOOK-REQ-010`, `012`, `021`, `029`, `037..038`, `049` | `Proposed` | Simplified-model proposal, viability analysis and explicit acceptance recorded in [ADR-DIVE-015](../architecture/adrs/ADR-DIVE-015.md#provenance) on 2026-09-30 | Accepted model and stated boundaries; unresolved contracts remain open |
| Scheduling delivery and initial local-time handling under `DIVE-BOOK-REQ-010`, `029`, `049` | `Proposed` | Product-owner acceptance in this chat on 2026-10-01 of the preceding hours/days recommendation, followed by documentation authorization | Explicitly approved exact-date/time-first delivery, separate recurrence/day-only/date-free increments and initial rejection of nonexistent/ambiguous local times. Existing accepted model is retained; no unresolved HTTP, state, capacity, overlap or migration contract is approved by implication |
| Scheduling technical refinements under `DIVE-BOOK-REQ-010`, `012`, `029`, `034`, `037..038`, `043`, `049` | `Proposed` | Subsequent product-owner acceptance in this chat on 2026-10-01 of the preceding seven-block recommendations, followed by documentation authorization | Explicitly approved initial cardinality, occurrence identity direction, canonical weekdays/time, interval closure, initial filters and concurrency direction below; active-rule timezone migration, unscheduled states and precise HTTP/persistence contracts remain open; no implementation or status promotion |
| Calendar phase-two read scope under `DIVE-BOOK-REQ-021`, `029`, `043`, `049` | `Proposed` | Product-owner confirmation on 2026-10-01 of the eight-block calendar phase-two recommendation, followed by the request to document those changes in the same conversation | Explicitly approved the bounded read scope, aggregate query direction, overlap semantics, server-derived occupancy, booking detail, permission separation and navigation/refresh behavior below. Blocked-seat treatment and precise implementation contracts remain open; no implementation, artifact promotion or publication |
| Calendar phase-two concrete read refinements under `DIVE-BOOK-REQ-021`, `029`, `043`, `049` | `Proposed` | Subsequent product-owner approval and documentation-update authorization on 2026-10-01 of the eight-point concrete read-contract recommendation in the same calendar conversation | Explicitly approved parameter names/instant input, occupancy fields and per-page observation time, exclusion of blocking writes with nullable remaining capacity, booking/contact routes, error/audit direction and URL behavior below. This supersedes the earlier open choices only where specified; no implementation or artifact promotion |
| Calendar phase-two implementation conventions under `DIVE-BOOK-REQ-021`, `029`, `043`, `049` | `Proposed` | Product-owner registration authorization on 2026-10-01 for the subsequent five-part recommendation in the same calendar conversation | Explicitly approved existing DTO-name/pagination/error reuse, UTC response instants, ascending booking order, one coherent page observation time, current calendar modes/local-date encoding and audit identifiers without contact payloads. Only the specified earlier questions are closed; no product implementation or status promotion |
| Calendar phase-two remaining-contract solutions under `DIVE-BOOK-REQ-021`, `029`, `043`, `049` | `Proposed` | Product-owner direction on 2026-10-01 in the same calendar conversation authorizing selection/documentation, followed by explicit confirmation of the resulting Scheduling and IAM blocks on the same date | Explicitly approved the specified DTO, validation, query, audit and recovery choices. The bounded phase-two design-question gate is closed; no artifact status promotion, implementation, executed coverage or publication is inferred |

## Requirements

- **DIVE-BOOK-REQ-010:** A scheduled activity is distinct from both its activity and its availability configuration. Once exact scheduling exists, it has start time, duration or end time, capacity, and state. A recurrence day without an exact time and a date-free offer MUST NOT be represented as a concrete scheduled activity with a fabricated or null start.

- **DIVE-BOOK-REQ-012:** A booking references exactly one activity, a positive seat count, a stable `booking_channel`, and a booker contact. It may initially reference one scheduled activity, one center-published day without an exact time, or no date. **Proposed, explicitly approved:** the first increment permits at most one execution per booking; multi-session courses require a separately approved contract.

- **DIVE-BOOK-REQ-021:** For a booking assigned to a scheduled activity, `Pending` holds seats and `Confirmed` consumes seats. `Cancelled` and `Expired` do not consume seats unless staff explicitly blocks them. A booking without a scheduled activity does not consume or hold occurrence capacity; its scheduling and commercial states remain undefined and MUST NOT silently reuse `Pending`.

- **DIVE-BOOK-REQ-029:** Authoritative occurrence capacity resides on the scheduled activity, not on the activity catalog record or availability configuration. No capacity guarantee exists before a booking is assigned to a scheduled activity unless a later approved contract defines one.

- **DIVE-BOOK-REQ-034:** An authorized staff operation may change the scheduled activity, date/time, or seat count while preserving booking identity. It MUST revalidate capacity and apply the booking change, capacity effects, audit, and outbox atomically with one observable concurrency order. Public customers do not perform this structural edit; they cancel and create another booking. Exact HTTP, idempotency, notification, and incompatible-state rules remain open.

- **DIVE-BOOK-REQ-037:** Channel type `center_catalog` exposes a server-derived public projection of eligible published activities and the availability configurations or scheduled activities explicitly included by that published channel. Future scheduled activities in `Available` or `Full` may appear; `Full` is non-bookable and `Closed` or `Cancelled` is excluded. Internal catalog visibility never implies public publication.

- **DIVE-BOOK-REQ-038:** Channel type `single_activity` exposes one eligible published activity and only the center-controlled availability included by that published channel: fixed scheduled activities, published recurrence days with optional exact times, or date-free booking. `Full` scheduled activities are visible as non-bookable; `Closed`, `Cancelled`, excluded dates, and closed ranges are excluded.

- **DIVE-BOOK-REQ-043:** The center dashboard calendar shows authorized online and manual bookings and scheduled activities in day, week, and month views, opening on the current week. It distinguishes bookings still missing a date or exact time from concrete scheduled activities. **Proposed, explicitly approved:** initial filters are activity, status and date range, with a separate list awaiting scheduling. The [calendar phase-two read scope](#calendar-phase-two-read-scope) selects the concrete scheduled-turn presentation, overlap and navigation direction; the pending-scheduling projection and remaining precise transport contracts stay open.

- **DIVE-BOOK-REQ-049:** A concrete scheduled activity persists `starts_at` as timestamptz and `duration_minutes` as a positive integer; end is derived and remaining sellable seats are derived from bookings. Recurrence without an exact time and date-free booking belong to availability or scheduling records and MUST NOT fabricate `starts_at`. Their physical persistence contract remains open.

### ADR-DIVE-015 precedence and reconciliation boundary

`ADR-DIVE-015` records product decisions explicitly accepted by the product owner on 2026-09-30. Where previous fixed-slot-only wording conflicts with that ADR, the accepted model governs the product direction. State, capacity, recurrence, publication, HTTP, persistence, migration and compatibility details not specified by that acceptance remain implementation gates.

The existing fixed-time slot contract remains valid for that implemented slice, but it is no longer the exclusive booking model. Acceptance does not authorize implementation of date-free or time-free booking, multi-session courses, recurrence materialization, or staff structural mutation until their open contracts below are closed. Unaffected Ready-to-start behavior must not be weakened by this reconciliation.

## Definitions

- **Activity (booking service):** catalog offering configured by a center, e.g. “Discover Scuba Dive”. It may propose a default capacity. It is not the authoritative capacity record.
- **Availability configuration:** center-controlled offer configuration, distinct from a concrete scheduled activity. **Proposed, accepted:** dated options use `AvailabilityRule`; date-free eligibility uses `Activity.allow_booking_without_date`, not a rule with missing dates.
- **Scheduled activity (`Slot` in the current fixed-time implementation):** concrete execution of an activity once its exact start, duration, capacity, and state are known. It is the authoritative capacity record for bookings assigned to it.
- **Booking:** customer commitment for one or more seats in an activity. It may initially select a scheduled activity, a center-published day without an exact time, or no date when the center will schedule it later. **Documented:** initial cardinality is at most one execution under `DIVE-BOOK-REQ-012`; multi-session courses are not enabled.
- **Booker:** responsible contact for the booking.
- **Channel:** server-side public or internal entry configuration. Browser input never authorizes tenant, center, activity, or slot.
- **Held seats:** seats reserved by a `Pending` booking that has not yet confirmed, expired, or been rejected.
- **Blocked seats:** seats withheld from sale after a staff cancellation or full slot cancellation, until explicitly released.
- **Session:** authentication/session lifecycle only. Do not use “session” for a slot.

## Configuration contract

**Proposed, explicitly accepted:** source is the product owner's simplified-model proposal, viability analysis, documentation request and explicit acceptance on 2026-09-30 recorded in [ADR-DIVE-015](../architecture/adrs/ADR-DIVE-015.md#provenance). This section owns the accepted field-level model under `DIVE-BOOK-REQ-010`, `012`, `021`, `029`, `037..038` and `049`; original approval records remain historical sources, and unanswered implementation questions remain open.

### Configuration records

`?` means an optional value, not a selected database default. These are accepted logical records, not a migration or complete physical schema.

```text
Activity
- id
- tenant_id
- center_id
- name                    localized es/en
- description?            localized es/en
- default_capacity?
- status
- base_locale             es/en resolved from center configuration at creation
- allow_booking_without_date
- created_at

AvailabilityRule
- id
- tenant_id
- center_id
- activity_id
- starts_on
- ends_on
- weekdays                [] = all days; selected ISO weekdays 1..7
- local_time              null = day selection without an exact time
- duration_minutes?
- capacity?
- active
- created_at

CenterClosure
- id
- tenant_id
- center_id
- starts_on
- ends_on
- reason?                 internal note; not public copy
- created_at

CenterBookingSettings
- tenant_id
- center_id
- unavailable_weekdays
```

`Activity` retains commercial identity, localized content and publication state. Date-free eligibility is independent of dated rules: adding a rule does not implicitly disable it, and enabling it does not make the activity publicly available without channel authorization. No boolean default is selected here.

**Documented:** the commercial extension's field ownership is in [SPEC-DIVE-BOOKING-CATALOG-001](SPEC-DIVE-BOOKING-CATALOG-001.md), `DIVE-BOOK-REQ-073..079`. The logical records above remain the scheduling configuration, not a duplicate complete commercial schema.

**Documented:** creation and publication require a name only in the activity's stored base language; other translations and description are optional. `DIVE-BOOK-REQ-009`, `051` and `053` in [the catalog language policy](SPEC-DIVE-BOOKING-CATALOG-001.md#activity-languages-and-fallback) own the approved center-level choice of Spanish or English, server resolution at activity creation and requested-language-to-base fallback. Scheduling configuration does not require a per-activity client choice, duplicate center configuration or choose an implicit language default. The owner's [initial-configuration contract](SPEC-DIVE-BOOKING-CATALOG-001.md#initial-center-catalog-language-contract), also under `050..056`, records the subsequent approval of bounded settings transport/authorization and concurrent initial selection. Later preference changes remain excluded; this configuration is not a dependency on the unresolved expanded scheduling settings.

`CenterBookingSettings` has one record per `(tenant_id, center_id)`. Rule-to-activity and record-to-center relations preserve both tenant and center through composite keys and the existing authorization/RLS boundary in [ADR-DIVE-001](../architecture/adrs/ADR-DIVE-001.md). Missing settings, nullability, physical names, constraints, permissions and migration details require explicit contracts; missing configuration must not silently invent open weekdays.

### Uniform interpretation and validation

| Configuration | Candidate meaning |
|---|---|
| `starts_on = ends_on` | One local date, subject to weekday and closure filters |
| Bounded interval with empty `weekdays` | Every local date in the inclusive interval |
| Bounded interval with selected `weekdays` | Only matching local weekdays |
| `local_time` present | Exact-time candidate; not yet a capacity guarantee |
| `local_time` absent | Published day selection; scheduling time remains unresolved |
| `allow_booking_without_date = true` | Date-free eligibility without a fabricated rule, independently of dated rules |

Require `starts_on <= ends_on`, valid local dates/times, unique valid weekday values, and positive duration/capacity when provided. **Proposed, explicitly approved:** canonical weekdays are ISO `1..7` (Monday through Sunday); an explicit empty list means all days and absent local time is represented as `null`. Date intervals are inclusive; query expansion is paginated without a global recurrence horizon. Missing input is not implicitly an empty list. Exact transport validation, physical storage and migration of any previous null weekday representation remain open. A single date excluded by its weekday filter produces no candidate; it does not bypass the filter.

One rule describes one local time; multiple times use multiple rules. Changing interval bounds or clearing a local time changes future candidates only, not committed executions. The configuration form exposes From, Until, Weekdays, optional Time, Duration, Capacity and Active; it does not expose `kind` or cron. No activity-specific closures, per-rule exceptions or positive closure overrides are introduced.

### Capacity, materialization and overlap

Rule `capacity` is a per-execution template, not a total rule quota, daily pool or unlimited capacity. Resolve it from the rule value or the activity default when creating a concrete execution; persist the resolved value on `Slot`. Duration must also be known before an exact-time execution can commit seats; no duration default is introduced.

Generate candidates for the requested range without mandatory materialization of all future executions. Create or reuse a stable persistent `Slot` before committing exact-time seats, and perform capacity checks through the existing booking transaction owner. Day-only and date-free bookings do not create dummy/null-start slots or claim occurrence-capacity guarantees; no daily quota is implicitly introduced.

An occurrence identity cannot be based only on `rule_id`. **Proposed, explicitly approved:** for the first increment, one activity and exact start instant resolve to one execution within its tenant/center scope. Identical candidates deduplicate; incompatible execution values are rejected. Distinct simultaneous executions of the same activity require a separate contract, not an implicit rule-based identity. Exact physical uniqueness, compatibility comparison, overlap algorithm, concurrency control, idempotency and errors remain blocking questions.

### Booking and publication boundaries

Accepted booking relationships include an obligatory activity, an optional concrete slot, and a selected local date for day-only selection. A slot must belong to that same tenant, center and activity. **Proposed, explicitly approved:** initial cardinality is at most one execution per booking; unscheduled work has separate commercial and planning states, without reusing capacity-holding `Pending` or claiming capacity guarantees. Exact state names, legal combinations, acceptance/token behavior and persistence of the selected date after scheduling remain open; no new state is named by this direction.

Effective dated candidates combine existing concrete slots, including manually created ones, with active-rule candidates without double counting. Apply center unavailable weekdays and dated closures, then the applicable execution state, capacity and channel-publication constraints. Eligible `Full` executions may remain visible but not bookable under `DIVE-BOOK-REQ-037..038`. Date-free eligibility is a separate projection, not subtraction from a dated calendar.

An active rule is not automatically published. The server must enforce eligible activity publication and explicit channel inclusion of the rule, execution or date-free offer. The exact inclusion lifecycle and treatment of materialized slots after rule deactivation remain open. Browser selectors never establish publication or tenant authority.

### Time, edits and closure conflicts

Dates and local times are evaluated in the center's confirmed IANA time zone; a concrete slot retains its UTC instant. Reuse the time boundary in [catalog.time.ts](../../apps/api/src/catalog/catalog.time.ts) rather than a second converter. Its current instant conversion is not a DST recurrence policy. **Documented:** [the accepted initial local-time handling below](#accepted-delivery-sequence-and-initial-local-time-handling) selects rejection of nonexistent/ambiguous local-time submissions; its validation/error transport and center-timezone changes remain open.

Rule values and activity defaults are not live values for previously committed slots. Rule, settings and closure edits must not silently move executions, change their committed capacity, cancel bookings or invalidate held seats. Preserve configuration provenance/revision and enforce edit concurrency; the exact revision token, historical representation and update contract are not selected here.

Center closures block new sales of affected concrete slots as well as derived candidates; existing bookings are surfaced for explicit authorized resolution, not silently cancelled. **Proposed, explicitly approved:** any overlap with an execution interval makes the execution affected, not just a start date within the closure. Exact interval endpoints/closure timezone conversion and date-free behavior remain open. Booking must revalidate current rule, closure, channel and capacity eligibility with one observable order against competing edits; audit/outbox and idempotency remain within the existing transaction boundary.

### Commercial execution boundaries

**Proposed, explicitly approved:** on 2026-09-30 the product owner requested "aplica los cambios propuestos sobre la documentacion", approving the preceding proposals to separate commercial defaults from execution facts. This clarifies the activity/execution and public-projection boundaries under `DIVE-BOOK-REQ-010`, `034`, `037..038` and `049`, not staff/resource assignment or a finished execution-edit contract.

- Customer-service/opening hours of a center do not create activity availability. Indicative activity duration does not replace a rule/execution's confirmed duration or authorize a fabricated exact start.
- Stable meeting guidance belongs to the activity; an execution owns its effective meeting guidance when it differs. The relevant customer map must identify the meeting point rather than silently use the center's headquarters address.
- Activity teaching languages describe the offer under the catalog owner. Where an execution restricts them, show the guaranteed effective languages before booking. Category and entry modality remain separate; if modality varies by departure, the execution's effective modality is presented explicitly.
- These facts are not inferred from a customer's interface locale, a translation, or the latest center profile. Changing a profile, rule or commercial activity field does not silently alter an existing execution or booking commitment.
- An undated/day-only booking must not acquire a dummy execution merely to attach commercial fields. Requested-language selection, guarantees before assignment, exact effective-field storage, revision/override semantics and communication of changes require explicit contracts. No staff matching or boat assignment is introduced.

**Documented:** accepted booking history belongs to [SPEC-DIVE-BOOKING-001](SPEC-DIVE-BOOKING-001.md), `DIVE-BOOK-REQ-080`; cancellation and acceptance of conditions when assigning an agreed date refer to [SPEC-DIVE-BOOKING-CAPABILITIES-001](SPEC-DIVE-BOOKING-CAPABILITIES-001.md), `DIVE-BOOK-REQ-081`. Existing structural-edit, state, capacity, audit/outbox and concurrency gates remain; the new commercial approval does not close them.

Expected checks, not executed proof: center opening hours do not generate candidates; commercial duration does not change committed execution duration; maps distinguish headquarters from meeting points; effective languages/modality match what was offered for that execution; profile edits do not rewrite commitments; and undated bookings remain free of fabricated starts while agreed assignment preserves condition history.

### Accepted delivery sequence and initial local-time handling

**Proposed, explicitly approved:** the 2026-10-01 scheduling acceptance in the provenance table selects delivery through exact dates and times first. Recurrence, day-only booking and date-free booking are separate subsequent increments, not removal of the model accepted in [ADR-DIVE-015](../architecture/adrs/ADR-DIVE-015.md). Each increment still requires its own unresolved contracts to be closed.

Retain interval/weekday rules with optional time and multiple rules for multiple times. Each concrete execution has confirmed capacity and duration; center closures block new sales and rule edits never move or cancel existing bookings. **Documented:** the subsequent seven-block acceptance selects activity-plus-instant identity, ISO weekdays, empty-list/null-time semantics and full-interval closure matching above. Physical constraints, compatibility/overlap validation and transaction coordination remain open, not those selected directions.

For the initial local date/time scheduling contract, reject nonexistent or ambiguous local times rather than shifting them or selecting an offset silently. No alternative DST resolution is authorized; precise validation/error transport remains open. **Proposed, explicitly approved:** center-timezone edits do not move committed UTC execution instants. Active-rule timezone changes and their effect on future candidates still require a contract. Existing explicit-instant slot inputs are not reinterpreted as local-time submissions by this documentation change.

**Proposed, explicitly approved:** structural commands require revision checks and idempotency; booking, capacity, audit and outbox effects remain atomic. Exact revision representation, request/replay/error shapes, notification rules and ordering across owners remain gates. This selects concurrency direction, not absent command endpoints or migration details.

**Documented:** the [catalog refinements](SPEC-DIVE-BOOKING-CATALOG-001.md#accepted-commercial-refinements), `DIVE-BOOK-REQ-075`, own the available-versus-guaranteed teaching-language distinction. Effective execution languages and customer selection, especially before scheduling, remain subject to the open representation and guarantee contract here.

Expected checks, not executed proof: reject DST gap/fold local-time submissions without a silently selected offset; retain explicit-instant slot behavior; rule edits and closures preserve existing bookings while denying ineligible new sales; and later increments do not fabricate executions for day-only or date-free bookings.

## Calendar phase-two read scope

**Proposed, explicitly approved -- Source and limits:** on 2026-10-01, the product owner confirmed the preceding eight-block recommendation for calendar phase two and subsequently requested documentation of the changes. This records the approved decisions under `DIVE-BOOK-REQ-021`, `029`, `043` and `049`, not answers absent from that recommendation, a completed implementation or an artifact status promotion. Permission grants are owned by [IAM calendar read permissions](../iam/SPEC-DIVE-IAM-001.md#calendar-phase-two-read-permissions).

### Presentation and increment boundaries

**Proposed, explicitly approved:** phase two covers concrete scheduled activities, their server-derived occupancy and the associated already-scheduled bookings. Render one calendar event per scheduled activity with activity, schedule and occupancy; selecting it opens a paginated booking list, rather than drawing each booking as another overlapping calendar event.

**Proposed, explicitly approved:** manual booking creation, day-only/date-free booking and their pending-scheduling list, recurrence, drag editing and structural reprogramming are outside this increment. This sequencing does not remove those parts of `DIVE-BOOK-REQ-043` or approve their open contracts. Existing scheduled bookings can be read only through their supported channel contract; do not invent manual `booking_channel` values or imply a manual-create implementation from calendar visibility. The existing booking states remain owned by [SPEC-DIVE-BOOKING-001](SPEC-DIVE-BOOKING-001.md), `DIVE-BOOK-REQ-068`.

### Calendar query and interval

**Proposed, explicitly approved:** introduce `GET /v1/centers/:centerId/calendar/slots` as a center-aggregated calendar read with a mandatory date/time interval and optional activity and slot-status filters. It avoids requiring the browser to request every activity separately. Preserve the existing catalog list routes and their response contracts; the new overlap projection does not silently replace their start-within-range semantics.

**Proposed, explicitly approved:** interpret the calendar interval as `[from, to)` and include a scheduled activity when its execution interval overlaps it, including executions that start before `from` and continue into the requested period. For the derived execution end, the overlap predicate is `startsAt < to` and `end > from`. Use stable ordering by start then ID and the existing page-pagination convention in [ADR-DIVE-014](../architecture/adrs/ADR-DIVE-014.md#pagination-contract), not a new cursor or invented global horizon. The [concrete read refinements](#concrete-phase-two-read-refinements) select the parameter names, input convention and error direction; additional DTO/validation details remain subject to the gates below.

### Occupancy and booking detail

**Proposed, explicitly approved:** the server supplies capacity, confirmed seats, still-valid held seats and remaining seats. Reuse the authoritative booking/capacity owner, not a browser-side sum of a paginated reservation list. Only unexpired holds contribute to held-seat occupancy; reading the calendar does not change a booking's persisted state. A closed execution can retain remaining seats without permitting new sales. Displayed occupancy is not a guarantee for a later booking operation.

**Documented -- Existing capacity authority:** [SPEC-DIVE-BOOKING-001](SPEC-DIVE-BOOKING-001.md), `DIVE-BOOK-REQ-003`, `025..028`, `035..036`, and `DIVE-BOOK-REQ-021`, `029` here retain their capacity, concurrency and blocked-seat authority. **Proposed, explicitly approved -- Subsequent closure:** the [concrete read refinements](#concrete-phase-two-read-refinements) exclude creation/release of blocked seats from phase two and select `remainingSeats: null` when complete authoritative occupancy cannot be determined. This closes the increment's former inclusion-versus-exclusion choice, not the future persistence/write contract for blocked seats. A missing representation is never evidence of zero blocked seats.

**Proposed, explicitly approved:** booking detail is a paginated read for one selected execution, containing booking identity, existing state, seat count, channel, creation time and hold expiry when applicable. Slot state and booking state are distinct filters. Contact data is separate from that operational projection and subject to the owning IAM permission and audit rules; calendar events contain neither names nor email addresses. Routes, booking-status filter, ordering and error direction are selected below; the subsequent [implementation conventions](#calendar-phase-two-implementation-conventions) select name reuse and ascending order. Response optionality is selected by the later [confirmed solutions](#calendar-phase-two-remaining-contract-solutions), under their separate 2026-10-01 approval, not inferred from historical approvals.

### Concrete phase-two read refinements

**Proposed, explicitly approved -- Source and precedence:** on 2026-10-01, following the initial scope documentation, the product owner approved the subsequent eight-point concrete read recommendation and authorized its documentation update. The selections below close the corresponding earlier questions only; they do not authorize additional defaults, representations, migrations or lifecycle writes.

**Proposed, explicitly approved -- Calendar inputs:** `GET /v1/centers/:centerId/calendar/slots` accepts mandatory `from` and `to`, optional `activityId` and `slotStatus`, and `page`/`pageSize` under the existing pagination convention. Interval inputs are RFC3339 instants with an explicit offset or `Z`; require a valid ordered interval and the approved overlap predicate. Slot-status values use the existing catalog vocabulary, not booking states. Preserve the existing catalog route contracts.

**Proposed, explicitly approved -- Occupancy response:** each calendar item carries execution identity, activity identity, start, duration, state and capacity, plus server-derived `confirmedSeats`, `heldSeats` and `remainingSeats`. The response includes `asOf`, identifying when that page's occupancy was observed. Keep each page coherent with its observation time; do not promise a frozen snapshot across pagination. Counts are independent of the selected booking-list filter and page. The subsequent implementation conventions select existing field-name reuse, UTC response serialization and one observation instant per page; activity projection and response optionality are selected in the later solutions explicitly confirmed on 2026-10-01.

**Proposed, explicitly approved -- Unknown remaining capacity:** creation and release of blocked seats are excluded from this increment. Return a numeric `remainingSeats` only when the server can determine complete authoritative occupancy, including any applicable blocked seats. If blocking or another occupancy component cannot be determined, return `remainingSeats: null` and present unavailable-to-calculate capacity, not zero or an apparently bookable count. This is a read-projection fallback, not a new slot/booking state or a write-side capacity policy.

**Proposed, explicitly approved -- Booking list:** introduce `GET /v1/centers/:centerId/slots/:slotId/bookings` with the independent optional `bookingStatus` filter and existing page pagination. Return the operational booking fields described above without contacts; order by creation then ID, both ascending under the subsequent implementation conventions. The later solutions select explicit nullable hold expiry under their separate 2026-10-01 confirmation, not the earlier approval. Preserve the existing state owner, including expired holds without a GET lifecycle transition.

**Proposed, explicitly approved -- Contact detail:** introduce `GET /v1/centers/:centerId/bookings/:bookingId/contact`, requiring both `booking.read` and `customer_contact.read` for the same authorized booking and center. Return only the existing booking-contact data, requested when the user explicitly opens that detail; do not put contacts into calendar events, operational booking lists, URLs or logs. The implementation conventions select existing contact-name reuse and preserve the owning data contract; the later solutions and IAM owner select the response envelope and concrete audit behavior under their separate 2026-10-01 confirmation.

**Proposed, explicitly approved -- Errors and audit:** retain `401`, `403`, non-disclosing `404` and `422 validation_error`, with the BFF's existing operational-failure treatment under its owning contract. Reuse existing `booking.read` and `customer_contact.read` audit actions and the existing problem-detail conventions. The subsequent implementation conventions clarify that required actor/resource/result identifiers are retained while contact values and contact payloads are excluded; no new read-generated outbox event is selected. Route-specific validation and read-audit granularity/purpose/timing are selected below and in IAM under their separate 2026-10-01 confirmation, not left for implementation to invent.

**Proposed, explicitly approved -- URL recovery:** reuse the existing activity and slot-status URL filters and add `calendarView` and `calendarDate`, the latter a local date in the center's time zone. Invalid calendar navigation values recover to the current week with valid filters retained. Preserve the earlier navigation/focus/manual-refresh triggers; no polling or automatic write retry is introduced. The subsequent implementation conventions select the four current FullCalendar view values and `YYYY-MM-DD`; filter recovery and URL normalization are selected by the later solutions explicitly confirmed on 2026-10-01.

### Calendar phase-two implementation conventions

**Proposed, explicitly approved -- Source and limits:** on 2026-10-01, after requesting phase-two implementation and recommendations for the open decisions, the product owner authorized recording the preceding five-part closure recommendation. This selects only the following conventions; it is not lifecycle promotion, implementation evidence or approval of unspecified fields/audit behavior.

**Proposed, explicitly approved -- Reuse and response instants:** reuse the field names of the existing catalog/booking DTOs for the selected corresponding fields, the existing pagination contract and the existing problem-detail conventions. Reference owners: [catalog DTOs](../../apps/api/src/catalog/catalog.dto.ts), [booking/contact DTOs](../../apps/api/src/booking/public-booking.dto.ts), [ADR-DIVE-014 pagination](../architecture/adrs/ADR-DIVE-014.md#pagination-contract) and [problem details](../../apps/api/src/common/http/problem-details.ts). Serialize the new phase-two response instants, including `asOf`, in RFC3339 UTC (`Z`). This does not alter existing catalog responses, including their center-offset `startsAt`, input acceptance of explicit offsets or center-local calendar presentation. Reuse does not expose public booking capability tokens or contact fields in the operational list and does not select additional fields or envelopes by analogy.

**Proposed, explicitly approved -- Order and page observation:** order the booking list by creation ascending and then ID ascending. Use one `asOf` instant and a coherent occupancy read for each calendar page, including the evaluation of whether holds are still valid. The timestamp is the reference for that page's counts, not the activity date, a later availability guarantee or an application timestamp added after inconsistent reads. This does not require a frozen snapshot across pages or select a new database isolation level; the existing tenant-scoped transaction owner must preserve page coherence.

**Proposed, explicitly approved -- Calendar URL values:** `calendarView` accepts exactly `dayGridMonth`, `timeGridWeek`, `timeGridDay` and `listWeek`, matching the [existing calendar view owner](../../apps/web/src/features/dashboard/calendar-view.tsx). Encode `calendarDate` as a valid center-local calendar date in `YYYY-MM-DD`, not a UTC instant. Retain the approved current-week recovery for invalid navigation and valid-filter preservation. No new view, filter default, normalization rule or automatic retry is introduced.

**Proposed, explicitly approved -- Audit identifiers and contact exclusion:** reuse the existing tenant-scoped audit mechanism and the selected read actions, retaining the actor, resource and result identifiers required by its owner. Reference owners: [IAM read permissions](../iam/SPEC-DIVE-IAM-001.md#calendar-phase-two-read-permissions), [audit actions/results](../../packages/contracts/src/index.ts) and [audit schema](../../packages/database/src/iam-schema.ts). Exclude first/last names, email addresses, phone numbers and contact response/request payloads from audit/log records. This replaces the earlier overly broad personal-data exclusion, not purpose limitation or privacy/retention duties for audit identifiers. It does not approve new audit purpose values, granularity or allow/deny timing.

### Calendar phase-two remaining-contract solutions

**Proposed, explicitly approved -- Source and limits:** product-owner direction on 2026-10-01 authorized choosing and documenting solutions to the remaining phase-two questions, followed by explicit confirmation of this concrete block and the IAM read-audit block on the same date. The following choices retain Proposed provenance and are now approved, not retroactive extensions of earlier approvals or artifact status promotions. They apply only to the three selected read routes and their calendar consumer; expanded scheduling, blocking writes, unscheduled bookings and deployment choices remain outside this slice.

**Proposed -- Response schemas:** use the following complete bounded projections. `Uuid` means a UUID string; `Instant` means a valid RFC3339 UTC string with `Z`, retaining the precision needed for expiry comparisons. All listed properties are present; only properties explicitly typed with `null` are nullable. `LocalizedText` retains the catalog's `es`/`en` keys and existing base-locale/fallback rules. The activity summary is the current authorized catalog name, not a new booking-time snapshot. These names/types reuse the [catalog DTO](../../apps/api/src/catalog/catalog.dto.ts), [booking/contact DTO](../../apps/api/src/booking/public-booking.dto.ts) and [persisted booking fields](../../packages/database/src/booking-schema.ts) without changing their existing routes.

```typescript
type CalendarSlotRead = {
	id: Uuid;
	activityId: Uuid;
	activity: { name: LocalizedText; baseLocale: 'es' | 'en' };
	status: 'Available' | 'Full' | 'Closed' | 'Cancelled';
	startsAt: Instant;
	durationMinutes: number;
	capacity: number;
	createdAt: Instant;
	confirmedSeats: number;
	heldSeats: number;
	remainingSeats: number | null;
};
type CalendarPageRead = {
	items: CalendarSlotRead[];
	page: number;
	pageSize: number;
	hasNext: boolean;
	asOf: Instant;
};
type BookingRead = {
	bookingId: Uuid;
	status: 'Pending' | 'Confirmed' | 'Rejected' | 'Cancelled' | 'Expired';
	seats: number;
	bookingChannel: 'public_hosted';
	createdAt: Instant;
	holdExpiresAt: Instant | null;
};
type BookingPageRead = {
	items: BookingRead[];
	page: number;
	pageSize: number;
	hasNext: boolean;
};
type BookingContactRead = {
	bookingId: Uuid;
	booker: { firstName: string; lastName: string; email: string; phone: string | null };
};
```

**Proposed -- Projection constraints:** return the persisted booking state and hold expiry, even when a Pending hold has expired; do not synthesize Expired or clear expiry in a GET. The channel vocabulary is the currently supported persisted value, not authorization to add manual channels. Capacity/duration/seat counts are positive safe integers; occupancy counts are non-negative safe integers. Validate converted end instants, aggregation results and serialized timestamp representability, not just inputs. Invalid authoritative data or a failed query is an operational failure with no partial page, not an empty success or unknown-capacity fallback. Include no contact, capability token, idempotency key, request hash, activity description or unrelated commercial fields in the calendar/operational projections. Serve the three reads with `Cache-Control: private, no-store`; do not persist contact data in browser storage or prefetch it.

**Proposed -- Input and error mapping:** calendar input is `from`, `to`, optional `activityId`/`slotStatus`, and `page`/`pageSize`; booking-list input is optional `bookingStatus` and `page`/`pageSize`; contact has no read-query fields. Omitted pagination uses [ADR-DIVE-014](../architecture/adrs/ADR-DIVE-014.md#pagination-contract) defaults/maximum and `pageSize + 1` detection; reject non-safe or unrepresentable offsets rather than overflowing multiplication. Omitted status means no status filter. Reject empty/malformed/repeated recognized parameters, invalid UUIDs, unsupported states, missing/offset-free/unrepresentable instants and `from >= to` with `422 validation_error`; reject unknown query keys on these new routes. Reuse the problem envelope `type`, `title`, `status`, `code` and optional safe `detail`, never echo input values. Use `401 unauthenticated`, `403 permission_denied` for insufficient permission within an otherwise valid scope, and non-disclosing `404 resource_not_found` for unavailable resources or tenant/center/application mismatch. Validate trusted admission before resource reads; syntax validation does not replace resource authorization. Extend the existing [problem-details owner](../../apps/api/src/common/http/problem-details.ts) and BFF operation inventory to cover all three new paths; their current existence is not coverage evidence. Operational failures retain existing API/BFF treatment rather than being remapped to validation or automatic retries.

**Proposed -- Coherent database mapping:** reuse the authorized tenant transaction and RLS owners, including [the unit of work](../../packages/database/src/unit-of-work.ts) and [current membership authorization](../../packages/database/src/iam-authorize.ts), with the confirmed center-application restriction. Within that boundary, obtain the calendar page, its activity summaries, occupancy and observation time in one SQL statement/snapshot. Capture the database `statement_timestamp()` once as `asOf`; use that exact instant for every hold comparison and response, without truncation that changes an expiry boundary. Apply overlap/activity/slot-state filters and ascending start/ID order before selecting `pageSize + 1` slots, then aggregate all same-tenant/center bookings for those slots, not a filtered booking-detail page. Confirmed contributes its seats; Pending contributes held seats only when `holdExpiresAt > asOf`; other states and null/expired holds contribute neither. Return one `asOf` even for an empty page. Avoid per-slot queries, `COUNT(*)` and capacity locks for this read; do not change the transaction's isolation level or booking lifecycle. A concurrent write may appear on a later page, but not as inconsistent components of the same page.

**Proposed -- Blocked-seat authority:** the current [booking schema](../../packages/database/src/booking-schema.ts) has no selected blocked-seat representation. Initially return `remainingSeats: null` while that component lacks authoritative proof, even though confirmed/held counts can be calculated. This does not block delivery of the bounded read projection or authorize a blocking migration. If an existing approved owner can establish complete blocked occupancy, compute `capacity - confirmedSeats - heldSeats - blockedSeats` from the same observation; otherwise retain `null`. Do not infer zero from missing schema, clamp away an invalid negative result or replace query failures with `null`. Evidence of complete authority is required only before returning a numeric remaining value, not before implementing the safe nullable projection.

**Proposed -- URL validation and normalization:** retain the existing `activity` and `slotStatus` URL keys from [catalog navigation](../../apps/web/src/features/dashboard/use-catalog-navigation.ts). Wait for the authorized center and valid IANA time zone before computing current dates or fetching. Missing navigation values default to `timeGridWeek` and today's center-local date; if either supplied `calendarView` or `calendarDate` is malformed, repeated or unsupported, reset both to that current-week pair while preserving valid filters. Validate `YYYY-MM-DD` as an actual date, rejecting overflow normalization. Remove only syntactically invalid/repeated `activity` or invalid/repeated `slotStatus`; retain valid navigation and other valid filters. A syntactically valid but inaccessible activity is not silently cleared: retain the selection and show the existing non-disclosing resource failure rather than broaden to all activities. Normalize only these owned keys using `URLSearchParams` and `router.replace` with no scroll, and only when the canonical values differ; preserve unrelated route keys and authority boundaries. Omit empty filters, never add contacts/resource payloads to the URL, and do not retry failed writes. Keep booking-status filtering and its page local to the selected execution's detail, defaulting to all existing states/page 1 and resetting the page on filter or execution changes. Cancel/discard previous execution/center results and contact data when selection or authorization changes; do not display a previous scope while the new one loads.

**Proposed, explicitly approved -- Audit and validation entry:** the [confirmed IAM audit contract](../iam/SPEC-DIVE-IAM-001.md#calendar-phase-two-read-audit-proposal) selects request granularity, purpose, allow/deny handling and failure behavior. Product-owner confirmation of both concrete blocks on 2026-10-01 closes the bounded phase-two design-question gate; route admission, unit/integration/isolation tests, OpenAPI/BFF completeness and consumer validation remain delivery gates. No product checks or query/payload measurements are claimed by this confirmation. Expected focused checks additionally cover null expiry/phone shapes, empty-page `asOf`, simultaneous occupancy changes and expiry equality/precision, representability failures, nullable remaining capacity without fabricated blocking authority, audit failure without contact disclosure, repeated/unknown parameters, invalid real dates and inaccessible activity filters without broadening.

### Navigation, security and refresh

**Proposed, explicitly approved:** preserve activity, slot-status filter, calendar view and reference date in the URL so navigation can be recovered. Booking-status filtering belongs to the execution's booking detail, separately from the slot-status filter. Refresh on period navigation, regained focus and explicit user refresh; no polling interval is introduced. The concrete refinements and subsequent implementation conventions select `calendarView`, `calendarDate`, their view/date encodings and current-week recovery; the later confirmed solutions select normalization under their separate approval.

**Documented:** use the selected same-origin BFF and API application/tenant/center/resource boundary in [SPEC-DIVE-IAM-DASHBOARD-001](../iam/SPEC-DIVE-IAM-DASHBOARD-001.md#simple-bff-contract), `DIVE-IAM-REQ-030..032`, and its [omission-prevention controls](../iam/SPEC-DIVE-IAM-DASHBOARD-001.md#avoiding-route-omissions). New reads still require enumerated BFF operations and their admission/resource tests; a path selector or a broad tenant role never authorizes a different center's application. No route or BFF coverage is asserted by this documentation.

**Documented -- Current decision gate:** product-owner confirmation on 2026-10-01, recorded in the provenance of the [remaining-contract solutions](#calendar-phase-two-remaining-contract-solutions) and [IAM audit contract](../iam/SPEC-DIVE-IAM-001.md#calendar-phase-two-read-audit-proposal), explicitly approves their response, validation, query, audit and URL choices. No unanswered design decision remains within that bounded phase-two contract; implementation, review and required delivery checks remain pending. Earlier approval scope and artifact statuses are unchanged. Broader scheduling and deployment questions remain with their owners and are not prerequisites invented for this bounded read slice.

Expected checks, not executed evidence: multi-day overlap and interval-boundary exclusion; center-local rendering across DST; complete pagination; empty/error/loading states without partial or previous-scope data; valid versus expired holds without GET mutations; occupancy independent of booking-list filters/pages; numeric remaining capacity only with complete authority and `null` fallback when unknown; one page-coherent UTC `asOf` without a cross-page snapshot guarantee; ascending booking creation/ID order; no contact data in events or operational booking rows; both contact permissions and existing-action audit retaining required identifiers without contact values/payloads; cross-tenant, cross-center and application-scope denial through BFF/API; preserved catalog response/range semantics; selected calendar URL views and valid center-local dates, invalid-navigation recovery and navigation/focus/manual refresh without polling or automatic write retry. Query and payload performance has not been measured; no numeric budget is introduced.

### Compatibility and expected validation

**Documented:** [booking-schema.ts](../../packages/database/src/booking-schema.ts) requires a booking `slot_id`, and [public-booking.dto.ts](../../apps/api/src/booking/public-booking.dto.ts) currently requires `slotId` in its input contract. The expanded model therefore needs an approved migration and public-create reconciliation, not just additional configuration tables. `DIVE-BOOK-REQ-060` and `065` confirmation/status behavior must be reconciled before date-free or day-only booking is implemented.

Expected scenarios, not executed evidence:

- single-date, daily and weekday-filtered intervals, including a single date excluded by its weekday filter;
- several local times through several rules, deduplication of identical candidates and rejection of incompatible coincidences;
- dated and date-free eligibility coexisting without automatic publication;
- missing effective capacity/duration never yielding a guaranteed exact-time confirmation;
- two requests materializing the same occurrence and competing for its last seat without duplicate slots or capacity;
- DST gap/fold rejection under the accepted initial local-time handling, and center-timezone-change cases once that policy is selected;
- a rule or closure edit racing with booking, including an already-held seat and an execution spanning a closed date;
- preserved bookings after rule edits, provenance/revision checks and authorized conflict resolution;
- pagination/range expansion under representative data, without a new global recurrence horizon or unmeasured performance claim;
- cross-tenant/cross-center relation denial and RLS/context tests for every new tenant-owned relation, separate from booking-capacity results.

## Open questions

The existing US-08 fixed-time catalog contract remains closed for its implemented slice. ADR-DIVE-015 opens the following blocking reconciliation questions for the expanded model:

1. Booking and scheduling state machines for day-without-time and date-free booking.
2. Capacity and hold behavior before a concrete scheduled activity exists.
3. Multi-session courses and partial scheduling require separate approval; they are excluded from the first increment's at-most-one-execution cardinality.
4. Physical uniqueness for the accepted activity-plus-instant identity; compatibility/overlap validation and simultaneous distinct executions outside the initial scope; canonical field transport/storage/migration; validation/errors for DST gap/fold rejection and active-rule timezone changes; revision/update representation and transaction order; exact bounded query and pagination contracts without a global recurrence horizon.
5. Channel inclusion and publication lifecycle for rules, date-free offers and scheduled activities; materialized-slot treatment after deactivation.
6. Exact staff structural-mutation HTTP, idempotency, incompatible-state, notification, and concurrency contract.
7. Closure conflict resolution for concrete executions, holds and bookings; exact interval endpoints/timezone conversion under accepted full-interval matching; date-free offers during closure.
8. Pending-scheduling list projection remains outside phase two and unresolved. Its calendar filter-recovery/URL-normalization contract is separately confirmed in [remaining-contract solutions](#calendar-phase-two-remaining-contract-solutions), not an open decision for that bounded slice.
9. HTTP, persistence, migration and backward compatibility for other expanded-model behaviors remain open. The bounded phase-two response/validation/query and [IAM read-audit](../iam/SPEC-DIVE-IAM-001.md#calendar-phase-two-read-audit-proposal) choices were explicitly confirmed on 2026-10-01; their implementation proof remains a delivery obligation, not an unanswered design question.
10. Effective execution-language, modality and meeting-guidance representation; guarantees and any requested-language selection for undated bookings; customer communication and acceptance when assigning/changing an execution. Approved commercial direction does not select these transport or storage contracts.
11. Future authoritative blocked-seat persistence and creation/release contracts outside phase two. This increment's exclusion of those writes and `remainingSeats: null` fallback are selected, not open; proving when complete authoritative occupancy is available remains a delivery gate.

Cursor pagination remains deferred. Staff assignment remains deferred and no permission, role, eligibility rule, or schema is authorized by this revision.
