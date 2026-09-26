# Product spikes

Spikes reduce a bounded uncertainty and produce reproducible evidence. They do not replace a SPEC or ADR.

Notion spike pages are indexes and coordination only. Executable contracts live here.

## IDs

Never abbreviate to `SPIKE-001` in this repository. That ID belongs to another product.

| ID | Question | Path |
|---|---|---|
| `MT-SPIKE-001` | Shared PostgreSQL tenant isolation | `specs/multitenancy/` |
| `SPIKE-DIVE-001` | Last-seat booking concurrency | `specs/spikes/SPIKE-DIVE-001/` |
| `SPIKE-DIVE-002` | Eligibility and emergency data (deferred) | `specs/spikes/SPIKE-DIVE-002/` |
| `SPIKE-DIVE-003` | Widget integration and security | `specs/spikes/SPIKE-DIVE-003/` |

Do not merge `MT-REQ-*` results with `SPIKE-DIVE-001-REQ-*` or `DIVE-BOOK-REQ-*`. Sharing fixtures does not merge evidence.

## Packages

- `../multitenancy/` — `MT-SPIKE-001` isolation (not under this directory)
- `SPIKE-DIVE-001/` — last-seat concurrency, capacity, idempotency, audit, and outbox
- `SPIKE-DIVE-002/` — deferred eligibility and emergency-data discovery
- `SPIKE-DIVE-003/` — widget integration, security, accessibility, and fallback

Each package contains specification, requirements, execution checkpoints, traceability, and results.

Normative product behavior remains in its owning SPEC. `results.md` starts as Not executed and must never contain an untested conclusion.
