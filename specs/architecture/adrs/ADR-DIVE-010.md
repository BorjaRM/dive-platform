# ADR-DIVE-010 — Public create-booking (hosted page)

- **Status:** Draft
- **Version:** 0.1
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

Whether a `Pending` (`staff_approval`) booking receives both tokens before staff confirmation is an open question.

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

Successful first create returns `201`. Field names above are part of this Proposed contract. Exact error status codes, problem-details body, and whether the success body includes a booking UUID versus only tokens remain open questions except:

- retry with the same `Idempotency-Key` returns the persisted result without duplicating booking, seats, audit, email, or outbox;
- in-scope last-seat failure is a stable unavailability result (`DIVE-BOOK-REQ-025`);
- unknown, disabled, unpublished, mismatched-slot, or cross-tenant channel access is non-disclosing (`DIVE-BOOK-REQ-006`, `DIVE-IAM-REQ-024`).

Proposed success body for the hosted page (bearers once):

```json
{
  "status": "Confirmed",
  "seats": 1,
  "locale": "es",
  "confirmationReadToken": "…",
  "cancelToken": "…"
}
```

`status` is `Confirmed` or `Pending` according to `confirmation_mode` and capacity. Tokens follow ADR-DIVE-005 (confirmation-read reusable until expiry/revocation; cancel single-use; 72-hour TTL).

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

## Open questions

1. Exact HTTP status and problem-details body for validation failure, in-scope unavailability, and non-disclosing channel denial.
2. Whether the success body includes a booking UUID / public ref in addition to the one-time tokens.
3. Whether `staff_approval` (`Pending`) bookings receive confirmation-read and cancel tokens before staff confirmation.
4. Admin/HTTP contract to set `confirmation_mode` on a channel.
5. How to distinguish `public_widget` from `public_hosted` when both use the same hosted page (SPIKE-DIVE-003 / origin).
6. Partner/OTA request and token transport. Out of MVP.
7. Public CORS / origin enforcement for this POST beyond first-party hosted page. ADR-DIVE-005 leaves exact browser-origin enforcement open until SPIKE-DIVE-003. No wildcard default.
8. Requirement IDs to allocate in `SPEC-DIVE-BOOKING-001` after this ADR is approved (and after any in-flight catalog HTTP IDs on other branches).

## Implementation authority

This ADR is Draft. It documents Proposed closures. It does not authorize implementation, schema migration, or runtime routes until Borja explicitly promotes it or it is merged as an accepted source according to the repository lifecycle. Do not invent values for the open questions.
