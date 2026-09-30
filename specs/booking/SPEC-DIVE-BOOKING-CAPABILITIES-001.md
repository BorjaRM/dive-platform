# SPEC-DIVE-BOOKING-CAPABILITIES-001 - Public booking credentials and recovery

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
| `DIVE-BOOK-REQ-007` | `Derived` | `specs/foundation/multitenancy-architecture.md`; `specs/architecture/adrs/ADR-DIVE-001.md`; PR #1 | Approved by product owner |
| `DIVE-BOOK-REQ-023` | `Proposed` | Original PR #1 rule; replay reconciliation 2026-09-30 | Draft exception; Security approval pending |
| `DIVE-BOOK-REQ-070` | `Proposed` | Product, Security, and Architecture approval 2026-09-27; ADR-DIVE-005 v0.3 | Original approval retained |
| `DIVE-BOOK-REQ-071` | `Proposed` | Original 071; consumed-credential replay reconciliation 2026-09-30 | Draft exception; Security approval pending |
| `DIVE-BOOK-REQ-072` | `Proposed` | Product, Security, and Architecture approval 2026-09-27; ADR-DIVE-005 v0.3 | Original approval retained |

## Requirements

- **DIVE-BOOK-REQ-007:** Public bookers receive limited capabilities (create booking, read own confirmation, cancel via token). They never receive dashboard roles.

- **DIVE-BOOK-REQ-023:** **Proposed, Draft:** cancellation uses an opaque, single-purpose, expiring token. Success consumes mutation authority; it cannot authorize another action or be used after expiry. Only the narrowly bound result-recovery exception in DIVE-BOOK-REQ-071 may recover an already committed result.

- **DIVE-BOOK-REQ-070:** Public confirmation read uses `GET /v1/public/bookings/:bookingId/confirmation` with a `booking_confirmation_read` bearer token in `Authorization`. The route does not use Clerk or `X-Tenant-Context`; `bookingId` is a selector only. A valid token returns only the safe booking projection (`bookingId`, `status`, `seats`, `locale`, and non-sensitive slot presentation data), including terminal states. Invalid, expired, revoked, wrong-purpose, wrong-booking, and unknown credentials produce one indistinguishable non-disclosing `404` result.

- **DIVE-BOOK-REQ-071:** **Proposed, Draft:** `POST /v1/public/bookings/:bookingId/cancel` requires a `booking_cancel` bearer and `Idempotency-Key`. A fresh valid request cancels Pending or Confirmed and releases seats once with atomic audit/outbox; public callers cannot block seats. Exact replay recovers only the stored result for the same booking, original credential verifier, key and normalized request while original expiry is valid and the credential is not revoked. Consumption permits recovery, never another mutation; a different key cannot reuse a consumed token. A fresh credential on an incompatible terminal state returns `409 booking_not_cancellable`; other invalid credentials use the indistinguishable 404 from 070. Recovery cannot renew expiry or bypass resend revocation.

- **DIVE-BOOK-REQ-072:** Public token resend uses `POST /v1/public/bookings/:bookingId/tokens/resend` with the booker email, a requested token purpose, and an `Idempotency-Key`. The requested purpose MUST be `booking_confirmation_read` or `booking_cancel`. The confirmation-read token may be resent for any retained booking state; the cancellation token may be resent only for `Pending` or `Confirmed`. The endpoint always returns the same non-disclosing `202` response and sends no bearer value in HTTP. When the retained booking and normalized email match and the requested purpose is eligible, it queues a replacement token email, revokes the previous active token for that purpose, applies rate limits by IP, booking, and email, and records audit/outbox effects without exposing whether a match occurred.

## Public booking capability HTTP

Public capability routes use the booking-specific bearer tokens from the successful public-create response. They do not use Clerk, dashboard roles, or `X-Tenant-Context`. A booking identifier in a public path is a selector and never authorizes access.

| Method and path | Credential | Effect |
|---|---|---|
| `GET /v1/public/bookings/:bookingId/confirmation` | `booking_confirmation_read` | Read the safe current booking projection, including terminal status |
| `POST /v1/public/bookings/:bookingId/cancel` | `booking_cancel` + `Idempotency-Key` | Cancel a `Pending` or `Confirmed` booking once |
| `POST /v1/public/bookings/:bookingId/tokens/resend` | Booker's email + `Idempotency-Key` | Queue a purpose-specific replacement token email without disclosure |

Public credential failures are indistinguishable from unknown or mismatched booking selectors. Business-state failures after successful credential verification use `application/problem+json` with stable codes such as `booking_not_cancellable`. Resend never returns a token in the HTTP response.

## Defaults and verification

**Documented:** cancellation token TTL remains 72 hours (original PR #1 Proposed decision, approved for MVP validation). ADR-DIVE-005 owns representation and threat analysis. Test wrong purpose/booking, expiry, revocation, terminal-state reads, cancellation replay and resend non-disclosure. Seat effects use SPEC-DIVE-BOOKING-001.

## Open questions

Consumed-token exact replay, key/verifier retention and privacy rights workflows require closure; no new TTL or rate-limit value is selected.
