# SPIKE-DIVE-003 — Requirements

- **Status:** Draft

- **SPIKE-DIVE-003-REQ-001:** The iframe uses an opaque server-resolved channel configuration.
- **SPIKE-DIVE-003-REQ-002:** Production embedding is restricted to explicit authorized origins.
- **SPIKE-DIVE-003-REQ-003:** postMessage is minimal, versioned, schema-validated, and origin-validated.
- **SPIKE-DIVE-003-REQ-004:** No secrets or complete personal payloads cross the host messaging boundary.
- **SPIKE-DIVE-003-REQ-005:** The widget remains usable with internal scrolling when auto-height fails.
- **SPIKE-DIVE-003-REQ-006:** A hosted booking page is always available as secure fallback.
- **SPIKE-DIVE-003-REQ-007:** Customization is catalog-based and cannot execute tenant-provided code.
- **SPIKE-DIVE-003-REQ-008:** The flow meets the approved keyboard, focus, contrast, error, language, and responsive criteria.
- **SPIKE-DIVE-003-REQ-009:** Tests cover WordPress, Wix, Squarespace, and generic HTML.
- **SPIKE-DIVE-003-REQ-010:** Presentation remains an adapter; the booking domain does not depend on iframe APIs.

## Completion rule

Every requirement must map to at least one executable test or an explicitly reviewed non-executable validation, plus evidence in `results.md` or the referenced evidence directory.
