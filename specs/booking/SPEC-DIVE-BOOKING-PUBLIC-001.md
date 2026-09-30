# SPEC-DIVE-BOOKING-PUBLIC-001 - Published channels and public creation

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
| `DIVE-BOOK-REQ-004` | `Derived` | `specs/foundation/multitenancy-architecture.md`; `specs/architecture/adrs/ADR-DIVE-001.md`; PR #1 | Approved by product owner |
| `DIVE-BOOK-REQ-015` | `Derived` | `specs/product/dive-mvp-profile.md`; PR #1 | Approved by product owner |
| `DIVE-BOOK-REQ-039` | `Derived` | `specs/architecture/adrs/ADR-DIVE-002.md`; `specs/spikes/SPIKE-DIVE-003/specification.md`; PR #1; product confirmation by the product owner on 2026-09-27 for public visibility of full slots | Approved by product owner, including `Available` + `Full` visibility on 2026-09-27 |
| `DIVE-BOOK-REQ-047` | `Derived` | `specs/foundation/security-privacy-baseline.md`; `specs/foundation/operations-quality-recovery.md`; `specs/product/dive-mvp-profile.md`; PR #1 | Approved by product owner |
| `DIVE-BOOK-REQ-058..DIVE-BOOK-REQ-062` | `Proposed` | ADR-DIVE-010 v0.3; explicit acceptance by the product owner on 2026-09-27 | Original approval retained |
| `DIVE-BOOK-REQ-063` | `Proposed` | Reconciliation of original 063/065 and ADR-DIVE-005 v0.3, 2026-09-30 | Draft; Security approval pending |
| `DIVE-BOOK-REQ-064..DIVE-BOOK-REQ-067` | `Proposed` | ADR-DIVE-010 v0.3; explicit acceptance by the product owner on 2026-09-27 | Original approval retained |

## Requirements

- **DIVE-BOOK-REQ-004:** Tenant, center, activity, and slot for a public request are resolved server-side from published channel configuration. Values supplied by the browser are not sufficient to authorize the operation.

- **DIVE-BOOK-REQ-015:** Public form configuration is explicit and versioned. Fields cannot silently expand into sensitive or deferred data.

- **DIVE-BOOK-REQ-039:** Multi-center public channels are out of MVP.

- **DIVE-BOOK-REQ-047:** Rate limits, validation, and anti-abuse controls must not create an enumeration oracle for tenants, centers, slots, or personal data.

- **DIVE-BOOK-REQ-058:** Public create uses `POST /v1/public/channels/:channelPublicId/bookings` without Clerk or `X-Tenant-Context`. The server resolves tenant, center, publication state, activity/slot scope, origin policy, and confirmation mode from the published channel. The client MUST NOT send tenant, center, status, confirmation mode, or another channel selector as authorization.

- **DIVE-BOOK-REQ-059:** A public booking stores the authorizing `channel_id`, a stable `booking_channel`, and an idempotency key unique within tenant + channel. The first slice records `public_hosted`. A client-supplied surface is never authoritative; `public_widget` may be recorded only when server-derived from evidence approved by SPIKE-DIVE-003.

- **DIVE-BOOK-REQ-060:** Each public channel has `confirmation_mode = immediate | staff_approval`. Omission when creating a channel means `immediate`. `immediate` creates `Confirmed` when capacity allows; `staff_approval` creates `Pending` and applies the approved 15-minute hold TTL. The public caller cannot select or override this policy.

- **DIVE-BOOK-REQ-061:** Authorized staff manage channel confirmation policy through `PATCH /v1/centers/:centerId/channels/:channelId` with body `{ "confirmationMode": "immediate" | "staff_approval" }`. The operation requires `channel.manage`, current center scope, and audit. Path identifiers are selectors, never authorization.

- **DIVE-BOOK-REQ-062:** The HTTP caller generates and reuses the public-create idempotency key. Missing or malformed key returns `422 validation_error`. First success returns `201`; replay with the same key and semantically same request returns `200` with the persisted result; reuse with a semantically different request returns `409 idempotency_conflict`. No replay duplicates booking, capacity, audit, tokens, email, or outbox.

- **DIVE-BOOK-REQ-063:** **Proposed, Draft:** public create atomically commits booking, audit, email outbox and versioned verifiers for confirmation-read and cancellation, including Pending. Each purpose has one original credential emission; first response and exact replay return that emission without creating another credential, renewing expiry, or reactivating consumed/revoked credentials. Bearers are never persisted or logged. Replay after resend never exposes the replacement credential.

- **DIVE-BOOK-REQ-064:** Public-create errors use `application/problem+json`: malformed JSON is `400 malformed_json`; semantic/header validation is `422 validation_error`; an in-scope unavailable slot is `409 slot_unavailable`; idempotency payload conflict is `409 idempotency_conflict`; unknown, disabled, unpublished, mismatched, or cross-tenant channel/scope is one indistinguishable `404 resource_not_found`.

- **DIVE-BOOK-REQ-065:** First create returns `201` and idempotent replay returns `200`; both return `bookingId`, `status`, `seats`, `locale`, `confirmationReadToken`, and `cancelToken`. `bookingId` is a selector, not authorization. Status is `Confirmed` or `Pending` according to trusted channel policy and capacity.

- **DIVE-BOOK-REQ-066:** First-party hosted create accepts only its exact configured origin and MUST NOT use wildcard CORS. Origin checking constrains browser use and never replaces channel authorization. Widget origins and `frame-ancestors` remain governed by ADR-DIVE-005, `DIVE-BOOK-REQ-041`, and SPIKE-DIVE-003.

- **DIVE-BOOK-REQ-067:** Marketplace / OTA transport is outside the MVP. A future adapter requires a separately approved channel, authentication, idempotency/reconciliation, response/token transport, mapping, and operational contract; it may reuse the booking aggregate and invariants but MUST NOT infer authority from the hosted page or `channelPublicId` as a credential.

## Dependencies and verification

**Documented:** reuse the reservation capacity and transaction boundary in SPEC-DIVE-BOOKING-001. Public availability inclusion is owned by SPEC-DIVE-BOOKING-SCHEDULING-001; credential use by SPEC-DIVE-BOOKING-CAPABILITIES-001; embedding by SPEC-DIVE-BOOKING-WIDGET-001. ADR-DIVE-010 owns the architectural create decision. Test trusted scope, origin, immediate/Pending modes, lost-response replay, changed-payload conflict and no duplicate effects.

## Open questions

**Proposed, Draft:** retain lost-response recovery through purpose-separated HMAC with a secret key and persisted emission/key version, rather than claiming independently random tokens. Replay material is sensitive; neither booking ID nor a key alone replaces channel scope, request comparison, origin and abuse checks. Keep original expiry/result, never a replacement credential. Key/replay retention, unavailable-old-key handling and terminal replay require Security approval; no numeric retention default is selected. Current HMAC implementation is not that approval.
