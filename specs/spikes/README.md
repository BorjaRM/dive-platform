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
| `SPIKE-DIVE-004` | Clerk Application Invitation acceptance | `specs/spikes/SPIKE-DIVE-004/` |

Do not merge `MT-REQ-*` results with `SPIKE-DIVE-001-REQ-*` or `DIVE-BOOK-REQ-*`. Sharing fixtures does not merge evidence.

## Packages

- `../multitenancy/` — `MT-SPIKE-001` isolation (not under this directory)
- `SPIKE-DIVE-001/` — last-seat concurrency, capacity, idempotency, audit, and outbox
- `SPIKE-DIVE-002/` — deferred eligibility and emergency-data discovery
- `SPIKE-DIVE-003/` — widget integration, security, accessibility, and fallback
- `SPIKE-DIVE-004/` — Clerk Application Invitation creation, existing-identity acceptance, session states, and ticket cleanup

Unexecuted packages contain specification and requirements, with execution checkpoints and relationship mappings consolidated in requirements. Executed packages additionally retain their results and any separate execution/evidence records needed to reproduce them.

Normative product behavior remains in its owning SPEC. Keep requirements, execution criteria and relationships together until execution. Create `results.md` only for executed observations; never create empty results or imply an untested conclusion. Executed MT-SPIKE-001 and SPIKE-DIVE-004 retain their result/evidence files.
