# SPIKE-DIVE-003 — Requirements

- **Status:** Draft

- **SPIKE-DIVE-003-REQ-001:** iframe + hosted fallback is usable on WordPress, Wix, Squarespace, and generic HTML (`DIVE-BOOK-REQ-040`).
- **SPIKE-DIVE-003-REQ-002:** Tenant/center/activity cannot be substituted from the browser (`DIVE-BOOK-REQ-004`).
- **SPIKE-DIVE-003-REQ-003:** Origin, CSP, CORS, and postMessage reject unauthorized senders (`DIVE-BOOK-REQ-041`).
- **SPIKE-DIVE-003-REQ-004:** WCAG 2.2 AA target holds from 320 px for widget and hosted page.
- **SPIKE-DIVE-003-REQ-005:** Customization cannot inject arbitrary HTML, CSS, or JavaScript.
- **SPIKE-DIVE-003-REQ-006:** Fallback to the hosted page remains available on embed failure.
- **SPIKE-DIVE-003-REQ-007:** Anti-abuse controls do not enumerate tenants, slots, or personal data (`DIVE-BOOK-REQ-047`).
- **SPIKE-DIVE-003-REQ-008:** Locale `es`/`en` persists through booking and email (`DIVE-BOOK-REQ-042`).
- **SPIKE-DIVE-003-REQ-009:** Analytics avoid third-party cookies and unnecessary PII.
- **SPIKE-DIVE-003-REQ-010:** Evidence records trade-offs versus Web Component and host-DOM script.

## Completion rule

Every requirement maps to executable evidence or an explicitly reviewed non-executable validation, plus `results.md`.

## Execution checkpoints

**Documented:** moved from the original execution-checkpoints document; execution status is unchanged.

1. Hosted booking page prototype.
2. iframe embed with initial height 720 px.
3. Origin allow-list and CSP `frame-ancestors`.
4. Versioned postMessage validation.
5. Negative origin and payload tests.
6. Fallback link.
7. WCAG 2.2 AA and 320 px checks.
8. `es`/`en` persistence.
9. WordPress, Wix, Squarespace, and generic HTML evidence for closure.

Prototype may start on one test page. Closure requires all four targets.

## Requirement relationships

**Documented:** relationships only, not executed evidence. Tests or executed results must establish coverage when this spike is run.

| Spike requirement | Booking requirement |
| --- | --- |
| SPIKE-DIVE-003-REQ-001 | DIVE-BOOK-REQ-040 |
| SPIKE-DIVE-003-REQ-002 | DIVE-BOOK-REQ-004 |
| SPIKE-DIVE-003-REQ-003 | DIVE-BOOK-REQ-041 |
| SPIKE-DIVE-003-REQ-004 | — |
| SPIKE-DIVE-003-REQ-005 | — |
| SPIKE-DIVE-003-REQ-006 | DIVE-BOOK-REQ-040 |
| SPIKE-DIVE-003-REQ-007 | DIVE-BOOK-REQ-047 |
| SPIKE-DIVE-003-REQ-008 | DIVE-BOOK-REQ-042 |
| SPIKE-DIVE-003-REQ-009 | — |
| SPIKE-DIVE-003-REQ-010 | ADR-DIVE-002 |
