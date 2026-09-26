# MT-SPIKE-001 — Cross-cutting multi-tenant isolation validation

- **Status:** Accepted with conditions
- **Version:** 0.3
- **Decision date:** 2026-09-26
- **Evidence commit:** `2f55ad85bfb2e0731e42cc2b0481aa699c6207f3`
- **Hypothesis:** A non-null tenant key, tenant-aware constraints, forced RLS, explicit transaction-local context, and tenant-aware async processing can prevent cross-tenant access without dedicated databases.

## Question

Can the shared PostgreSQL architecture preserve tenant isolation across HTTP, transactions, pooled connections, RLS, audit, outbox, and workers?

## Scope

Cross-cutting isolation only. Product booking capacity and widget behavior are excluded. Sharing fixtures with SPIKE-DIVE-001 does not merge results.

Also out of this spike (**Option B**, approved for this closure): cache, files, search, export, deletion, restore, support access, and noisy-neighbor, because those channels do not exist here. They remain baseline obligations assigned in `MT-SPIKE-001-requirements.md`. Passing this spike does not mean the baseline is fully adopted.

## Method

Implement the smallest representative slice, execute deterministic positive and negative scenarios against real PostgreSQL, record commands and environment, and store reproducible evidence without real personal data.

A requirement is covered only when every verifiable criterion in `MT-SPIKE-001-requirements.md` has a matrix row in `MT-SPIKE-001-traceability.md` with test, assertion, and evidence. Mapping an ID to a file is not coverage.

## Required scenarios

1. Authorized reads and writes succeed inside tenant and center scope.
2. Cross-tenant identifiers and relationships are rejected by application and database controls.
3. Runtime role cannot bypass RLS or execute DDL.
4. Pooled connections do not retain tenant context between requests.
5. Missing or invalid context fails closed.
6. Outbox, worker, and audit preserve tenant and correlation context.
7. At least two tenants and two centers are used in repeatable negative tests.

## Dependencies

- `specs/foundation/multitenancy-architecture.md`
- `specs/multitenancy/adoption-profile.md`
- `specs/architecture/adrs/ADR-DIVE-001.md`
- `specs/architecture/adrs/ADR-DIVE-002.md`

## Closure decision

**Accepted with conditions.** The PostgreSQL/Drizzle persistence hypothesis is supported by committed tests and reproducible CI evidence. There are no uncovered scenarios that can be executed by the current harness.

The following obligations remain normative but are activated only when their owning component exists:

| Condition | Scenarios | Owner / activation gate | Closure effect |
|---|---|---|---|
| `MT-COND-IAM-001` | producer half of `MT-SC-027`; API/log half of `MT-SC-041`; HTTP isolation | First IAM/API vertical, before accepting production traffic or emitting production outbox events | Does not reopen the persistence result; blocks acceptance of the IAM/API vertical and the reusable baseline |
| `MT-COND-WORKER-001` | external-delivery/dead-letter/log half of `MT-SC-031`; `MT-SC-036` | First real outbox worker, after retry/backoff/exhaustion and destination-idempotency policy are approved and before external effects | Does not reopen the persistence result; blocks acceptance of the worker vertical and the reusable baseline |

Option B channels remain deferred in their owning artifacts. They are not waived and block declaring the reusable baseline fully adopted.

No `MT-REQ-*` statement was deleted, weakened, or moved out of the baseline. Only execution ownership was assigned to the component capable of producing evidence.

## Resolved question

The HTTP part of the spike question is not executable in this PostgreSQL harness. It is assigned to `MT-COND-IAM-001` and must be exercised by the first IAM/API vertical together with `DIVE-IAM-REQ-006`. Persistence evidence must not be presented as HTTP evidence.
