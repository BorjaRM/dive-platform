# SPEC-DIVE-BOOKING-PUBLIC-001 - Published channels and public creation

- **Status:** Draft
- **Version:** 0.2
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

## Proposed public-operation scope contract

**Documented -- Drafting authority:** product-owner chat request on 2026-09-30 to document scope contracts for center-data surfaces, including the widget rather than dashboard only. This is drafting authority, not approval of the new design below. Existing channel and public-operation authority remains in `DIVE-BOOK-REQ-004`, `039`, `058`, `064`, `066..067`; booking-specific credentials retain their [capability owner](SPEC-DIVE-BOOKING-CAPABILITIES-001.md).

**Proposed, Draft:** public hosted-page and widget operations establish an operation scope through their own server-side resolver before querying or mutating center-owned resources. The conceptual result associates tenant, center, authorizing channel and permitted activity/resource scope with the requested public operation. It is not a browser-selected mode, a dashboard role, a new public bearer or an approved wire format.

| Boundary | Proposed, Draft contract |
|---|---|
| Channel operations | Resolve the channel selector through published server configuration and validate the applicable publication, resource and origin policy before admitting the operation. A public channel identifier remains a selector, not a secret or credential. |
| Resource ownership | Compare each selected or indirectly resolved activity, slot and booking resource with the resolved scope before effects. Constrain public lists and aggregates to that scope; a resource selector cannot substitute another center or channel. |
| Credential separation | Do not reuse Clerk authentication, dashboard roles or `X-Tenant-Context` to authorize public customers. Booking-capability operations use their own purpose/resource verifier and lifecycle, not a dashboard or channel-publication shortcut. |
| Failures | Failed resolution grants no scope or side effects. Wrong-center, cross-tenant and out-of-channel selections retain the non-disclosing behavior of the owning public operation; no new response code or lifecycle is selected here. |
| Lifecycle | Channel publication, center-entry mapping state, and already issued booking capabilities remain distinct. This proposal does not make center-entry disablement a public-channel shutdown or revoke booking capabilities when a channel is disabled. |
| Future clients | Other public or integration clients need their own approved admission and scope resolver. The present hosted-page or widget configuration does not authorize a marketplace/OTA transport or a multi-center channel. |

**Proposed, Draft -- Reuse boundary:** dashboard and public operations may reuse focused tenant/center/resource ownership checks where semantics match. Their admission and scope resolvers remain separate. The [dashboard proposal](../iam/SPEC-DIVE-IAM-DASHBOARD-001.md#proposed-application-scope-contract) does not become public authentication authority, and the [widget proposal](SPEC-DIVE-BOOKING-WIDGET-001.md#proposed-widget-scope-and-embedding-contract) does not define another booking engine. No shared module or new credential is selected solely by this documentation.

**Proposed, Draft -- Planned verification:** prove same-tenant A-to-B and cross-tenant denial for public reads, availability, lists/aggregates and booking creation, including manipulated channel/resource selectors and indirect resource ownership. Check disabled/unpublished channels and resolver failure without writes or disclosure. Exercise booking-specific capabilities under their separate lifecycle contract. These are planned checks, not new executed coverage.

**Proposed, Draft -- Remaining decisions:** inventory affected public routes and their existing owners; close the iframe/hosted origin boundary through `SPIKE-DIVE-003` before widget activation; select any new resolver/result interface only when implementation demonstrates suitable reuse. Existing token derivation, recovery and retention questions below remain independent security gates.

## Dependencies and verification

**Documented:** reuse the reservation capacity and transaction boundary in SPEC-DIVE-BOOKING-001. Public availability inclusion is owned by SPEC-DIVE-BOOKING-SCHEDULING-001; credential use by SPEC-DIVE-BOOKING-CAPABILITIES-001; embedding by SPEC-DIVE-BOOKING-WIDGET-001. ADR-DIVE-010 owns the architectural create decision. Test trusted scope, origin, immediate/Pending modes, lost-response replay, changed-payload conflict and no duplicate effects.

## Open questions

**Proposed, Draft:** retain lost-response recovery through purpose-separated HMAC with a secret key and persisted emission/key version, rather than claiming independently random tokens. Replay material is sensitive; neither booking ID nor a key alone replaces channel scope, request comparison, origin and abuse checks. Keep original expiry/result, never a replacement credential. Key/replay retention, unavailable-old-key handling and terminal replay require Security approval; no numeric retention default is selected. Current HMAC implementation is not that approval.
