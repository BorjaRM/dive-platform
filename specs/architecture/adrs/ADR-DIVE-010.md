# ADR-DIVE-010 — Public create-booking (hosted page)

- **Status:** Draft
- **Version:** 0.2
- **Date:** 2026-09-27
- **Deciders:** Product
- **Affected IDs:** `DIVE-BOOK-REQ-004`, `007`, `012`, `013`, `016`, `021`, `025`, `028`, `037`, `038`, `040`, `042`, `044`, `045`; `DIVE-IAM-REQ-007..009`, `026`; ADR-DIVE-005

## Provenance

These closures were captured on 2026-09-27 from a product survey on US-10. They remain `Proposed` / `Draft`. They are not implementation authority. They do not add `DIVE-BOOK-REQ-*` IDs to `SPEC-DIVE-BOOKING-001` while that SPEC is Ready to start.

Marketplace / OTA distribution (GetYourGuide, Civitatis, and similar) remains out of MVP (`SPEC-DIVE-BOOKING-001` scope). This ADR must not be read as authorizing partner adapters.

| Decision | Provenance | Exact source | Approval / status |
|---|---|---|---|
| Public create is authorized by published server-side channel configuration; browser values are not authorization | `Documented` | `DIVE-BOOK-REQ-004`; `DIVE-IAM-REQ-008`; ADR-DIVE-005 | Existing normative constraint |
| Public bookers receive no dashboard roles; confirmation-read and cancel use opaque purpose-limited tokens | `Documented` | `DIVE-BOOK-REQ-007`, `023`; `DIVE-IAM-REQ-007`, `009`, `026`; ADR-DIVE-005 | Existing normative constraint |
| Idempotency keys are unique within tenant and channel; retry returns the persisted result without duplicate side effects | `Documented` | `DIVE-BOOK-REQ-028` | Existing normative constraint |
| Public create-booking requires an idempotency key | `Documented` | SPEC-DIVE-BOOKING-001 normative defaults | Existing normative constraint |
| `Pending` holds seats; `Confirmed` consumes seats; last-seat is confirm or hold; Pending hold TTL is 15 minutes | `Documented` | `DIVE-BOOK-REQ-021`, `025`; SPEC defaults | Existing normative constraint |
| Confirmation and cancellation emails go through `TransactionalEmailPort` and the transactional outbox; domain + audit + outbox commit atomically | `Documented` | `DIVE-BOOK-REQ-044`, `045`; ADR-DIVE-002 | Existing normative constraint |
| Widget is an iframe of the hosted page; hosted page is the required fallback | `Documented` | `DIVE-BOOK-REQ-040` | Existing normative constraint |
| Channel types `single_activity` and `center_catalog` are in MVP; multi-center public channels are not | `Documented` | `DIVE-BOOK-REQ-037..039` | Existing normative constraint |
| Persist `channel_id` (FK to the channel that authorized the create) plus a stable `booking_channel` type; uniqueness `(tenant_id, channel_id, idempotency_key)` | `Proposed` | Product confirmation by Borja on 2026-09-27 | Draft; not implementation-authorized |
| The HTTP caller generates the idempotency key; the API must not mint a new key per request; the booker does not supply it | `Proposed` | Product owner asked the agent to close this for hosted page, future widget, and possible later partner channels | Draft; not implementation-authorized |
| Public create commits booking + audit + outbox email + confirmation-read and cancel verifiers in one transaction; browser surfaces receive bearers once | `Proposed` | Same product direction; constrained by `DIVE-BOOK-REQ-044`, `045` and ADR-DIVE-005 | Draft; not implementation-authorized |
| A center can choose per public channel whether create requires staff approval | `Proposed` | Product confirmation by Borja on 2026-09-27 | Draft; new behavior not in SPEC-DIVE-BOOKING-001; not implementation-authorized |
| Default `confirmation_mode` is `immediate` (`Confirmed` when capacity exists) | `Proposed` | Product owner asked the agent to choose the default | Draft; not implementation-authorized |
| First implementation slice is hosted page + `single_activity` + last-seat PostgreSQL contention test in the same implementation PR; widget origins stay out; SPIKE-DIVE-001 remains not executed | `Proposed` | Product confirmation by Borja on 2026-09-27 | Sequencing only; not a requirement ID |
| HTTP failures use `application/problem+json`: malformed JSON `400`; field validation `422`; in-scope unavailable slot `409` with stable `slot_unavailable`; unknown/unpublished/mismatched/cross-tenant channel access uses the same non-disclosing `404` | `Proposed` | Product confirmation by Borja on 2026-09-27, applying the documented recommendation | Draft; product-confirmed; not implementation-authorized |
| Successful create returns `bookingId` in addition to status, seats, locale, and both bearer tokens; the ID is not authorization | `Proposed` | Product confirmation by Borja on 2026-09-27, applying the documented recommendation | Draft; product-confirmed; not implementation-authorized |
| A `Pending` booking created under `staff_approval` receives confirmation-read and cancel tokens before staff confirmation | `Proposed` | Product confirmation by Borja on 2026-09-27, applying the documented recommendation | Draft; product-confirmed; not implementation-authorized |

## Context

`SPEC-DIVE-BOOKING-001` is Ready to start for `DIVE-BOOK-REQ-001..048` and allows both `Pending` and `Confirmed` on public create. There is no payment step. SPIKE-DIVE-001 results on `main` are not executed and are not evidence.

US-10 needs closures for initial status, who generates the idempotency key, what the create transaction emits, how the channel is persisted, and the public HTTP shape. Those closures must not be copied into Notion as a second contract.

## Proposed decision

### Confirmation policy

A published public channel carries `confirmation_mode`:

- `immediate` — if the capacity invariant allows the request, the booking is `Confirmed`.
- `staff_approval` — if the capacity invariant allows the request, the booking is `Pending` and holds seats. The 15-minute Pending TTL applies. Staff confirmation, rejection, and expiry follow `DIVE-BOOK-REQ-024`.

The setting belongs on the **channel**, not on the tenant. Hosted page, widget, and a later partner channel may differ. Center staff with `channel.manage` choose the mode for that channel.

**Default:** `immediate`.

This policy is new relative to `SPEC-DIVE-BOOKING-001`. It must be added as numbered requirements only after this ADR is approved. Until then, do not implement `staff_approval` as if it were documented.

### Idempotency

- The **caller of the HTTP create** generates the key and reuses it on retry and double-submit.
- Hosted page: generate a UUID for the attempt, keep it in `sessionStorage` for that attempt, never show it to the booker.
- Widget: same hosted page in an iframe, so the same client key strategy.
- A future partner channel would use its own `channel_id` and its own keys. Optional `external_reference` (`DIVE-BOOK-REQ-016`) remains available for reconciliation and is not an authorization credential.
- The API rejects a missing key on public create. It must not generate a replacement key.
- Uniqueness is `(tenant_id, channel_id, idempotency_key)`.

### Create transaction and tokens

On a successful public create, one transaction commits:

1. the booking row;
2. the audit record;
3. the outbox record for booker email;
4. verifiers for `booking_confirmation_read` and `booking_cancel` (ADR-DIVE-005).

Browser surfaces (hosted page, and later the widget iframe) receive the bearer tokens **once** in the HTTP response and in the email. Bearers are never persisted. Logs and traces omit bearers and unnecessary PII.

A future partner channel would reuse the same aggregate and outbox. It would not assume an HTML confirmation page or the same token transport. Partner HTTP is out of MVP and is an open question.

A `Pending` (`staff_approval`) booking receives both tokens before staff confirmation. Confirmation-read exposes the current `Pending` state; cancel lets the booker release the hold. Staff confirmation remains a separate privileged transition under `DIVE-BOOK-REQ-024`. This is Product-confirmed Proposed behavior and remains non-authoritative while this ADR is Draft.

### Persistence (conceptual)

Physical table, column, and index names are not selected here.

A booking stores at least:

- `tenant_id`, `center_id` resolved from the channel, never from the client as authorization;
- `channel_id` (FK to the authorizing channel);
- stable `booking_channel` type — first slice value `public_hosted`; `public_widget` and `dashboard_manual` are later surfaces;
- `slot_id`, positive `seats`, `status`, booker first/last/email, optional phone, `locale` `es`\|`en`, `idempotency_key`, `created_at`.

Participants, payment fields, medical fields, and OTA payloads are out of this increment.

### Public HTTP contract (Proposed)

Not a dashboard route. No Clerk session. No `X-Tenant-Context`. No tenant identifier in the path, query, or body as authorization.

```http
POST /v1/public/channels/:channelPublicId/bookings
Idempotency-Key: <caller-generated-key>
Content-Type: application/json
```

`:channelPublicId` is the channel's immutable opaque public identifier (lookup key, not a credential). The server resolves tenant, center, publication state, allowed activity scope, origin policy, and `confirmation_mode`.

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

- `phone` may be omitted. `locale` must be `es` or `en`.
- The client MUST NOT send `tenantId`, `centerId`, `status`, `confirmationMode`, or another channel identifier in the body.
- `slotId` is a selector. It is accepted only if it is in the resolved channel's published scope.

Successful first create returns `201`. Retry with the same `Idempotency-Key` returns the persisted result without duplicating booking, seats, audit, email, or outbox. The retry response status is not selected by this ADR.

#### Error contract — Product-confirmed Proposed

Errors use `Content-Type: application/problem+json`. The stable public mapping is:

| Case | HTTP | Stable `code` | Rationale |
|---|---:|---|---|
| Malformed JSON / unreadable request syntax | `400` | `malformed_json` | The server cannot validate fields until syntax is readable |
| Invalid `locale`, email, `seats`, missing required field, or missing/invalid idempotency header | `422` | `validation_error` | The request is syntactically valid but violates the public contract |
| In-scope slot cannot accept the requested seats, including the losing last-seat request | `409` | `slot_unavailable` | Stable state conflict required by `DIVE-BOOK-REQ-025` |
| Unknown, disabled, or unpublished channel; slot outside the channel scope; tenant mismatch | `404` | `resource_not_found` | One identical response prevents channel, scope, and tenant enumeration (`DIVE-BOOK-REQ-006`, `DIVE-IAM-REQ-024`) |

The `404` cases MUST be indistinguishable in status, `type`, `title`, `code`, and detail. Public errors MUST NOT expose remaining capacity, tenant/center identifiers, foreign slot/booking identifiers, or internal authorization reasons. Field-level validation details may identify only fields supplied by the caller.

Minimum problem-details shape:

```json
{
  "type": "https://dive.example/problems/slot-unavailable",
  "title": "Slot unavailable",
  "status": 409,
  "code": "slot_unavailable",
  "requestId": "…"
}
```

The production problem `type` base URI remains a deployment/configuration concern; the semantic suffix and `code` above are stable.

#### Success body — Product-confirmed Proposed

The hosted page receives the booking identifier plus both bearers once:

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

`bookingId` is a selector and correlation identifier, not an authorization credential. No second public reference is added for MVP. `status` is `Confirmed` or `Pending` according to `confirmation_mode` and capacity. Both statuses receive both tokens. Tokens follow ADR-DIVE-005 (confirmation-read reusable until expiry/revocation; cancel single-use; 72-hour TTL).

### First implementation slice (Proposed sequencing)

After this ADR is approved:

1. Hosted public page only.
2. Channel type `single_activity`.
3. Last-seat contention test against real PostgreSQL with a barrier in the **same** implementation PR as create-booking. Do not mark SPIKE-DIVE-001 Done. Do not mock persistence or RLS.
4. Widget, `frame-ancestors`, and wildcard origins stay with ADR-DIVE-005 / SPIKE-DIVE-003.
5. Do not implement OTA adapters.

## Consequences

- Notion US-10 remains a story index. This ADR is the Draft home for the closures.
- `SPEC-DIVE-BOOKING-001` stays Ready to start for `DIVE-BOOK-REQ-001..048` until a later approved SPEC PR allocates new IDs.
- Callers, not the server, own idempotency identity, so widget and a later partner channel can share the uniqueness rule without sharing keys.
- Default `immediate` avoids expiring real public bookings when no payment or review step exists.
- `staff_approval` reuses the existing Pending hold instead of inventing a fifth booking status.

## Alternatives considered

### Always `Pending` on public create

Rejected as the default. There is no payment capture. A 15-minute hold would expire customer bookings with no next step.

### Always `Confirmed`, no channel policy

Rejected by product: the center must be able to require approval. That policy is Proposed here and still needs SPEC IDs after approval.

### Server-generated idempotency key per request

Rejected. A retry or double-submit would create a second booking.

### Booker-supplied idempotency key

Rejected. Not usable on a public form.

### Create persists the booking only; tokens and email in a later story

Rejected for browser public create. Public users have no account; IAM requires token capabilities for confirmation-read and cancel.

### Persist only `booking_channel` text, no `channel_id`

Rejected by product. Server-side channel authorization needs a FK to the channel that authorized the create.

## Pending confirmation — recommendations 4–8

The following items are **Proposed and pending explicit confirmation**. They are not implementation authority and remain deliberately outside the Product-confirmed decisions above.

4. **Channel-admin HTTP for `confirmation_mode`.** Recommendation: configure it in the channel-management contract (not US-10 public create), through the channel update operation protected by `channel.manage`; channel creation uses `immediate` when omitted. Justification: policy belongs to the authorizing channel and the public caller must never select it. The exact admin route and payload remain pending confirmation.
5. **`public_widget` versus `public_hosted`.** Recommendation: the first slice records `public_hosted`; do not trust a client-supplied surface. Introduce `public_widget` only after SPIKE-DIVE-003 defines origin/embed evidence that the server can resolve. Justification: both surfaces execute the same hosted page, so a body flag is forgeable and adds no authorization evidence. Pending confirmation.
6. **Partner / OTA transport.** Recommendation: define no OTA HTTP adapter in MVP. A future adapter should use a distinct `channel_id`, caller-owned idempotency keys, the same booking aggregate/capacity/audit/outbox invariants, and a separately approved response/token transport. Justification: GetYourGuide/Civitatis are out of MVP and premature transport choices would create an unsupported contract. Pending confirmation.
7. **CORS / origin enforcement.** Recommendation: first-party hosted create allows only the exact configured hosted-page origin; no wildcard. Widget origins and `frame-ancestors` remain blocked on SPIKE-DIVE-003. Justification: an exact allow-list preserves ADR-DIVE-005's non-wildcard posture without pretending that CORS is authorization. The exact configuration and failure behavior remain pending confirmation.
8. **Requirement IDs.** Recommendation: allocate the next contiguous `DIVE-BOOK-REQ-*` IDs from merged `main` only after this ADR is approved and after the in-flight catalog HTTP work settles; do not reserve IDs on this Draft branch. Justification: this avoids collisions (tentatively `058+` if #24 owns the preceding range) and keeps TRACE tied to merged normative sources. Pending confirmation.

## Implementation authority

This ADR is Draft. It documents Proposed closures. It does not authorize implementation, schema migration, or runtime routes until Borja explicitly promotes it or it is merged as an accepted source according to the repository lifecycle. Do not invent values for the open questions.
