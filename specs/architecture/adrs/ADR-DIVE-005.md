# ADR-DIVE-005 - Public channels and opaque capability tokens

- **Status:** Ready to start
- **Version:** 0.3
- **Date:** 2026-09-26
- **Decision date:** 2026-09-26
- **Revision approval date:** 2026-09-27
- **Deciders:** Product / Security / Architecture
- **Affected IDs:** `DIVE-IAM-REQ-007..009`, `024`, `026`, `028`; `DIVE-BOOK-REQ-004`, `007`, `017`, `023`, `037..041`, `068..072`

## Provenance

The decisions were introduced as `Proposed` unless identified as `Documented` below. Sources are `SPEC-DIVE-IAM-001`, `SPEC-DIVE-BOOKING-001`, ADR-DIVE-001, ADR-DIVE-002, and the security/privacy baseline. Product, Security, and Architecture explicitly approved the v0.1 proposals on 2026-09-26 and the v0.2 public capability additions on 2026-09-27; this ADR is now normative implementation authority. Its remaining open questions stay outside the approved decision.

`Documented`: the public cancellation-token TTL is 72 hours in `SPEC-DIVE-BOOKING-001` and is not changed here.

Version 0.2 added the public capability HTTP contract and resend recovery proposal from the product confirmation on 2026-09-27. Product, Security, and Architecture approved those additions on 2026-09-27; version 0.3 records that approval and this ADR is `Ready to start`.

## Context

Public users must never receive dashboard roles. Browser-supplied tenant and resource identifiers are not authorization context. Public confirmation-read and cancellation require opaque, purpose-limited credentials, while public booking creation depends on published server-side channel configuration.

## Proposed decision

### Channel authorization

- A channel has an immutable opaque public identifier that is a lookup key, not a credential.
- The server-side channel record resolves tenant, center, channel type, allowed activity scope, publication state, and configured origin policy.
- Browser values may select a resource only after validation against the resolved channel. They never establish tenant, center, role, or permission.
- A disabled or unpublished channel denies new availability and booking operations with a non-disclosing response.
- Disabling a channel does not revoke already issued booking-specific confirmation or cancellation tokens; those credentials follow their own resource state and expiry.
- Public authorization returns capabilities only and never creates or exposes an internal membership or role.

### Token representation

- Generate at least 256 bits of cryptographically secure random material and expose the token once using a transport-safe encoding.
- Persist a versioned keyed verifier, purpose, booking reference, issued-at, expires-at, consumed-at, revoked-at, and correlation metadata. Never persist the bearer value.
- Use distinct token purposes for `booking_confirmation_read` and `booking_cancel`.
- Tokens contain no tenant ID, internal role, permission list, other booking ID, or customer payload.
- Confirmation-read tokens may be reused until expiry or revocation.
- Cancellation tokens become consumed after the first successful cancellation and cannot authorize another action.
- Reissuing a token revokes the previous active token for the same booking and purpose.

### Expiry

- Cancellation tokens use the already approved 72-hour TTL from `SPEC-DIVE-BOOKING-001`.
- Confirmation-read tokens also use a 72-hour TTL for the MVP, with resend issuing a replacement token.
- Expiry is evaluated server-side from persisted metadata using the server clock.

### Public capability HTTP contract

- Confirmation read uses `GET /v1/public/bookings/:bookingId/confirmation` with the `booking_confirmation_read` bearer token in `Authorization`.
- Cancellation uses `POST /v1/public/bookings/:bookingId/cancel` with the `booking_cancel` bearer token and an `Idempotency-Key`.
- Resend uses `POST /v1/public/bookings/:bookingId/tokens/resend` with the booker email, a requested token purpose, and an `Idempotency-Key`.
- These routes do not use Clerk or `X-Tenant-Context`. The booking identifier is a selector, never authorization.
- Unknown, mismatched, expired, revoked, consumed, tampered, and wrong-purpose credentials have one indistinguishable non-disclosing response. A verified credential applied to a non-cancellable terminal state returns a stable business-state error instead.
- A resend response never contains a bearer value. Matching requests queue an email, revoke the previous active token for the requested purpose, and are subject to IP, booking, and email rate limits. Non-matching requests have the same response and do not disclose whether a booking or email matched.
- Resend accepts only `booking_confirmation_read` or `booking_cancel`. Confirmation-read may be resent for any retained booking; cancellation may be resent only for `Pending` or `Confirmed` bookings.

## Consequences

- Token verification and channel lookup can be implemented behind application ports without exposing storage or cryptographic details to domain code.
- Key rotation is supported by verifier versioning.
- Channel shutdown stops new public acquisition without blocking an existing customer from using an independently issued booking capability.
- A separate retention policy is still needed for expired verifier metadata.

## Alternatives considered

- Signed self-contained public tokens: rejected because they disclose structure and make immediate revocation and single-use enforcement harder.
- Use the public channel identifier as a secret: rejected because channel identifiers appear in public URLs and embeds.
- Revoke all booking tokens when a channel is disabled: rejected because channel publication and an existing booking's customer capabilities have different lifecycles.
- One token for read and cancellation: rejected because it violates single-purpose authorization.
- Public resend without a non-disclosing response, rate limiting, replacement-token revocation, and email delivery boundary: rejected because it creates an enumeration and abuse surface.

## Open questions

- Exact browser-origin enforcement remains open until `SPIKE-DIVE-003` resolves the iframe and hosted-page boundary. No wildcard default is authorized.
- Retention and deletion of expired verifier metadata remain open pending the product retention policy.

## Acceptance criteria / evidence

- Published channel tests derive tenant, center, and resource scope entirely server-side.
- Disabled, unpublished, mismatched-resource, wrong-origin, and cross-tenant requests fail without disclosure.
- Wrong-purpose, expired, revoked, consumed, tampered, replayed, and other-booking tokens fail.
- Token persistence and logs contain no bearer token or unnecessary personal data.
- Public responses expose no dashboard role or internal authorization data.
- Public capability contract tests cover non-disclosing read/cancel failures, cancellation idempotency, resend response equivalence, rate limiting, and replacement-token revocation.