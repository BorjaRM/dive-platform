# Product spikes

Spikes reduce a bounded uncertainty and produce reproducible evidence. They do not replace a SPEC or ADR.

## Packages

- `SPIKE-DIVE-001/` — last-seat concurrency, capacity, idempotency, audit, and outbox.
- `SPIKE-DIVE-002/` — deferred eligibility and emergency-data discovery.
- `SPIKE-DIVE-003/` — widget integration, security, accessibility, and fallback.

Each package contains:

- `specification.md` — question, hypothesis, scope, method, and closure outcomes.
- `requirements.md` — spike-specific validation requirements.
- `execution-checkpoints.md` — reproducible execution checklist.
- `traceability.md` — requirement-to-test-to-evidence mapping.
- `results.md` — factual execution record and decision; initially Not executed.

Normative product behavior remains in its owning SPEC. Never put an untested conclusion in `results.md`.
