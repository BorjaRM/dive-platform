---
name: cross-cutting-performance-checklist
description: Performance notes without inventing budgets. Use when changing SQL, API payloads, outbox/worker, concurrency, or web/widget fetching.
---

# Cross-cutting performance checklist

Do not invent numeric SLOs, payload limits, or bundle budgets. Point to the SPEC, ADR, or spike. If none exists, record a `Proposed` note or open question.

## Procedure

1. Name the hot path (DB / API / worker-outbox / web-widget).
2. Check the relevant SPEC/ADR/spike for existing constraints (for example last-seat → SPIKE-DIVE-001; widget → SPIKE-DIVE-003).
3. Apply only what the change can justify:

- **DB:** indexes and query shape; no assumed full-scan ban unless specified
- **Concurrency:** contended capacity needs an explicit test or spike evidence
- **API:** consider payload size and N+1; do not invent pagination rules
- **Worker/outbox:** retries, idempotency, backpressure if the change touches delivery
- **Web/widget:** avoid extra client round-trips; widget is a constrained embed

4. Add a short **Performance notes** subsection to the PR when relevant, including "not measured".

## Exit criteria

- Either a measurable check, a pointer to a spike, or an explicit gap
