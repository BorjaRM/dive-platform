# SPEC-DIVE-BOOKING-001 — Bookings, widget, and calendar

- **Status:** Ready to start
- **Version:** 1.2
- **Last reviewed:** 2026-09-27
- **Approved by:** Borja (Product owner)
- **Approval reference:** PR #1, provenance migration PR, product confirmations 2026-09-27 for catalog HTTP, slot time representation, public visibility of full slots, ADR-DIVE-010 public create closures, and explicit approval by Product, Security, and Architecture on 2026-09-27 of the point 1 rejection contract and public capability contract; PR #35 product-owner confirmation on 2026-09-27 for simplified activity and slot listing, catalog DTOs, and persistence naming
- **Owner:** Product / Booking
- **IDs:** `DIVE-BOOK-REQ-001` … `DIVE-BOOK-REQ-072`

## Normative authority

This SPEC is the single normative source for booking services (activities), scheduled occurrences (slots), bookings, capacity, confirmation, modification, cancellation, public channels, the hosted booking page, and the embeddable widget.

Other documents (product profile, spikes, traceability, deliverables, Notion pages) must link here. They must not redefine these rules.

Historical Notion draft IDs `REQ-003` and `REQ-029` map to `DIVE-BOOK-REQ-003` and `DIVE-BOOK-REQ-029`.

## Requirement provenance

The ranges below cover every requirement in this SPEC. `Derived` consolidates the linked sources; `Proposed` identifies decisions introduced during PR #1 and explicitly accepted by the product owner before this migration.

| Requirement IDs | Provenance | Exact source | Decision status |
|---|---|---|---|
| `DIVE-BOOK-REQ-001..DIVE-BOOK-REQ-008` | `Derived` | `specs/foundation/multitenancy-architecture.md`; `specs/architecture/adrs/ADR-DIVE-001.md`; PR #1 | Approved by product owner |
| `DIVE-BOOK-REQ-009..DIVE-BOOK-REQ-016` | `Derived` | `specs/product/dive-mvp-profile.md`; PR #1 | Approved by product owner |
| `DIVE-BOOK-REQ-017..DIVE-BOOK-REQ-024` | `Proposed` | PR #1 booking lifecycle consolidation | Approved by product owner for MVP validation |
| `DIVE-BOOK-REQ-025..DIVE-BOOK-REQ-032` | `Derived` | `specs/spikes/SPIKE-DIVE-001/specification.md`; `specs/spikes/SPIKE-DIVE-001/requirements.md`; PR #1 | Approved by product owner |
| `DIVE-BOOK-REQ-033..DIVE-BOOK-REQ-036` | `Proposed` | PR #1 mutation and cancellation consolidation | Approved by product owner for MVP validation |
| `DIVE-BOOK-REQ-037..DIVE-BOOK-REQ-042` | `Derived` | `specs/architecture/adrs/ADR-DIVE-002.md`; `specs/spikes/SPIKE-DIVE-003/specification.md`; PR #1; product confirmation by Borja on 2026-09-27 for public visibility of full slots | Approved by product owner, including `Available` + `Full` visibility on 2026-09-27 |
| `DIVE-BOOK-REQ-043..DIVE-BOOK-REQ-048` | `Derived` | `specs/foundation/security-privacy-baseline.md`; `specs/foundation/operations-quality-recovery.md`; `specs/product/dive-mvp-profile.md`; PR #1 | Approved by product owner |
| `DIVE-BOOK-REQ-049..DIVE-BOOK-REQ-057` | `Proposed` | Product confirmation by Borja on 2026-09-27 for US-08 catalog HTTP, center-scoped operations, slot time representation, listing defaults, and PR #35 simplification of activity/slot listing | Approved by product owner 2026-09-27 for MVP validation |
| `DIVE-BOOK-REQ-058..DIVE-BOOK-REQ-067` | `Proposed` | ADR-DIVE-010 v0.3; explicit acceptance by Borja on 2026-09-27 of public create, channel policy, retry, surface, origin, and OTA-boundary closures | Approved by product owner 2026-09-27; Ready to start |
| `DIVE-BOOK-REQ-068..DIVE-BOOK-REQ-069` | `Proposed` | Product, Security, and Architecture approval on 2026-09-27 of the rejected-booking state and internal rejection contract | Approved; Ready to start |
| `DIVE-BOOK-REQ-070..DIVE-BOOK-REQ-072` | `Proposed` | Product, Security, and Architecture approval on 2026-09-27 of the public capability recommendations; ADR-DIVE-005 v0.3 | Approved; Ready to start |

### Normative defaults provenance

| Decision | Provenance | Exact source | Decision status |
|---|---|---|---|
| Public create-booking requires an idempotency key | `Derived` | `DIVE-BOOK-REQ-028`; PR #1 | Approved by product owner |
| Pending hold TTL is 15 minutes | `Proposed` | PR #1 | Approved by product owner for MVP validation |
| Public cancellation token TTL is 72 hours | `Proposed` | PR #1 | Approved by product owner for MVP validation |
| Widget starts at 720 px, 100% width, one column | `Derived` | `specs/spikes/SPIKE-DIVE-003/specification.md`; PR #1 | Approved by product owner |
| Allowed `postMessage` types | `Proposed` | PR #1 | Approved by product owner for MVP validation |
| `postMessage` excludes secrets and full personal data | `Derived` | `specs/foundation/security-privacy-baseline.md`; PR #1 | Approved by product owner |
| Widget customization allow-list | `Proposed` | PR #1 | Approved by product owner for MVP validation |
| Slot persists `starts_at` timestamptz and `duration_minutes`; end is derived | `Proposed` | Product confirmation by Borja on 2026-09-27; specializes `DIVE-BOOK-REQ-010` | Approved by product owner 2026-09-27 for MVP validation |
| Slot list result maximum is 50 for a required date range; activities are not paginated | `Proposed` | Product confirmation by Borja in PR #35 on 2026-09-27 | Approved by product owner 2026-09-27 for MVP validation |
| Public channel `confirmation_mode` defaults to `immediate` | `Proposed` | ADR-DIVE-010 v0.3; explicit product-owner acceptance 2026-09-27 | Approved; Ready to start |
| Public create first success is `201`, same-request replay is `200`, and key reuse with a different request is `409 idempotency_conflict` | `Proposed` | ADR-DIVE-010 v0.3; explicit product-owner acceptance 2026-09-27 | Approved; Ready to start |

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
- Slot: `Available → Full → Closed | Cancelled`; `Full → Available` is allowed when seats are released and the slot is not `Closed` or `Cancelled`; `Closed → Cancelled` is allowed
- Booking: `Pending → Confirmed | Rejected | Cancelled | Expired`; `Confirmed → Cancelled`

`Cancelled`, `Rejected`, and `Expired` are terminal. `Closed` is terminal except for the approved `Closed → Cancelled` transition. `Disabled` on an activity does not change existing slot states.

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

- **DIVE-BOOK-REQ-037:** Channel type `center_catalog` publishes the published activities and future slots in state `Available` or `Full` of one center. `Full` slots are visible as non-bookable. `Closed` and `Cancelled` slots are excluded.
- **DIVE-BOOK-REQ-038:** Channel type `single_activity` publishes one published activity and its future slots in state `Available` or `Full`. `Full` slots are visible as non-bookable. `Closed` and `Cancelled` slots are excluded.
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
- **DIVE-BOOK-REQ-049:** A slot persists `starts_at` as timestamptz and `duration_minutes` as a positive integer. End time is derived. Remaining sellable seats are not persisted; they are derived from bookings.
- **DIVE-BOOK-REQ-050:** Dashboard catalog and availability HTTP for the center application is always scoped to one center:

```text
GET    /v1/centers/:centerId/activities
POST   /v1/centers/:centerId/activities
PATCH  /v1/centers/:centerId/activities/:activityId/publish
PATCH  /v1/centers/:centerId/activities/:activityId/disable
GET    /v1/centers/:centerId/activities/:activityId/slots
POST   /v1/centers/:centerId/activities/:activityId/slots
PATCH  /v1/centers/:centerId/slots/:slotId/close
PATCH  /v1/centers/:centerId/slots/:slotId/cancel
```

`:centerId`, `:activityId`, and `:slotId` are selectors, never authorization. Paths MUST NOT include a tenant identifier. A request MUST NOT list, create, or mutate resources of another center, even when the actor has access to that other center.
- **DIVE-BOOK-REQ-051:** `POST /v1/centers/:centerId/activities` creates an activity in `Draft`. The client sends localized `name` (`es` / `en` object), optional localized `description`, and optional positive `defaultCapacity`. The client MUST NOT send `tenantId`, `centerId`, or `status`.
- **DIVE-BOOK-REQ-052:** `POST /v1/centers/:centerId/activities/:activityId/slots` is allowed only when that activity is `Published`. The created slot is `Available`. The client sends `startsAt`, positive `durationMinutes`, and positive `capacity`. Tenant and center are taken from the authorized path and activity. The client MUST NOT send `tenantId`, another `centerId`, `status`, `end`, or remaining seats.
- **DIVE-BOOK-REQ-053:** `PATCH .../publish` requires both `name.es` and `name.en`. A Draft may be saved with incomplete translations. `PATCH .../disable` stops new use of the activity and does not cancel existing slots.
- **DIVE-BOOK-REQ-054:** Repeating `publish`, `disable`, `close`, or `cancel` when the resource is already in the resulting state is idempotent success (`204`). An incompatible transition returns `409`.
- **DIVE-BOOK-REQ-055:** A slot may transition `Closed → Cancelled`.
- **DIVE-BOOK-REQ-056:** Catalog HTTP uses `application/problem+json`. Create returns `201`. Successful commands return `204`. Malformed JSON returns `400`. Missing session or tenant context returns `401`. A permission failure inside the current authorized center returns `403`. A missing resource or a resource outside the current center/tenant returns `404` with the same observable result. Semantic field errors return `422`.
- **DIVE-BOOK-REQ-057:** Catalog lists never accept multiple centers. The activity list returns all activities of the authorized center without pagination, ordered by `created_at DESC`, then `id DESC`, and may be filtered by `status`. The slot list requires a date range, is ordered by `starts_at ASC`, then `id ASC`, may be filtered by `status`, and returns at most 50 matching slots. If the requested range matches more than 50 slots, the server returns the existing `422 validation_error` and the client must request a narrower range. The walking skeleton has no catalog cursor; introducing cursor pagination requires a separately approved contract change.

### Public create-booking

- **DIVE-BOOK-REQ-058:** Public create uses `POST /v1/public/channels/:channelPublicId/bookings` without Clerk or `X-Tenant-Context`. The server resolves tenant, center, publication state, activity/slot scope, origin policy, and confirmation mode from the published channel. The client MUST NOT send tenant, center, status, confirmation mode, or another channel selector as authorization.
- **DIVE-BOOK-REQ-059:** A public booking stores the authorizing `channel_id`, a stable `booking_channel`, and an idempotency key unique within tenant + channel. The first slice records `public_hosted`. A client-supplied surface is never authoritative; `public_widget` may be recorded only when server-derived from evidence approved by SPIKE-DIVE-003.
- **DIVE-BOOK-REQ-060:** Each public channel has `confirmation_mode = immediate | staff_approval`. Omission when creating a channel means `immediate`. `immediate` creates `Confirmed` when capacity allows; `staff_approval` creates `Pending` and applies the approved 15-minute hold TTL. The public caller cannot select or override this policy.
- **DIVE-BOOK-REQ-061:** Authorized staff manage channel confirmation policy through `PATCH /v1/centers/:centerId/channels/:channelId` with body `{ "confirmationMode": "immediate" | "staff_approval" }`. The operation requires `channel.manage`, current center scope, and audit. Path identifiers are selectors, never authorization.
- **DIVE-BOOK-REQ-062:** The HTTP caller generates and reuses the public-create idempotency key. Missing or malformed key returns `422 validation_error`. First success returns `201`; replay with the same key and semantically same request returns `200` with the persisted result; reuse with a semantically different request returns `409 idempotency_conflict`. No replay duplicates booking, capacity, audit, tokens, email, or outbox.
- **DIVE-BOOK-REQ-063:** A successful public create transaction atomically commits booking, audit, email outbox, and versioned verifiers for confirmation-read and cancellation. The response exposes both bearer tokens once, including for `Pending`; bearer values are never persisted or logged.
- **DIVE-BOOK-REQ-064:** Public-create errors use `application/problem+json`: malformed JSON is `400 malformed_json`; semantic/header validation is `422 validation_error`; an in-scope unavailable slot is `409 slot_unavailable`; idempotency payload conflict is `409 idempotency_conflict`; unknown, disabled, unpublished, mismatched, or cross-tenant channel/scope is one indistinguishable `404 resource_not_found`.
- **DIVE-BOOK-REQ-065:** First create returns `201` and idempotent replay returns `200`; both return `bookingId`, `status`, `seats`, `locale`, `confirmationReadToken`, and `cancelToken`. `bookingId` is a selector, not authorization. Status is `Confirmed` or `Pending` according to trusted channel policy and capacity.
- **DIVE-BOOK-REQ-066:** First-party hosted create accepts only its exact configured origin and MUST NOT use wildcard CORS. Origin checking constrains browser use and never replaces channel authorization. Widget origins and `frame-ancestors` remain governed by ADR-DIVE-005, `DIVE-BOOK-REQ-041`, and SPIKE-DIVE-003.
- **DIVE-BOOK-REQ-067:** Marketplace / OTA transport is outside the MVP. A future adapter requires a separately approved channel, authentication, idempotency/reconciliation, response/token transport, mapping, and operational contract; it may reuse the booking aggregate and invariants but MUST NOT infer authority from the hosted page or `channelPublicId` as a credential.
- **DIVE-BOOK-REQ-068:** Booking states are `Pending`, `Confirmed`, `Rejected`, `Cancelled`, and `Expired`. The allowed booking transitions are `Pending → Confirmed | Rejected | Cancelled | Expired` and `Confirmed → Cancelled`. `Rejected`, `Cancelled`, and `Expired` are terminal. Rejection applies only to `Pending` bookings and releases their held seats exactly once. Blocking a rejected booking is outside this command and requires a separate explicitly authorized action.
- **DIVE-BOOK-REQ-069:** Authorized staff reject a booking through `POST /v1/centers/:centerId/bookings/:bookingId/reject` with Clerk authentication, `X-Tenant-Context`, current center scope, and `booking.reject`. The request has no required body or free-text reason. A `Pending` booking returns `204`, transitions to `Rejected`, releases held seats exactly once, and atomically records the booking change, audit event, and `booking.rejected` outbox event. Repeating the command for an already `Rejected` booking returns `204` without duplicating effects. A command for `Confirmed`, `Cancelled`, or `Expired` returns `409 booking_state_conflict`; missing authentication/context returns `401`, a missing capability returns `403`, and an out-of-scope resource returns the existing non-disclosing `404` contract. A competing confirmation, cancellation, or expiry has one observable order and only the winning transition applies its side effects.
- **DIVE-BOOK-REQ-070:** Public confirmation read uses `GET /v1/public/bookings/:bookingId/confirmation` with a `booking_confirmation_read` bearer token in `Authorization`. The route does not use Clerk or `X-Tenant-Context`; `bookingId` is a selector only. A valid token returns only the safe booking projection (`bookingId`, `status`, `seats`, `locale`, and non-sensitive slot presentation data), including terminal states. Invalid, expired, revoked, wrong-purpose, wrong-booking, and unknown credentials produce one indistinguishable non-disclosing `404` result.
- **DIVE-BOOK-REQ-071:** Public cancellation uses `POST /v1/public/bookings/:bookingId/cancel` with a `booking_cancel` bearer token and an `Idempotency-Key`. A valid request may cancel `Pending` or `Confirmed`, releases its held or consumed seats exactly once, and commits the booking change, audit, and outbox atomically. Public cancellation cannot select a blocking disposition. Reusing the same idempotency key returns the persisted result without repeating side effects. A valid token for `Rejected`, `Expired`, or already `Cancelled` returns `409 booking_not_cancellable`; invalid credentials use the non-disclosing `404` contract from `DIVE-BOOK-REQ-070`.
- **DIVE-BOOK-REQ-072:** Public token resend uses `POST /v1/public/bookings/:bookingId/tokens/resend` with the booker email, a requested token purpose, and an `Idempotency-Key`. The requested purpose MUST be `booking_confirmation_read` or `booking_cancel`. The confirmation-read token may be resent for any retained booking state; the cancellation token may be resent only for `Pending` or `Confirmed`. The endpoint always returns the same non-disclosing `202` response and sends no bearer value in HTTP. When the retained booking and normalized email match and the requested purpose is eligible, it queues a replacement token email, revokes the previous active token for that purpose, applies rate limits by IP, booking, and email, and records audit/outbox effects without exposing whether a match occurred.

## Catalog HTTP (center application)

This interface is for the authenticated center application. Public widget and hosted-page routes remain outside it.

| Method and path | Effect |
|---|---|
| `GET /v1/centers/:centerId/activities` | List activities of that center only |
| `POST /v1/centers/:centerId/activities` | Create a Draft activity in that center |
| `PATCH /v1/centers/:centerId/activities/:activityId/publish` | Publish that activity |
| `PATCH /v1/centers/:centerId/activities/:activityId/disable` | Disable new use of that activity |
| `GET /v1/centers/:centerId/activities/:activityId/slots` | List slots of that activity and center |
| `POST /v1/centers/:centerId/activities/:activityId/slots` | Schedule a slot on a Published activity |
| `PATCH /v1/centers/:centerId/slots/:slotId/close` | Close the slot to new bookings; keep confirmed bookings |
| `PATCH /v1/centers/:centerId/slots/:slotId/cancel` | Cancel the slot and block remaining sellable capacity |

Protected requests send `Authorization: Bearer <clerk-session-token>` and `X-Tenant-Context` issued for the center application. Entry follows `ADR-DIVE-008`: body `centerRef` equals the platform-subdomain `centerKey` during bootstrap; afterward product paths use the returned `centerId`. `centerId` in the path must match the center resolved at entry.

## Booking rejection HTTP

This authenticated dashboard command is separate from public cancellation. `:centerId` and `:bookingId` are selectors; tenant, center scope, roles, and permissions come from the authenticated request and PostgreSQL authorization state.

| Method and path | Required authorization | Effect |
|---|---|---|
| `POST /v1/centers/:centerId/bookings/:bookingId/reject` | Clerk session, `X-Tenant-Context`, center scope, `booking.reject` | Reject a `Pending` booking and release its held seats once |

The command uses `application/problem+json` for failures. A repeated command against `Rejected` is idempotent success; incompatible terminal states return `409 booking_state_conflict`. No customer email is emitted by this command in the MVP.

## Public booking capability HTTP

Public capability routes use the booking-specific bearer tokens from the successful public-create response. They do not use Clerk, dashboard roles, or `X-Tenant-Context`. A booking identifier in a public path is a selector and never authorizes access.

| Method and path | Credential | Effect |
|---|---|---|
| `GET /v1/public/bookings/:bookingId/confirmation` | `booking_confirmation_read` | Read the safe current booking projection, including terminal status |
| `POST /v1/public/bookings/:bookingId/cancel` | `booking_cancel` + `Idempotency-Key` | Cancel a `Pending` or `Confirmed` booking once |
| `POST /v1/public/bookings/:bookingId/tokens/resend` | Booker's email + `Idempotency-Key` | Queue a purpose-specific replacement token email without disclosure |

Public credential failures are indistinguishable from unknown or mismatched booking selectors. Business-state failures after successful credential verification use `application/problem+json` with stable codes such as `booking_not_cancellable`. Resend never returns a token in the HTTP response.


## Default values for implementation

These defaults are normative until a later SPEC/ADR changes them:

- Idempotency key required on public create-booking
- Pending hold TTL: 15 minutes unless the SPEC is updated
- Public cancellation token TTL: 72 hours
- Widget initial height: 720 px, width 100%, single column
- `postMessage` types allowed: height, load, navigate-to-fallback, booking-result
- `postMessage` never transports secrets or full personal data
- Allowed widget customization: logo, validated colors, catalog font, localized copy, predefined corner radius. No center-supplied HTML, CSS, or JavaScript
- Slot time fields: persist `starts_at` as timestamptz and `duration_minutes`; derive end; do not persist remaining seats
- Activity lists are unpaginated; slot lists require a date range and return at most 50 results; ranges exceeding that result limit return `422 validation_error`
- Public channel confirmation mode: `immediate` when omitted
- Public create first success: `201`; same-request replay: `200`; different-request key reuse: `409 idempotency_conflict`
- Public capability cancellation requires an `Idempotency-Key`; a same-key retry returns the persisted result without repeating side effects
- First public implementation surface: `public_hosted`; `public_widget` requires server-derived SPIKE-DIVE-003 evidence
- Public hosted create CORS: exact configured origin; no wildcard

## Edge cases

- Last seat contested by widget, hosted page, and dashboard
- Retry after timeout with the same idempotency key
- Pending expiry racing with confirmation
- Slot cancelled while a pending booking exists
- Disabled activity with still-available slots
- Token reuse after public cancellation
- Staff rejection racing with confirmation, cancellation, or expiry
- Public confirmation read for each booking terminal state
- Public cancellation retry with the same and a different idempotency key
- Public token resend with unknown, mismatched, rate-limited, and repeated requests
- Locale switched mid-flow
- Origin not on the channel allow-list
- Center-application user with access to two centers opens center A and must not see center B catalog
- `centerId` A with an activity or slot of center B
- Repeat publish/disable/close/cancel on an already applied state
- Publish with missing `en` or `es` name
- Create slot on a Draft or Disabled activity

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

## Tests and expected evidence

- Unit tests for the capacity invariant and state transitions
- Integration tests with real PostgreSQL and concurrency barriers (`SPIKE-DIVE-001`)
- Negative public-channel manipulation tests
- Outbox/audit atomicity tests
- Locale catalogs `es`/`en`
- Widget origin/CSP/fallback evidence (`SPIKE-DIVE-003`) before pilot
- Catalog HTTP contract tests for `DIVE-BOOK-REQ-049..057`, including center-scope negatives and idempotent commands
- Public-create contract tests for `DIVE-BOOK-REQ-058..067`: trusted channel resolution, mode policy, exact origin, idempotent replay/conflict, atomic side effects, token secrecy, non-disclosing errors, and last-seat contention
- Booking rejection contract tests for `DIVE-BOOK-REQ-068..069`: state transitions, seat release, permission/scope enforcement, repeated-command idempotency, atomic audit/outbox effects, and concurrent terminal transitions
- Public-capability contract tests for `DIVE-BOOK-REQ-070..072`: confirmation-read and cancellation token purposes, cancellation retry semantics, terminal-state responses, resend non-disclosure, rate limiting, and replacement-token revocation
- Until a tenant/center onboarding story exists, catalog tests may insert tenant and center rows with fixtures; that is not an onboarding API

## Open questions

No US-08 catalog-contract decision remains open for the walking skeleton. PR #35 records the product-owner confirmation for list behavior, response DTOs, and physical persistence naming.

Cursor pagination is deferred rather than specified. If demonstrated volume later requires it, a separately approved contract change must define its scope and validation semantics before implementation.
