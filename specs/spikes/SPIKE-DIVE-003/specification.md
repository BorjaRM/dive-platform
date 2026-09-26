# SPIKE-DIVE-003 — Widget integration and security

- **Status:** Draft
- **Type:** booking MVP spike
- **Hypothesis:** A server-configured iframe provides the lowest-risk MVP integration while preserving a stable domain contract for a future Web Component.

## Question

Does a responsive iframe with hosted-page fallback satisfy integration, isolation, security, accessibility, localization, and controlled customization across WordPress, Wix, Squarespace, and generic HTML?

## Provisional decision to validate

ADR-DIVE-002 adopts iframe provisionally. SPEC-DIVE-BOOKING-001 defines functional requirements. This spike supplies evidence to accept or change the decision before a pilot.

## Scope

Integration modality, origins, CSP/CORS, postMessage, fallback, accessibility, localization, and customization.

Excluded: last-seat concurrency (SPIKE-DIVE-001), mail/identity vendor selection, payments, full visual design beyond the prototype needed to validate the modality.

## Configuration derived from ADR and SPEC

- CMS targets: WordPress, Wix, Squarespace, generic HTML
- Exact origin allow-list per channel; production `frame-ancestors`; explicit wildcards only
- Staging has a separate test mode
- `postMessage` is minimal and versioned: height, load, navigate-to-fallback, booking-result
- Validate origin, channel, version, type, and schema; never transport secrets or full personal data
- Initial height 720 px, width 100%, single column; auto-height is progressive; internal vertical scroll remains usable
- Failure shows a neutral message, correlation ID, manual retry, and “Open booking page”
- Allowed customization: logo, validated colors, catalog font, localized copy, predefined corners. No center HTML/CSS/JS
- Default channel: `center_catalog`. `single_activity` allowed. Multi-center out of MVP
- First-party aggregated analytics without third-party cookies; never record email, phone, free text, or participant data

## Required scenarios

1. Complete a booking on mobile and desktop in each target CMS.
2. Parameter manipulation cannot replace tenant, center, activity, or permissions.
3. Unauthorized origins and malformed postMessage payloads are rejected.
4. Widget and hosted fallback meet WCAG 2.2 AA from 320 px.
5. Allowed customization cannot inject HTML/CSS/JS or break contrast.
6. Failure or embedding restrictions expose a safe hosted-page fallback.
7. Rate limits and anti-abuse controls avoid enumeration.
8. English and Spanish locale persist through booking and notifications.
9. Analytics avoid third-party cookies and unnecessary PII.

## Closure

The spike is accepted when iframe integration is reproducible on the four targets and the presentation remains separable from the booking engine.

A conclusion requires committed tests and reproducible evidence.
