# SPIKE-DIVE-003 — Widget integration and security

- **Status:** Draft
- **Hypothesis:** A server-configured iframe provides the lowest-risk MVP integration while preserving a stable domain contract for a future Web Component.

## Question

Does a responsive iframe with hosted-page fallback satisfy integration, isolation, security, accessibility, localization, and controlled customization needs across priority CMS platforms?

## Scope

Integration modality, origins, CSP/CORS, postMessage, fallback, accessibility, localization, and customization. Booking concurrency is excluded.

## Method

Implement the smallest representative slice, execute deterministic positive and negative scenarios against real infrastructure where applicable, record commands and environment, and store reproducible evidence without real personal data.

## Required scenarios

1. Complete a booking on mobile and desktop in WordPress, Wix, Squarespace, and generic HTML.
2. Parameter manipulation cannot replace tenant, center, activity, or permissions.
3. Unauthorized origins and malformed postMessage payloads are rejected.
4. Widget and hosted fallback meet the approved WCAG 2.2 AA target from 320 px.
5. Allowed customization cannot inject HTML, CSS, or JavaScript or break contrast.
6. Failure or embedding restrictions expose a safe hosted-page fallback.
7. Rate limits and anti-abuse controls avoid enumeration.
8. English and Spanish locale persist through booking and notifications.
9. Analytics avoid third-party cookies and unnecessary PII.

## Dependencies

- specs/architecture/adrs/ADR-DIVE-002.md
- specs/booking/SPEC-DIVE-BOOKING-001.md
- specs/iam/SPEC-DIVE-IAM-001.md

## Closure outcomes

`Accepted`, `Accepted with conditions`, `Requires modification`, or `Rejected`. A conclusion requires committed tests and reproducible evidence; this document alone is not evidence.
