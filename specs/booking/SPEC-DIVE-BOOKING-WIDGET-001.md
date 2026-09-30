# SPEC-DIVE-BOOKING-WIDGET-001 - Widget integration and hosted fallback

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
| `DIVE-BOOK-REQ-040..DIVE-BOOK-REQ-042` | `Derived` | `specs/architecture/adrs/ADR-DIVE-002.md`; `specs/spikes/SPIKE-DIVE-003/specification.md`; PR #1; product confirmation by the product owner on 2026-09-27 for public visibility of full slots | Approved by product owner, including `Available` + `Full` visibility on 2026-09-27 |

## Requirements

- **DIVE-BOOK-REQ-040:** The MVP widget is a responsive iframe of the hosted booking page. The hosted page is the required fallback.

- **DIVE-BOOK-REQ-041:** Each channel has an exact allow-list of origins. Production uses `frame-ancestors`. Wildcards and subdomains are allowed only when explicitly configured. Staging has a separate test mode.

- **DIVE-BOOK-REQ-042:** Locale `es` or `en` is preserved from the public surface through confirmation emails. Documents declare the language. Missing translation keys fail closed in CI once catalogs exist.

## Defaults and activation

**Documented:** retain the original initial height 720 px, width 100%, single-column layout; message types height, load, navigate-to-fallback and booking-result; no secrets/full personal data. Customization allows logo, validated colors, catalog font, localized copy and predefined corner radius, never center HTML/CSS/JS. These retain the original PR #1 approvals and SPIKE-DIVE-003 provenance.

SPIKE-DIVE-003 owns executed browser/origin/CSP/fallback/accessibility evidence before widget activation. It remains unexecuted. Reuse public-create and capability owners; iframe integration does not define another booking engine.
