# MT-SPIKE-001 — Results

- **Execution status:** Passed
- **Decision:** Accepted with conditions
- **Date:** 2026-09-26
- **Commit:** `2f55ad85bfb2e0731e42cc2b0481aa699c6207f3`
- **Environment:** GitHub Actions `ubuntu-latest`; PostgreSQL 18 service; Node version from `.nvmrc`; pnpm lockfile
- **Commands:** `pnpm check`, `pnpm test`, `pnpm test:integration`
- **Evidence:** [check-and-test](https://github.com/BorjaRM/dive-platform/actions/runs/36256124088/job/108443130583), [integration](https://github.com/BorjaRM/dive-platform/actions/runs/36256124088/job/108443130352), [spec governance](https://github.com/BorjaRM/dive-platform/actions/runs/36256124095/job/108443130179)

## Covered requirements

The representative PostgreSQL/Drizzle slice covers the executable criteria of `MT-REQ-001`…`MT-REQ-010`:

- non-null tenant keys and Drizzle/PostgreSQL schema alignment;
- identity–membership bootstrap before tenant context;
- tenant-aware constraints and forced RLS;
- restricted runtime role;
- transaction-local context across commit, rollback, SQL failure, and same-connection pool reuse;
- fail-closed SQL and Drizzle access outside the UoW;
- atomic domain + audit + outbox writes;
- sequential, concurrent, and lost-ACK idempotency;
- cross-tenant non-disclosure;
- repeatable fixtures with two tenants and multiple centers.

The exact scenario/test/assertion/evidence mapping is in `MT-SPIKE-001-traceability.md`.

## Observations

- PostgreSQL forced RLS remains the isolation boundary even when access uses Drizzle.
- The application package does not export the unauthorised `withTenant` primitive; `withAuthorizedTenant` re-checks membership.
- A pool of size 1 demonstrates that transaction-local context does not leak across tenants after commit, rollback, or an aborted transaction.
- Database effect and consumer receipt are atomic; concurrent delivery applies the effect once.

## Accepted conditions

| Condition | Required follow-up | Activation gate |
|---|---|---|
| `MT-COND-IAM-001` | Derive tenant/correlation from immutable authorized request context; HTTP isolation; API error/log redaction with synthetic token/email fixtures | First IAM/API vertical, before production traffic or production outbox emission |
| `MT-COND-WORKER-001` | Approve and test destination idempotency, retry/backoff/exhaustion, dead-letter behavior, tenant/correlation preservation, and worker-log redaction | First real outbox worker, before external effects |

These conditions retain the relevant `MT-REQ-*` and `MT-SC-*` identifiers. They do not move normative requirements or waive evidence.

## Limitations

- The harness proves persistence and database-bound consumer behavior, not HTTP behavior or an external delivery transport.
- Prototype memberships and permission strings are test scaffolding, not the product IAM model.
- Option B channels (cache, files, search, export, deletion, restore, support access, noisy-neighbor) remain deferred and block declaring the reusable baseline fully adopted.
- Booking capacity, widget, and trip behavior remain owned by their product spikes/SPECs.

## Conclusion

**Accepted with conditions.** The shared PostgreSQL architecture supports tenant isolation for the representative persistence slice. No executable gap remains in this harness. The two named conditions become blocking when the IAM/API and real-worker components are introduced.
