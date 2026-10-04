# SPEC-DIVE-BOOKING-WIDGET-001 - Widget integration and hosted fallback

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
| `DIVE-BOOK-REQ-040..DIVE-BOOK-REQ-042` | `Derived` | `specs/architecture/adrs/ADR-DIVE-002.md`; `specs/spikes/SPIKE-DIVE-003/specification.md`; PR #1; product confirmation by the product owner on 2026-09-27 for public visibility of full slots | Approved by product owner, including `Available` + `Full` visibility on 2026-09-27 |

## Requirements

- **DIVE-BOOK-REQ-040:** The MVP widget is a responsive iframe of the hosted booking page. The hosted page is the required fallback.

- **DIVE-BOOK-REQ-041:** Each channel has an exact allow-list of origins. Production uses `frame-ancestors`. Wildcards and subdomains are allowed only when explicitly configured. Staging has a separate test mode.

- **DIVE-BOOK-REQ-042:** Locale `es` or `en` is preserved from the public surface through confirmation emails. Documents declare the language. Missing translation keys fail closed in CI once catalogs exist.

## Proposed widget scope and embedding contract

**Documented -- Sources and drafting authority:** product-owner chat request on 2026-09-30 to document the widget contract alongside other center-data surfaces. Existing authority remains in `DIVE-BOOK-REQ-040..042`, [public-operation requirements](SPEC-DIVE-BOOKING-PUBLIC-001.md) `DIVE-BOOK-REQ-004`, `039`, `058`, `059`, `066`, and [SPIKE-DIVE-003](../spikes/SPIKE-DIVE-003/specification.md). This does not approve a new mechanism or activate the widget.

**Proposed, Draft -- Public authorization:** use the [public-operation scope contract](SPEC-DIVE-BOOKING-PUBLIC-001.md#proposed-public-operation-scope-contract) for iframe and hosted fallback operations. The widget does not carry dashboard roles, a Clerk session requirement or an internal tenant/application-scope credential. Embedding changes presentation and browser integration, not the authority of a resource selector or the reservation/capability lifecycle.

**Proposed, Draft -- Browser boundary:** treat the embedding parent origin, iframe document origin and API request `Origin` as distinct inputs. Do not assume an iframe's API request identifies the embedding parent. Apply the channel's embedding policy through `frame-ancestors` and validate the permitted `postMessage` boundary independently of API admission. Neither a permitted parent, a CORS header nor a message supplied by the parent establishes tenant, center or resource authority. The exact linkage and fallback behavior need browser evidence rather than an assumed origin header.

**Derived, Draft -- Message and fallback verification:** from the [SPIKE-DIVE-003 configuration and scenarios](../spikes/SPIKE-DIVE-003/specification.md#required-scenarios), exercise wrong-parent origins, malformed or wrong-channel messages, allowed integration targets and hosted fallback without transporting credentials or full personal data. Combine these browser checks with the public owner's wrong-center/resource tests rather than treating CSP success as proof of server authorization. This records a verification relationship, not executed evidence.

**Proposed, Draft -- Remaining decisions and activation:** execute `SPIKE-DIVE-003` to select and validate embedding-parent/API-origin handling, nested embedding, message boundaries and fallback across supported integration targets. Do not infer a wildcard default, weaken the existing first-party hosted policy, infer `public_widget` from a client flag, or substitute `CLERK_AUTHORIZED_PARTIES` for channel policy. Runtime scope interfaces and any reuse remain subject to the public owner's contract; no new token, TTL, cookie or staging exception is selected here. Historical approvals and the activation gate below remain unchanged.

## Defaults and activation

**Documented:** retain the original initial height 720 px, width 100%, single-column layout; message types height, load, navigate-to-fallback and booking-result; no secrets/full personal data. Customization allows logo, validated colors, catalog font, localized copy and predefined corner radius, never center HTML/CSS/JS. These retain the original PR #1 approvals and SPIKE-DIVE-003 provenance.

SPIKE-DIVE-003 owns executed browser/origin/CSP/fallback/accessibility evidence before widget activation. It remains unexecuted. Reuse public-create and capability owners; iframe integration does not define another booking engine.
