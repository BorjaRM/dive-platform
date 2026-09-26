# SPEC-DIVE-BOOKING-001 — Bookings, widget, and calendar

- **Status:** Ready to start
- **Version:** 0.4
- **Owner:** Product / Booking
- **IDs:** `DIVE-BOOK-REQ-001` … `DIVE-BOOK-REQ-048`

## Normative authority

This SPEC is the single normative source for booking services (activities), scheduled occurrences (slots), bookings, capacity, confirmation, modification, cancellation, public channels, the hosted booking page, and the embeddable widget.

Other documents (product profile, spikes, traceability, deliverables, Notion pages) must link here. They must not redefine these rules.

Historical Notion draft IDs `REQ-003` and `REQ-029` map to `DIVE-BOOK-REQ-003` and `DIVE-BOOK-REQ-029`.

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

## Definitions

- **Activity (booking service):** catalog offering configured by a center, e.g. “Discover Scuba Dive”. It may propose a default capacity. It is not the authoritative capacity record.
- **Slot (scheduled activity / `Slot` in code):** concrete occurrence of an activity at a date and time, with its own identity, capacity, and state. This is the authoritative capacity record.
- **Booking:** reservation of one or more seats on one slot.
- **Booker:** responsible contact for the booking.
- **Channel:** server-side public or internal entry configuration. Browser input never authorizes tenant, center, activity, or slot.
- **Held seats:** seats reserved by a `Pending` booking that has not yet confirmed, expired, or been rejected.
- **Blocked seats:** seats withheld from sale after a staff cancellation or full slot cancellation, until explicitly released.
- **Session:** authentication/session lifecycle only. Do not use “session” for a slot.

## Surfaces

1. Public embedded widget (responsive iframe, provisional per ADR-DIVE-002)
2. Hosted public booking page (fallback and alternative integration)
3. Internal dashboard (calendar, booking management, manual bookings)

## States

- Activity: `Draft → Published → Disabled`
- Slot: `Available → Full → Closed | Cancelled`
- Booking: `Pending → Confirmed → Cancelled | Expired`

`Cancelled` and `Expired` are terminal. `Disabled` on an activity does not change existing slot states.

## Capacity invariant

At every committed state of a slot:

```text
confirmed_seats + held_seats + blocked_seats <= slot.capacity
```

Public, widget, hosted-page, and dashboard channels apply this invariant with the same transactional rule.

## Requirements

### Isolation and identity

- **DIVE-BOOK-REQ-001:** Every activity, slot, booking, channel, and booking-related audit/outbox record belongs to exactly one tenant and one center of that tenant. Cross-tenant relations are impossible.
- **DIVE-BOOK-REQ-002:** A center is an operational scope. Center identifiers never authorize access by themselves.
- **DIVE-BOOK-REQ-003:** Confirmed, held, and blocked seats never exceed the slot’s authoritative capacity.
- **DIVE-BOOK-REQ-004:** Tenant, center, activity, and slot for a public request are resolved server-side from published channel configuration. Values supplied by the browser are not sufficient to authorize the operation.
- **DIVE-BOOK-REQ-005:** Every tenant-owned booking table has a non-null `tenant_id`.
- **DIVE-BOOK-REQ-006:** Errors, empty results, and not-found responses never reveal bookings, slots, or contacts of another tenant or unauthorized center.
- **DIVE-BOOK-REQ-007:** Public bookers receive limited capabilities (create booking, read own confirmation, cancel via token). They never receive dashboard roles.
- **DIVE-BOOK-REQ-008:** Logs and traces carry a correlation ID and a safe tenant identifier when needed, and omit unnecessary PII.

### Catalog and booking model

- **DIVE-BOOK-REQ-009:** An activity is a center-scoped catalog offering with its own identity, publication state, localized name/description, and optional default capacity.
- **DIVE-BOOK-REQ-010:** A slot is a distinct entity: activity, start time, duration or end time, capacity, and state.
- **DIVE-BOOK-REQ-011:** An activity may propose a default capacity for new slots. That default is never the authoritative remaining-capacity source.
- **DIVE-BOOK-REQ-012:** A booking references exactly one slot, a positive seat count, a stable `booking_channel`, and a booker contact.
- **DIVE-BOOK-REQ-013:** Booker contact in the MVP is first name, last name, and email; phone is optional. No medical, certification, or emergency fields.
- **DIVE-BOOK-REQ-014:** Participant records, if collected, are limited to non-sensitive identifiers such as name and optional email. They are not an operational manifest.
- **DIVE-BOOK-REQ-015:** Public form configuration is explicit and versioned. Fields cannot silently expand into sensitive or deferred data.
- **DIVE-BOOK-REQ-016:** An optional external reference per channel may be stored for idempotency or reconciliation. It is never an authorization credential.

### Lifecycle

- **DIVE-BOOK-REQ-017:** Only `Published` activities may be used to create new public-facing slots or accept new public bookings.
- **DIVE-BOOK-REQ-018:** Disabling an activity stops new use of that activity. Existing slots are not cancelled automatically.
- **DIVE-BOOK-REQ-019:** A slot becomes `Full` when no remaining sellable seats exist; it may return to `Available` if seats are released and it is not `Closed` or `Cancelled`.
- **DIVE-BOOK-REQ-020:** Full cancellation of a slot blocks remaining sellable capacity. No new booking can confirm on that slot.
- **DIVE-BOOK-REQ-021:** `Pending` bookings hold seats. `Confirmed` bookings consume seats. `Cancelled` and `Expired` bookings do not consume seats unless staff explicitly blocks them.
- **DIVE-BOOK-REQ-022:** Closing a slot rejects new bookings and leaves already confirmed bookings intact.
- **DIVE-BOOK-REQ-023:** Public cancellation uses an opaque, single-purpose, expiring token. The token is not a session and is not reusable after success or expiry.
- **DIVE-BOOK-REQ-024:** Manual confirmation, rejection, and expiry of `Pending` bookings are deterministic. Held seats are released or blocked exactly once.

### Capacity, concurrency, and idempotency

- **DIVE-BOOK-REQ-025:** When two bookings compete for the last remaining seat, exactly one confirms or holds that seat; the other receives a stable unavailability result.
- **DIVE-BOOK-REQ-026:** Public and manual channels apply the same capacity rule.
- **DIVE-BOOK-REQ-027:** A multi-seat request consumes or holds exactly the requested number of seats and never exceeds remaining sellable capacity.
- **DIVE-BOOK-REQ-028:** Idempotency keys are unique within tenant and channel. A retry returns the persisted result without duplicating booking, seats, audit, email, or outbox.
- **DIVE-BOOK-REQ-029:** Authoritative capacity resides on the slot (scheduled activity), not on the activity catalog record.
- **DIVE-BOOK-REQ-030:** A booking competing with slot closure has one observable order: if closure wins, the booking is rejected; if the booking wins, it is confirmed or held and closure only prevents further new bookings.
- **DIVE-BOOK-REQ-031:** A booking competing with full slot cancellation has one observable order, leaves no active bookings on a cancelled slot, and emits coherent audit and outbox records.
- **DIVE-BOOK-REQ-032:** Expiry, rejection, and cancellation release or block seats exactly once, including concurrent workers.

### Mutation

- **DIVE-BOOK-REQ-033:** Non-structural fields (copy, notes, localization, non-capacity metadata) may be edited in place with audit.
- **DIVE-BOOK-REQ-034:** Changing the slot identity, date/time, or seat count of a booking requires cancellation-plus-replacement, not an in-place structural edit.
- **DIVE-BOOK-REQ-035:** Staff cancellation may release seats back to sellable capacity.
- **DIVE-BOOK-REQ-036:** Staff cancellation may instead block those seats. Blocked seats remain counted in the invariant until explicitly released by an authorized capability.

### Channels and widget

- **DIVE-BOOK-REQ-037:** Channel type `center_catalog` publishes the published activities and available slots of one center.
- **DIVE-BOOK-REQ-038:** Channel type `single_activity` publishes one published activity and its available slots.
- **DIVE-BOOK-REQ-039:** Multi-center public channels are out of MVP.
- **DIVE-BOOK-REQ-040:** The MVP widget is a responsive iframe of the hosted booking page. The hosted page is the required fallback.
- **DIVE-BOOK-REQ-041:** Each channel has an exact allow-list of origins. Production uses `frame-ancestors`. Wildcards and subdomains are allowed only when explicitly configured. Staging has a separate test mode.
- **DIVE-BOOK-REQ-042:** Locale `es` or `en` is preserved from the public surface through confirmation emails. Documents declare the language. Missing translation keys fail closed in CI once catalogs exist.

### Delivery, privacy, and side effects

- **DIVE-BOOK-REQ-043:** The dashboard calendar shows online and manual bookings for authorized tenant/center scopes using the same slot model.
- **DIVE-BOOK-REQ-044:** Confirmation and cancellation emails are produced through `TransactionalEmailPort` via the transactional outbox. The worker is idempotent.
- **DIVE-BOOK-REQ-045:** Domain change, audit record, and outbox record for the same operation commit atomically or not at all.
- **DIVE-BOOK-REQ-046:** MVP booking does not collect payments, medical answers, diagnoses, document images, emergency contacts, or certification evidence.
- **DIVE-BOOK-REQ-047:** Rate limits, validation, and anti-abuse controls must not create an enumeration oracle for tenants, centers, slots, or personal data.
- **DIVE-BOOK-REQ-048:** Booking-related personal data is limited to contact and booking operation. Retention, export, correction, and deletion follow the privacy baseline and must be defined before any real-data pilot.

## Default values for implementation

These defaults are normative until a later SPEC/ADR changes them:

- Idempotency key required on public create-booking
- Pending hold TTL: 15 minutes unless the SPEC is updated
- Public cancellation token TTL: 72 hours
- Widget initial height: 720 px, width 100%, single column
- `postMessage` types allowed: height, load, navigate-to-fallback, booking-result
- `postMessage` never transports secrets or full personal data
- Allowed widget customization: logo, validated colors, catalog font, localized copy, predefined corner radius. No center-supplied HTML, CSS, or JavaScript

## Edge cases

- Last seat contested by widget, hosted page, and dashboard
- Retry after timeout with the same idempotency key
- Pending expiry racing with confirmation
- Slot cancelled while a pending booking exists
- Disabled activity with still-available slots
- Token reuse after public cancellation
- Locale switched mid-flow
- Origin not on the channel allow-list

## Security, privacy, and operations

Authorization follows `SPEC-DIVE-IAM-001`. Isolation, RLS, pooling, and async propagation follow `specs/foundation/multitenancy-architecture.md` and `specs/multitenancy/adoption-profile.md`.

No real personal data in development, preview, or staging for this increment.

## Dependencies

- `specs/architecture/adrs/ADR-DIVE-001.md`
- `specs/architecture/adrs/ADR-DIVE-002.md`
- `specs/iam/SPEC-DIVE-IAM-001.md`
- `specs/spikes/SPIKE-DIVE-001/` for last-seat evidence
- `specs/spikes/SPIKE-DIVE-003/` for widget evidence
- Cross-cutting `MT-SPIKE-001` evidence before a real-data pilot

## Tests and expected evidence

- Unit tests for the capacity invariant and state transitions
- Integration tests with real PostgreSQL and concurrency barriers (`SPIKE-DIVE-001`)
- Negative public-channel manipulation tests
- Outbox/audit atomicity tests
- Locale catalogs `es`/`en`
- Widget origin/CSP/fallback evidence (`SPIKE-DIVE-003`) before pilot
