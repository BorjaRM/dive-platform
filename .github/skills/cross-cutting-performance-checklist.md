---
name: Cross-cutting performance checklist
when_to_use: Any time you touch DB queries, API contracts, worker/outbox, or web/widget.
---

## Checklist (apply to your change)
- **DB**: indexes considered, query shapes reasonable, no accidental full scans for MVP hot paths.
- **Concurrency**: for contended paths (capacity / last seat), define an explicit contention test or spike evidence.
- **API**: payload size and pagination considered; avoid N+1 and chatty patterns.
- **Worker/outbox**: throughput, retries, idempotency, and backpressure considered.
- **Web/widget**: bundle size and client fetching patterns considered.

## Output
- Add a short "Performance notes" section to the PR when performance is relevant.
