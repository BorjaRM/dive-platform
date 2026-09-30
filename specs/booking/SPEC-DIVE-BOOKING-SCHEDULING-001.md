# SPEC-DIVE-BOOKING-SCHEDULING-001 - Expanded scheduling and calendar

- **Status:** Accepted
- **Version:** 0.5
- **Last reviewed:** 2026-09-30
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

## Requirements

- **DIVE-BOOK-REQ-010:** A scheduled activity is distinct from both its activity and its availability configuration. Once exact scheduling exists, it has start time, duration or end time, capacity, and state. A recurrence day without an exact time and a date-free offer MUST NOT be represented as a concrete scheduled activity with a fabricated or null start.

- **DIVE-BOOK-REQ-012:** A booking references exactly one activity, a positive seat count, a stable `booking_channel`, and a booker contact. It may initially reference one scheduled activity, one center-published day without an exact time, or no date. Whether one booking may later relate to multiple scheduled activities for a multi-session course remains an open decision.

- **DIVE-BOOK-REQ-021:** For a booking assigned to a scheduled activity, `Pending` holds seats and `Confirmed` consumes seats. `Cancelled` and `Expired` do not consume seats unless staff explicitly blocks them. A booking without a scheduled activity does not consume or hold occurrence capacity; its scheduling and commercial states remain undefined and MUST NOT silently reuse `Pending`.

- **DIVE-BOOK-REQ-029:** Authoritative occurrence capacity resides on the scheduled activity, not on the activity catalog record or availability configuration. No capacity guarantee exists before a booking is assigned to a scheduled activity unless a later approved contract defines one.

- **DIVE-BOOK-REQ-034:** An authorized staff operation may change the scheduled activity, date/time, or seat count while preserving booking identity. It MUST revalidate capacity and apply the booking change, capacity effects, audit, and outbox atomically with one observable concurrency order. Public customers do not perform this structural edit; they cancel and create another booking. Exact HTTP, idempotency, notification, and incompatible-state rules remain open.

- **DIVE-BOOK-REQ-037:** Channel type `center_catalog` exposes a server-derived public projection of eligible published activities and the availability configurations or scheduled activities explicitly included by that published channel. Future scheduled activities in `Available` or `Full` may appear; `Full` is non-bookable and `Closed` or `Cancelled` is excluded. Internal catalog visibility never implies public publication.

- **DIVE-BOOK-REQ-038:** Channel type `single_activity` exposes one eligible published activity and only the center-controlled availability included by that published channel: fixed scheduled activities, published recurrence days with optional exact times, or date-free booking. `Full` scheduled activities are visible as non-bookable; `Closed`, `Cancelled`, excluded dates, and closed ranges are excluded.

- **DIVE-BOOK-REQ-043:** The center dashboard calendar shows authorized online and manual bookings and scheduled activities in day, week, and month views, opening on the current week. It distinguishes bookings still missing a date or exact time from concrete scheduled activities. Filtering is required; exact filter fields and URL behavior remain open.

- **DIVE-BOOK-REQ-049:** A concrete scheduled activity persists `starts_at` as timestamptz and `duration_minutes` as a positive integer; end is derived and remaining sellable seats are derived from bookings. Recurrence without an exact time and date-free booking belong to availability or scheduling records and MUST NOT fabricate `starts_at`. Their physical persistence contract remains open.

### ADR-DIVE-015 precedence and reconciliation boundary

`ADR-DIVE-015` records product decisions explicitly accepted by the product owner on 2026-09-30. Where previous fixed-slot-only wording conflicts with that ADR, the accepted model governs the product direction. State, capacity, recurrence, publication, HTTP, persistence, migration and compatibility details not specified by that acceptance remain implementation gates.

The existing fixed-time slot contract remains valid for that implemented slice, but it is no longer the exclusive booking model. Acceptance does not authorize implementation of date-free or time-free booking, multi-session courses, recurrence materialization, or staff structural mutation until their open contracts below are closed. Unaffected Ready-to-start behavior must not be weakened by this reconciliation.

## Definitions

- **Activity (booking service):** catalog offering configured by a center, e.g. “Discover Scuba Dive”. It may propose a default capacity. It is not the authoritative capacity record.
- **Availability configuration:** center-controlled offer configuration, distinct from a concrete scheduled activity. **Proposed, accepted:** dated options use `AvailabilityRule`; date-free eligibility uses `Activity.allow_booking_without_date`, not a rule with missing dates.
- **Scheduled activity (`Slot` in the current fixed-time implementation):** concrete execution of an activity once its exact start, duration, capacity, and state are known. It is the authoritative capacity record for bookings assigned to it.
- **Booking:** customer commitment for one or more seats in an activity. It may initially select a scheduled activity, a center-published day without an exact time, or no date when the center will schedule it later. Multi-session cardinality remains open.
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
- base_locale             explicit es/en; no default
- allow_booking_without_date
- created_at

AvailabilityRule
- id
- tenant_id
- center_id
- activity_id
- starts_on
- ends_on
- weekdays?               empty/null = all days in the interval
- local_time?             null = day selection without an exact time
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

**Documented:** creation and publication require a name only in the activity's explicit base language; other translations and description are optional. `DIVE-BOOK-REQ-009`, `051` and `053` in [the catalog language policy](SPEC-DIVE-BOOKING-CATALOG-001.md#activity-languages-and-fallback) own the approved requested-language-to-base fallback. Scheduling configuration does not duplicate that resolution or choose a base-language default.

`CenterBookingSettings` has one record per `(tenant_id, center_id)`. Rule-to-activity and record-to-center relations preserve both tenant and center through composite keys and the existing authorization/RLS boundary in [ADR-DIVE-001](../architecture/adrs/ADR-DIVE-001.md). Missing settings, nullability, physical names, constraints, permissions and migration details require explicit contracts; missing configuration must not silently invent open weekdays.

### Uniform interpretation and validation

| Configuration | Candidate meaning |
|---|---|
| `starts_on = ends_on` | One local date, subject to weekday and closure filters |
| Bounded interval with empty/null `weekdays` | Every local date in the inclusive interval |
| Bounded interval with selected `weekdays` | Only matching local weekdays |
| `local_time` present | Exact-time candidate; not yet a capacity guarantee |
| `local_time` absent | Published day selection; scheduling time remains unresolved |
| `allow_booking_without_date = true` | Date-free eligibility without a fabricated rule, independently of dated rules |

Require `starts_on <= ends_on`, valid local dates/times, unique valid weekday values, and positive duration/capacity when provided. Canonical null/empty storage and weekday numbering remain open. A single date excluded by its weekday filter produces no candidate; it does not bypass the filter.

One rule describes one local time; multiple times use multiple rules. Changing interval bounds or clearing a local time changes future candidates only, not committed executions. The configuration form exposes From, Until, Weekdays, optional Time, Duration, Capacity and Active; it does not expose `kind` or cron. No activity-specific closures, per-rule exceptions or positive closure overrides are introduced.

### Capacity, materialization and overlap

Rule `capacity` is a per-execution template, not a total rule quota, daily pool or unlimited capacity. Resolve it from the rule value or the activity default when creating a concrete execution; persist the resolved value on `Slot`. Duration must also be known before an exact-time execution can commit seats; no duration default is introduced.

Generate candidates for the requested range without mandatory materialization of all future executions. Create or reuse a stable persistent `Slot` before committing exact-time seats, and perform capacity checks through the existing booking transaction owner. Day-only and date-free bookings do not create dummy/null-start slots or claim occurrence-capacity guarantees; no daily quota is implicitly introduced.

An occurrence identity cannot be based only on `rule_id`. Coincident rules must not duplicate executions or capacity pools. Reject coincident configurations with incompatible execution values for the first increment; identical candidates must resolve to one execution. The exact identity key, overlap algorithm, distinction between simultaneous executions, concurrency control, idempotency and errors remain blocking questions.

### Booking and publication boundaries

Accepted booking relationships include an obligatory activity, an optional concrete slot, and a selected local date for day-only selection. A slot must belong to that same tenant, center and activity. Legal combinations, persistence of the selected date after scheduling, commercial/scheduling transitions and multi-session cardinality remain open. This model introduces no new status and does not reuse capacity-holding `Pending` for unscheduled work.

Effective dated candidates combine existing concrete slots, including manually created ones, with active-rule candidates without double counting. Apply center unavailable weekdays and dated closures, then the applicable execution state, capacity and channel-publication constraints. Eligible `Full` executions may remain visible but not bookable under `DIVE-BOOK-REQ-037..038`. Date-free eligibility is a separate projection, not subtraction from a dated calendar.

An active rule is not automatically published. The server must enforce eligible activity publication and explicit channel inclusion of the rule, execution or date-free offer. The exact inclusion lifecycle and treatment of materialized slots after rule deactivation remain open. Browser selectors never establish publication or tenant authority.

### Time, edits and closure conflicts

Dates and local times are evaluated in the center's confirmed IANA time zone; a concrete slot retains its UTC instant. Reuse the time boundary in [catalog.time.ts](../../apps/api/src/catalog/catalog.time.ts) rather than a second converter. Its current instant conversion is not a DST recurrence policy: nonexistent/repeated local times and center-timezone changes still require explicit decisions.

Rule values and activity defaults are not live values for previously committed slots. Rule, settings and closure edits must not silently move executions, change their committed capacity, cancel bookings or invalidate held seats. Preserve configuration provenance/revision and enforce edit concurrency; the exact revision token, historical representation and update contract are not selected here.

Center closures block new sales of affected concrete slots as well as derived candidates; existing bookings are surfaced for explicit authorized resolution, not silently cancelled. Whether closure matching checks the full execution interval, and how date-free offers behave during closures, remain unresolved. Booking must revalidate current rule, closure, channel and capacity eligibility with one observable order against competing edits; audit/outbox and idempotency remain within the existing transaction boundary.

### Commercial execution boundaries

**Proposed, explicitly approved:** on 2026-09-30 the product owner requested "aplica los cambios propuestos sobre la documentacion", approving the preceding proposals to separate commercial defaults from execution facts. This clarifies the activity/execution and public-projection boundaries under `DIVE-BOOK-REQ-010`, `034`, `037..038` and `049`, not staff/resource assignment or a finished execution-edit contract.

- Customer-service/opening hours of a center do not create activity availability. Indicative activity duration does not replace a rule/execution's confirmed duration or authorize a fabricated exact start.
- Stable meeting guidance belongs to the activity; an execution owns its effective meeting guidance when it differs. The relevant customer map must identify the meeting point rather than silently use the center's headquarters address.
- Activity teaching languages describe the offer under the catalog owner. Where an execution restricts them, show the guaranteed effective languages before booking. Category and entry modality remain separate; if modality varies by departure, the execution's effective modality is presented explicitly.
- These facts are not inferred from a customer's interface locale, a translation, or the latest center profile. Changing a profile, rule or commercial activity field does not silently alter an existing execution or booking commitment.
- An undated/day-only booking must not acquire a dummy execution merely to attach commercial fields. Requested-language selection, guarantees before assignment, exact effective-field storage, revision/override semantics and communication of changes require explicit contracts. No staff matching or boat assignment is introduced.

**Documented:** accepted booking history belongs to [SPEC-DIVE-BOOKING-001](SPEC-DIVE-BOOKING-001.md), `DIVE-BOOK-REQ-080`; cancellation and acceptance of conditions when assigning an agreed date refer to [SPEC-DIVE-BOOKING-CAPABILITIES-001](SPEC-DIVE-BOOKING-CAPABILITIES-001.md), `DIVE-BOOK-REQ-081`. Existing structural-edit, state, capacity, audit/outbox and concurrency gates remain; the new commercial approval does not close them.

Expected checks, not executed proof: center opening hours do not generate candidates; commercial duration does not change committed execution duration; maps distinguish headquarters from meeting points; effective languages/modality match what was offered for that execution; profile edits do not rewrite commitments; and undated bookings remain free of fabricated starts while agreed assignment preserves condition history.

### Compatibility and expected validation

**Documented:** [booking-schema.ts](../../packages/database/src/booking-schema.ts) requires a booking `slot_id`, and [public-booking.dto.ts](../../apps/api/src/booking/public-booking.dto.ts) currently requires `slotId` in its input contract. The expanded model therefore needs an approved migration and public-create reconciliation, not just additional configuration tables. `DIVE-BOOK-REQ-060` and `065` confirmation/status behavior must be reconciled before date-free or day-only booking is implemented.

Expected scenarios, not executed evidence:

- single-date, daily and weekday-filtered intervals, including a single date excluded by its weekday filter;
- several local times through several rules, deduplication of identical candidates and rejection of incompatible coincidences;
- dated and date-free eligibility coexisting without automatic publication;
- missing effective capacity/duration never yielding a guaranteed exact-time confirmation;
- two requests materializing the same occurrence and competing for its last seat without duplicate slots or capacity;
- DST gap/fold and center-timezone-change cases once their policy is selected;
- a rule or closure edit racing with booking, including an already-held seat and an execution spanning a closed date;
- preserved bookings after rule edits, provenance/revision checks and authorized conflict resolution;
- pagination/range expansion under representative data, without a new global recurrence horizon or unmeasured performance claim;
- cross-tenant/cross-center relation denial and RLS/context tests for every new tenant-owned relation, separate from booking-capacity results.

## Open questions

The existing US-08 fixed-time catalog contract remains closed for its implemented slice. ADR-DIVE-015 opens the following blocking reconciliation questions for the expanded model:

1. Booking and scheduling state machines for day-without-time and date-free booking.
2. Capacity and hold behavior before a concrete scheduled activity exists.
3. Multi-session course cardinality and partial scheduling.
4. Stable occurrence identity; identical/incompatible rule overlaps and simultaneous distinct executions; weekday numbering and canonical null/empty representation; DST and timezone-change policy; revision/update concurrency; bounded query and pagination contracts without a global recurrence horizon.
5. Channel inclusion and publication lifecycle for rules, date-free offers and scheduled activities; materialized-slot treatment after deactivation.
6. Exact staff structural-mutation HTTP, idempotency, incompatible-state, notification, and concurrency contract.
7. Closure conflict resolution for concrete executions, holds and bookings; full-interval matching; date-free offers during closure.
8. Exact calendar and activity-list filters.
9. HTTP routes, DTOs, stable errors, persistence, migration, and backward compatibility for the expanded model.
10. Effective execution-language, modality and meeting-guidance representation; guarantees and any requested-language selection for undated bookings; customer communication and acceptance when assigning/changing an execution. Approved commercial direction does not select these transport or storage contracts.

Cursor pagination remains deferred. Staff assignment remains deferred and no permission, role, eligibility rule, or schema is authorized by this revision.
