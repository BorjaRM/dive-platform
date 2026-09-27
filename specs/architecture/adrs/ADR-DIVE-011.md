# ADR-DIVE-011 — Public availability query and presentation boundary

- **Status:** Draft
- **Version:** 0.1
- **Date:** 2026-09-27
- **Deciders:** Product
- **Affected IDs:** `DIVE-BOOK-REQ-003`, `004`, `006`, `019`, `025`, `037..042`, `047`, `049`, `057`; `DIVE-IAM-REQ-024`; ADR-DIVE-005; ADR-DIVE-010

## Provenance

The existing constraints below are `Documented`. The public-query closures were confirmed by Borja in the US-09 product decisions on 2026-09-27 and remain `Proposed` while this ADR is Draft. They are not implementation authority and do not add or change `DIVE-BOOK-REQ-*` IDs in `SPEC-DIVE-BOOKING-001`.

| Decision | Provenance | Exact source | Approval / status |
|---|---|---|---|
| Remaining sellable seats are derived server-side from the slot capacity invariant and are not persisted | `Documented` | `DIVE-BOOK-REQ-003`, `019`, `021`, `025`, `029`, `049` | Existing normative constraint |
| Public tenant, center, activity, and slot scope comes from published server-side channel configuration | `Documented` | `DIVE-BOOK-REQ-004`; ADR-DIVE-005 | Existing normative constraint |
| Hosted page is the widget fallback and the iframe reuses the hosted page | `Documented` | `DIVE-BOOK-REQ-040` | Existing normative constraint |
| Locale is `es` or `en` and is preserved through the public booking flow | `Documented` | `DIVE-BOOK-REQ-042` | Existing normative constraint |
| Marketplace / OTA distribution is outside the MVP | `Documented` | `SPEC-DIVE-BOOKING-001` scope; ADR-DIVE-010 | Existing normative constraint |
| Use one canonical server-side availability result and apply B2C labels only in the hosted/widget presentation adapter | `Proposed` | Product confirmation by Borja on 2026-09-27 | Product-confirmed; Draft; not implementation-authorized |
| Hosted route is `/{locale}/book/{channelPublicId}`; an absent or unsupported locale returns the generic `404` before channel lookup | `Proposed` | Product confirmation by Borja on 2026-09-27 | Product-confirmed; Draft; not implementation-authorized |
| Public channel lifecycle is `draft`, `published`, `disabled`; unknown, draft, and disabled channels share one non-disclosing `404` | `Proposed` | Product confirmation by Borja on 2026-09-27 | Product-confirmed; Draft; not implementation-authorized |
| A published channel with no matching future slots renders a localized “no dates” state | `Proposed` | Product confirmation by Borja on 2026-09-27 | Product-confirmed; Draft; not implementation-authorized |
| List future slots with `starts_at > now` in UTC, ordered by `starts_at ASC`, then `id`; no fixed horizon | `Proposed` | Product confirmation by Borja on 2026-09-27 | Product-confirmed; Draft; not implementation-authorized |
| A `center_catalog` initially uses one chronological list including the activity name; grouping may change later | `Proposed` | Product confirmation by Borja on 2026-09-27 | Product-confirmed; Draft; not implementation-authorized |
| Include `Available` and `Full` slots; render `Full` as non-bookable “Full”; exclude `Closed` and `Cancelled` | `Proposed` | Product confirmation by Borja on 2026-09-27 | Product-confirmed; conflicts with the current `DIVE-BOOK-REQ-037..038` wording until the SPEC changes |
| Availability presentation is configured per channel: status is always shown, low-availability threshold defaults to 3, and exact remaining seats default to hidden | `Proposed` | Product confirmation by Borja on 2026-09-27 | Product-confirmed; Draft; not implementation-authorized |
| Public list page size is server-configurable with a hard maximum of 50; the cursor is opaque and internally follows `starts_at`, then `id` | `Proposed` | Product confirmation by Borja on 2026-09-27; aligned with `DIVE-BOOK-REQ-057` | Product-confirmed; Draft; not implementation-authorized |

## Context

US-09 needs a hosted public availability surface before widget evidence exists. The same underlying availability result must remain reusable by the iframe and must not encode B2C copy as the booking-domain contract.

`SPEC-DIVE-BOOKING-001` currently says that `center_catalog` and `single_activity` publish available slots. Product has chosen to keep full future slots visible as non-bookable. That choice is recorded here as a deliberate Proposed change; the current SPEC remains authoritative until separately amended and approved.

ADR-DIVE-010 owns public create-booking. This ADR stops at availability and presentation. It does not define create-booking payloads, token transport, confirmation policy, partner authentication, or OTA HTTP.

## Proposed decision

### Canonical availability result

The application layer derives a structured availability result on the server. It includes enough stable data for hosted and widget presentation to identify the slot and activity, present time in the center time zone, determine whether the slot is bookable, and obtain the non-negative remaining sellable-seat count.

The calculation follows the existing capacity invariant:

```text
remaining = capacity - confirmed_seats - held_seats - blocked_seats
```

The remaining value is derived, never persisted. B2C strings and display thresholds are presentation decisions and are not the canonical partner contract.

This ADR does not select a public JSON availability endpoint or freeze a partner DTO.

### Hosted route and locale

The stable hosted route is:

```text
/{locale}/book/{channelPublicId}
```

- `locale` is exactly `es` or `en`.
- Missing or unsupported locale returns the generic public `404` without resolving `channelPublicId`.
- A channel has a configured default locale for generating links and embed snippets. It is not a fallback for an invalid public route.
- The selected locale continues into public create-booking as governed by ADR-DIVE-010 and `DIVE-BOOK-REQ-042`.

### Channel lifecycle and public denial

The public-channel lifecycle is:

```text
draft → published → disabled
```

Re-publication after disable is not selected by this ADR.

Unknown, `draft`, and `disabled` channels return the same generic `404` representation. Status, problem type, title, stable code, and detail must not reveal which case occurred. Rate limits, validation, timing, and logs must preserve the non-enumeration constraints in `DIVE-BOOK-REQ-006`, `047`, ADR-DIVE-005, and ADR-DIVE-010.

A valid `published` channel with no matching slots is distinguishable from denial and renders a localized “no dates” state.

### Inclusion and ordering

The public query:

- includes only activities whose publication state allows public use;
- includes slots with `starts_at > now`, comparing instants in UTC;
- initially includes slot states `Available` and `Full`;
- renders `Full` as visible and non-bookable;
- excludes `Closed` and `Cancelled`;
- orders by `starts_at ASC`, then `id`;
- applies no fixed future horizon;
- uses cursor pagination.

`center_catalog` initially renders one chronological list and includes the localized activity name on each item. This is a presentation choice, not a new channel type; later grouping does not change channel authorization.

Showing `Full` is intentionally incompatible with the current wording of `DIVE-BOOK-REQ-037..038`. Implementations must continue to follow the SPEC until a later approved normative change reconciles those requirements.

### Availability presentation configuration

The channel owns the hosted/widget availability presentation configuration. Staff authorized by the existing `channel.manage` capability may configure it within their allowed center scope.

- Every visible slot shows `Available` or `Full`.
- A positive configurable threshold `N` controls the “last seats” label.
- The default threshold is `3`.
- When `1 <= remaining <= N`, the hosted/widget adapter adds the localized “last seats” label.
- Exact remaining seats are hidden by default.
- A channel may explicitly enable exact remaining-seat display.
- `remaining = 0` is `Full` and never produces a booking action.

These settings do not change the capacity invariant, slot state, authorization scope, or canonical result.

### Pagination

- The deployment or application configuration selects a public-list page size.
- The hard maximum is `50`.
- A client request cannot raise the effective limit above the configured value or the hard maximum.
- Continuation cursors are opaque to the client and encode the stable `starts_at`, then `id` position.
- Cursor byte encoding and signing are implementation details until a contract requires them.

### Widget and later adapters

The future iframe renders the same hosted route and consumes the same server-side availability result. CSP, `frame-ancestors`, exact origin enforcement, `postMessage`, CMS evidence, and embed fallback remain owned by SPIKE-DIVE-003 and ADR-DIVE-005.

A later partner / OTA adapter may reuse the capacity invariant and application result, but it requires a separate approved channel type, authentication, date-range contract, idempotency and reconciliation rules, allotment decision, response/token transport, and operational evidence. It must not scrape the hosted-page labels or treat `channelPublicId` as a credential.

## Compatibility assessment

| Area | Result |
|---|---|
| Capacity and derived remaining seats | Compatible with `DIVE-BOOK-REQ-003`, `019`, `025`, `029`, `049` |
| Hosted page reused by widget | Compatible with `DIVE-BOOK-REQ-040` |
| Locale continuity | Compatible with `DIVE-BOOK-REQ-042` and ADR-DIVE-010 |
| Non-disclosing channel denial | Compatible with `DIVE-BOOK-REQ-006`, `047`, ADR-DIVE-005, ADR-DIVE-010 |
| Maximum 50 and `starts_at`, `id` cursor order | Compatible with the established catalog-list limit and order in `DIVE-BOOK-REQ-057`; public use remains Proposed |
| Future OTA boundary | Compatible with the MVP exclusion and ADR-DIVE-010 |
| Showing `Full` | Not compatible with the current “available slots” wording in `DIVE-BOOK-REQ-037..038`; requires a later approved SPEC change |

## Consequences

- Hosted and widget presentation cannot diverge on remaining-seat calculation.
- Public copy and disclosure preferences remain outside the domain invariant.
- Invalid locale cannot be used to probe whether a channel exists.
- A published empty catalog is observable, while an unpublished channel is not.
- No implementation may treat this Draft ADR as authorization to expose `Full` slots or add runtime routes.

## Open questions

1. Public availability HTTP/JSON route and response DTO, if a non-HTML consumer is introduced.
2. Channel-management HTTP and persistence shape for lifecycle, default locale, threshold, and exact-count display.
3. Whether `disabled → published` is allowed and which audit evidence it requires.
4. Cursor byte encoding, integrity protection, and expiry, if any.
5. Cache policy for volatile remaining-seat data.
6. Exact browser-origin enforcement, pending SPIKE-DIVE-003.
7. OTA authentication, allotment, cutoff, webhooks, payments, locales, product mapping, and service levels, outside MVP.

## Implementation authority

This ADR is Draft. It records Product-confirmed Proposed decisions and one explicit conflict with the current SPEC. It does not authorize implementation, schema migration, runtime routes, or changes to `DIVE-BOOK-REQ-037..038`.
