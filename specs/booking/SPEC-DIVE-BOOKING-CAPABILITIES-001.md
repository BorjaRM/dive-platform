# SPEC-DIVE-BOOKING-CAPABILITIES-001 - Public booking credentials and recovery

- **Status:** Draft
- **Version:** 0.2
- **Last reviewed:** 2026-09-30
- **Owner:** Product / Booking
- **Approval reference:** Original requirements and approval records extracted from SPEC-DIVE-BOOKING-001 at commit `86e9d97`; documentation split requested 2026-09-30. Product-owner approval of policy-conditioned and pre-date-assignment cancellation direction on 2026-09-30 is recorded below. Security/replay gaps remain open; no artifact promotion or conformance is inferred.

## Normative authority

**Documented:** owns the requirements declared below. Original requirements from [SPEC-DIVE-BOOKING-001](SPEC-DIVE-BOOKING-001.md) retain their classifications, sources and approvals; the policy-conditioned cancellation revision and new requirement have separate provenance below. This file does not authorize unrelated contracts or infer conformance from implementation existence.

## Requirement provenance

| Requirement IDs | Provenance | Exact source | Decision status |
|---|---|---|---|
| `DIVE-BOOK-REQ-007` | `Derived` | `specs/foundation/multitenancy-architecture.md`; `specs/architecture/adrs/ADR-DIVE-001.md`; PR #1 | Approved by product owner |
| `DIVE-BOOK-REQ-023` | `Proposed` | Original PR #1 rule; replay reconciliation 2026-09-30 | Draft exception; Security approval pending |
| `DIVE-BOOK-REQ-070` | `Proposed` | Product, Security, and Architecture approval 2026-09-27; ADR-DIVE-005 v0.3 | Original approval retained |
| `DIVE-BOOK-REQ-071` | `Proposed` | Original 071; consumed-credential replay reconciliation 2026-09-30 | Draft exception; Security approval pending |
| `DIVE-BOOK-REQ-072` | `Proposed` | Product, Security, and Architecture approval 2026-09-27; ADR-DIVE-005 v0.3 | Original approval retained |
| `DIVE-BOOK-REQ-081` | `Proposed` | Product-owner request on 2026-09-30: "aplica los cambios propuestos sobre la documentacion", approving aligned policy text/behavior and cancellation without penalty before date assignment, with communicated/accepted conditions when assigning a date | Approved product direction and policy-eligibility revision of `DIVE-BOOK-REQ-071`; exact policy/time/error, unscheduled-state and acceptance contracts remain open; consumed-token replay still needs Security approval |

## Requirements

- **DIVE-BOOK-REQ-007:** Public bookers receive limited capabilities (create booking, read own confirmation, cancel via token). They never receive dashboard roles.

- **DIVE-BOOK-REQ-023:** **Proposed, Draft:** cancellation uses an opaque, single-purpose, expiring token. Success consumes mutation authority; it cannot authorize another action or be used after expiry. Only the narrowly bound result-recovery exception in DIVE-BOOK-REQ-071 may recover an already committed result.

- **DIVE-BOOK-REQ-070:** Public confirmation read uses `GET /v1/public/bookings/:bookingId/confirmation` with a `booking_confirmation_read` bearer token in `Authorization`. The route does not use Clerk or `X-Tenant-Context`; `bookingId` is a selector only. A valid token returns only the safe booking projection (`bookingId`, `status`, `seats`, `locale`, and non-sensitive slot presentation data), including terminal states. Invalid, expired, revoked, wrong-purpose, wrong-booking, and unknown credentials produce one indistinguishable non-disclosing `404` result.

- **DIVE-BOOK-REQ-071:** **Proposed, Draft transport/replay contract:** `POST /v1/public/bookings/:bookingId/cancel` requires a `booking_cancel` bearer and `Idempotency-Key`. A fresh valid request cancels Pending or Confirmed when the applicable accepted policy permits cancellation, and releases seats once with atomic audit/outbox; public callers cannot block seats. Policy eligibility follows `DIVE-BOOK-REQ-081`; its exact error/time contract remains open. Exact replay recovers only the stored result for the same booking, original credential verifier, key and normalized request while original expiry is valid and the credential is not revoked. Consumption permits recovery, never another mutation; a different key cannot reuse a consumed token. A fresh credential on an incompatible terminal state returns `409 booking_not_cancellable`; other invalid credentials use the indistinguishable 404 from 070. Recovery cannot renew expiry or bypass resend revocation.

- **DIVE-BOOK-REQ-072:** Public token resend uses `POST /v1/public/bookings/:bookingId/tokens/resend` with the booker email, a requested token purpose, and an `Idempotency-Key`. The requested purpose MUST be `booking_confirmation_read` or `booking_cancel`. The confirmation-read token may be resent for any retained booking state; the cancellation token may be resent only for `Pending` or `Confirmed`. The endpoint always returns the same non-disclosing `202` response and sends no bearer value in HTTP. When the retained booking and normalized email match and the requested purpose is eligible, it queues a replacement token email, revokes the previous active token for that purpose, applies rate limits by IP, booking, and email, and records audit/outbox effects without exposing whether a match occurred.

- **DIVE-BOOK-REQ-081:** Public cancellation eligibility follows the booking's applicable accepted policy, not the latest center or activity policy text. Before an initially undated booking has an assigned date, cancellation is permitted without penalty; an agreed date assignment must communicate and obtain acceptance of the applicable conditions while retaining earlier history. Start-relative cutoffs must not be fabricated when an exact start is unknown. Exact dated/day-only/undated states, acceptance and executable cutoff rules remain implementation gates; no payment or penalty collection is introduced.

## Public booking capability HTTP

Public capability routes use the booking-specific bearer tokens from the successful public-create response. They do not use Clerk, dashboard roles, or `X-Tenant-Context`. A booking identifier in a public path is a selector and never authorizes access.

| Method and path | Credential | Effect |
|---|---|---|
| `GET /v1/public/bookings/:bookingId/confirmation` | `booking_confirmation_read` | Read the safe current booking projection, including terminal status |
| `POST /v1/public/bookings/:bookingId/cancel` | `booking_cancel` + `Idempotency-Key` | Cancel an eligible `Pending` or `Confirmed` booking once, subject to accepted policy conditions |
| `POST /v1/public/bookings/:bookingId/tokens/resend` | Booker's email + `Idempotency-Key` | Queue a purpose-specific replacement token email without disclosure |

Public credential failures are indistinguishable from unknown or mismatched booking selectors. Business-state failures after successful credential verification use `application/problem+json` with stable codes such as `booking_not_cancellable`. Resend never returns a token in the HTTP response.

## Defaults and verification

**Documented:** cancellation token TTL remains 72 hours (original PR #1 Proposed decision, approved for MVP validation). ADR-DIVE-005 owns representation and threat analysis. Test wrong purpose/booking, expiry, revocation, terminal-state reads, cancellation replay and resend non-disclosure. Seat effects use SPEC-DIVE-BOOKING-001.

## Policy-conditioned cancellation

**Proposed, explicitly approved:** `DIVE-BOOK-REQ-081` owns the product direction. Policy authoring/version assignment belongs to [SPEC-DIVE-BOOKING-CATALOG-001](SPEC-DIVE-BOOKING-CATALOG-001.md), `DIVE-BOOK-REQ-077`; accepted terms/history belong to [SPEC-DIVE-BOOKING-001](SPEC-DIVE-BOOKING-001.md), `DIVE-BOOK-REQ-080`. Text and executable rules must agree; displaying arbitrary cancellation copy is not an enforcement contract.

The existing capability, non-disclosure, idempotency, atomic seat release and audit/outbox boundaries remain mandatory. Policy eligibility adds a business check, not a replacement credential. Credential expiry and a commercial cancellation cutoff are separate; free cancellation before date assignment does not renew an expired token or waive authorization. Current resend/state contracts must be reconciled before activating undated booking.

No cutoff hours, monetary penalty, automatic refund, new unscheduled booking state or date-assignment endpoint is selected. A selected day without an exact time does not justify inventing a midnight start. Agreed date/condition changes require the explicit acceptance flow owned by Booking; unilateral assignment is not customer consent.

Exact replay, when its Security contract is approved, recovers the committed cancellation result within the existing credential/replay bounds. A later policy edit or crossing a cutoff must not execute another mutation, reprice that result or reevaluate it against current catalog text.

Implementation gates: structured policy rules and immutable version identity; dated and day-only cutoff evaluation in the confirmed center time zone; cancellation eligibility errors after successful credential validation; legal meaning and communication of conditions; acceptance/assignment concurrency; undated booking state and token/resend compatibility; retention and migration of existing bookings. This section approves direction, not those absent contracts.

Expected checks, not executed proof: accepted policy differs from the latest edited policy; free cancellation before date assignment; explicit acceptance on date assignment; unknown start never produces an invented cutoff; policy text matches executable behavior; valid credential denied by policy versus indistinguishable invalid credentials; unchanged replay result; and single atomic cancellation competing with assignment or another state transition.

## Open questions

Consumed-token exact replay, key/verifier retention and privacy rights workflows require closure; no new TTL or rate-limit value is selected. Policy/time/error, accepted-condition, undated state and token/resend reconciliation gates remain in [Policy-conditioned cancellation](#policy-conditioned-cancellation).
