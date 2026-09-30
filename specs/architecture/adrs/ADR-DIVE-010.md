# ADR-DIVE-010 — Public create-booking (hosted page)

- **Status:** Draft
- **Version:** 0.4
- **Date:** 2026-09-27
- **Decision date:** 2026-09-27
- **Deciders:** Product
- **Affected IDs:** `DIVE-BOOK-REQ-004`, `007`, `012`, `013`, `016`, `021`, `025`, `028`, `037`, `038`, `040`, `042`, `044`, `045`, `058..067`; `DIVE-IAM-REQ-007..009`, `026`; ADR-DIVE-005

## Provenance

The public-create closures were introduced as `Proposed` on 2026-09-27. Product owner explicitly accepted the remaining recommendations and the idempotent-retry contract on 2026-09-27, establishing the historical v0.3 approval for `DIVE-BOOK-REQ-058..067`. The v0.4 original-emission replay reconciliation remains Proposed and Draft; this revision does not promote it to Ready to start. Unchanged historical approvals are preserved.

| Decision | Provenance | Exact source | Approval / status |
|---|---|---|---|
| Public create is authorized by published server-side channel configuration; browser values are not authorization | `Documented` | `DIVE-BOOK-REQ-004`; `DIVE-IAM-REQ-008`; ADR-DIVE-005 | Existing normative constraint |
| Public bookers receive no dashboard roles; confirmation-read and cancel use opaque purpose-limited tokens | `Documented` | `DIVE-BOOK-REQ-007`, `023`; `DIVE-IAM-REQ-007`, `009`, `026`; ADR-DIVE-005 | Existing normative constraint |
| Idempotency keys are unique within tenant and channel; retry returns the persisted result without duplicate side effects | `Documented` | `DIVE-BOOK-REQ-028` | Existing normative constraint |
| `Pending` holds seats; `Confirmed` consumes seats; Pending hold TTL is 15 minutes | `Proposed` | `DIVE-BOOK-REQ-021`, `025`, `060`; `SPEC-DIVE-BOOKING-001` normative defaults | Approved; `DIVE-BOOK-REQ-060`; Ready to start |
| Confirmation/cancellation email uses `TransactionalEmailPort` and the outbox; domain + audit + outbox commit atomically | `Documented` | `DIVE-BOOK-REQ-044`, `045`; ADR-DIVE-002 | Existing normative constraint |
| Public create persists the authorizing channel, caller idempotency identity, atomic side effects, and capability verifiers | `Proposed` | Product decisions accepted by the product owner on 2026-09-27 | Approved; `DIVE-BOOK-REQ-059`, `062`, `063`; Ready to start |
| Per-channel `confirmation_mode`, default `immediate`, and staff administration contract | `Proposed` | Product decisions and accepted recommendation on 2026-09-27 | Approved; `DIVE-BOOK-REQ-060`, `061`; Ready to start |
| Public HTTP path, response, errors, and idempotent replay behavior | `Proposed` | Product decisions and accepted recommendation on 2026-09-27 | Approved; `DIVE-BOOK-REQ-058`, `062`, `064`, `065`; Ready to start |
| First slice records `public_hosted`; `public_widget` is server-derived only after SPIKE-DIVE-003 | `Proposed` | Accepted recommendation on 2026-09-27 | Approved; `DIVE-BOOK-REQ-059`; Ready to start |
| Exact hosted-create origin; no wildcard CORS; widget origins remain SPIKE-DIVE-003 scope | `Proposed` | Accepted recommendation on 2026-09-27 | Approved; `DIVE-BOOK-REQ-066`; Ready to start |
| OTA transport remains outside MVP and requires a separate approved adapter contract | `Proposed` | Accepted recommendation on 2026-09-27; SPEC MVP exclusion | Approved scope boundary; `DIVE-BOOK-REQ-067` |

## Context

**Documented:** the introduction records original v0.3 approval, not approval of v0.4's Security reconciliation. Unchanged clauses retain their original approval; the new token rules remain Proposed/Draft.

US-10 needs an implementation-authorized public create contract without treating browser input as tenant authorization. The first slice is a hosted public page for a `single_activity` channel. Marketplace / OTA distribution remains outside the MVP. SPIKE-DIVE-001 remains not executed and is not evidence.

SPEC-DIVE-BOOKING-PUBLIC-001 owns the public-create requirements/HTTP contract; this ADR owns rationale and architecture. Original v0.3 approvals remain recorded, but v0.4 is Draft for Security review of token replay with ADR-DIVE-005. ADR-DIVE-011 owns proposed public availability/presentation. Dashboard traffic does not use these public credentials.

## Decision

### Channel and confirmation policy

A published public channel carries `confirmation_mode`:

- `immediate` — when capacity allows, create a `Confirmed` booking;
- `staff_approval` — when capacity allows, create a `Pending` booking that holds seats for the approved 15-minute TTL.

The setting belongs to the channel. The public caller cannot select or override it. A newly created channel uses `immediate` when the field is omitted.

Authorized center staff manage the value through:

```http
PATCH /v1/centers/:centerId/channels/:channelId
Authorization: Bearer <clerk-session-token>
X-Tenant-Context: ctx_…
Content-Type: application/json

{ "confirmationMode": "immediate" | "staff_approval" }
```

The operation requires `channel.manage`, current center scope, and audit. `centerId` and `channelId` are selectors, never authorization. The route does not make public create a dashboard operation.

### Public create HTTP contract

```http
POST /v1/public/channels/:channelPublicId/bookings
Idempotency-Key: <caller-generated-key>
Content-Type: application/json
```

No Clerk session or `X-Tenant-Context` is used. The client must not send `tenantId`, `centerId`, `status`, `confirmationMode`, or another channel selector in the body.

`:channelPublicId` is an immutable opaque lookup key, not a credential. The server resolves tenant, center, channel type, publication state, allowed activity/slot scope, origin policy, and confirmation mode from trusted channel configuration.

Body:

```json
{
  "slotId": "<uuid>",
  "seats": 1,
  "locale": "es",
  "booker": {
    "firstName": "…",
    "lastName": "…",
    "email": "…",
    "phone": "…"
  }
}
```

`phone` is optional. `locale` is `es` or `en`. `slotId` is accepted only inside the resolved published channel scope.

### Persistence and surface attribution

A booking stores the authorizing `channel_id` plus a stable `booking_channel` value. Uniqueness is `(tenant_id, channel_id, idempotency_key)`.

The first slice records `public_hosted`. The client cannot claim a surface in the request body. `public_widget` may be introduced only after SPIKE-DIVE-003 defines server-verifiable embed/origin evidence; it is then derived by the server. `dashboard_manual` belongs to the authenticated dashboard contract, not this endpoint.

### Idempotency and retry

The HTTP caller generates the idempotency key and reuses it for retries and double-submits. The hosted page keeps one attempt key in `sessionStorage` and never shows it to the booker. The server does not mint a replacement key.

- missing or malformed key: `422 validation_error`;
- first successful create: `201`;
- same key and semantically same request: `200` with the persisted result and no duplicated booking, seats, audit, tokens, email, or outbox;
- same key with a semantically different request: `409 idempotency_conflict`.

Comparison excludes transport-only metadata but includes every field that can change the booking result. Physical request-hash representation is an implementation detail.

### Atomic create and capability tokens

One successful transaction commits:

1. booking;
2. audit record;
3. outbox record for booker email;
4. versioned verifiers for `booking_confirmation_read` and `booking_cancel`.

**Proposed, Draft:** first response and exact replay return the original credential emissions under DIVE-BOOK-REQ-063 without new emission, expiry renewal or reactivation. Bearers are never persisted/logged; Pending receives both purposes before staff confirmation. Derivation, original-key retention and recovery controls require Security approval under ADR-DIVE-005; current HMAC implementation is not that approval.

### Success and error contract

First create returns `201`; idempotent replay returns `200`. Both return:

```json
{
  "bookingId": "<uuid>",
  "status": "Confirmed",
  "seats": 1,
  "locale": "es",
  "confirmationReadToken": "…",
  "cancelToken": "…"
}
```

`status` is `Confirmed` or `Pending` according to trusted channel policy and capacity. `bookingId` is a selector/correlation identifier, not authorization.

Errors use `application/problem+json`:

| Case | HTTP | Stable `code` |
|---|---:|---|
| Malformed JSON | `400` | `malformed_json` |
| Field or idempotency-header validation | `422` | `validation_error` |
| In-scope slot cannot accept seats | `409` | `slot_unavailable` |
| Same idempotency key with different request | `409` | `idempotency_conflict` |
| Unknown, disabled, unpublished, mismatched, or cross-tenant channel/scope | `404` | `resource_not_found` |

All `404` cases are indistinguishable and expose no tenant, center, capacity, foreign resource, or internal authorization detail.

### Browser origin boundary

First-party hosted create accepts only the exact configured hosted-page origin. Wildcard CORS origins are not allowed for this endpoint. CORS/origin checking constrains browser use; it never replaces published-channel authorization.

Widget embed origins and `frame-ancestors` remain governed by ADR-DIVE-005, `DIVE-BOOK-REQ-041`, and SPIKE-DIVE-003. The widget cannot be classified or authorized from a client body flag.

### First implementation slice

1. Hosted public page.
2. Channel type `single_activity`.
3. `booking_channel = public_hosted`.
4. Real PostgreSQL last-seat contention test in the same implementation PR.
5. No widget classification until SPIKE-DIVE-003 evidence.
6. No OTA adapter.

## Consequences

- Channel policy is explicit and cannot be selected by a public caller.
- Retry semantics distinguish creation, replay, and conflicting key reuse.
- Hosted/widget attribution is trustworthy at the cost of deferring widget attribution until evidence exists.
- Exact origin configuration adds operations work but avoids wildcard browser access.
- A later OTA adapter can reuse domain invariants but requires separate authentication, transport, token, reconciliation, and operational decisions.

## Alternatives considered

- Always `Pending`: rejected because the default flow has no payment/review step and the 15-minute hold would expire without a customer action.
- Always `Confirmed`: rejected because centers may require approval per channel.
- Server-generated idempotency key per request: rejected because retries would not share identity.
- Booker-supplied visible key: rejected because it is transport state, not user input.
- Client-supplied hosted/widget surface: rejected because it is forgeable.
- Wildcard CORS for create: rejected because browser origin is explicitly configured and CORS is not authorization.
- OTA in MVP: rejected by product scope.

## Remaining open questions

These do not reopen the approved contract:

1. Physical table, column, index, and request-hash representation.
2. Production base URI for problem `type` values.
3. Retention/deletion of expired capability-verifier metadata, owned by the privacy/retention decision.
4. Widget embed evidence and server-derived `public_widget` attribution, owned by SPIKE-DIVE-003.
5. Future OTA authentication, allotment, cutoff, webhook, payment, locale, mapping, and service-level contract.

## Implementation authority

Ready to start authorizes reversible implementation with synthetic data for `DIVE-BOOK-REQ-058..067`. It does not authorize a real-data pilot, widget attribution without SPIKE-DIVE-003 evidence, or any OTA adapter.
