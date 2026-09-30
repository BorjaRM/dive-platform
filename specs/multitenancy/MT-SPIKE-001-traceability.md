# MT-SPIKE-001 — Traceability

- **Status:** Accepted with conditions
- **Version:** 0.3
- **Pull request:** https://github.com/BorjaRM/dive-platform/pull/8
- **Human review:** approved by the product owner on 2026-09-26
- **Evidence:** [green integration job](https://github.com/BorjaRM/dive-platform/actions/runs/36256124088/job/108443130352) for `2f55ad85bfb2e0731e42cc2b0481aa699c6207f3`
- **Results:** `specs/multitenancy/MT-SPIKE-001-results.md` (Accepted with conditions)

Do not duplicate normative requirement text here. Scenario IDs (`MT-SC-*`) are the approved traceability index. Coverage and activation conditions support the decision recorded in `results.md`.

Coverage values:

- `Covered`: an executable test proves the criterion; evidence remains pending until recorded below.
- `Conditional`: normative scenario cannot execute until its named component exists; its owner and pre-production gate are binding.
- `Gap`: executable in the current harness but unproved; none remain at closure.
- `Deferred`: Option B; not this spike; baseline still not fully adopted.
- `Excluded`: documented product spike/SPEC, not `MT-SPIKE-001`.

Executable rows are evidenced by the green PostgreSQL 18 integration job at commit `2f55ad85`. Conditional rows require fresh evidence from their owning vertical; this CI run is not evidence for them.

## Matrix

| Requirement | Scenario | Test | Assertion | Evidence | Coverage |
|---|---|---|---|---|---|
| MT-REQ-001 | MT-SC-001 Authorized insert persists `tenant_id` | `isolation.integration.test.ts` — “allows authorized writes and reads…” | inserted note `tenantId === tenantA` | [CI integration](https://github.com/BorjaRM/dive-platform/actions/runs/36256124088/job/108443130352) (`2f55ad85`) | Covered |
| MT-REQ-001 | MT-SC-002 Null tenant key rejected | `isolation.integration.test.ts` — “requires a non-null tenant key…” | null `tenant_id` insert fails on every representative tenant-owned table | [CI integration](https://github.com/BorjaRM/dive-platform/actions/runs/36256124088/job/108443130352) (`2f55ad85`) | Covered |
| MT-REQ-001 | MT-SC-003 Non-null tenant column on all tenant-owned tables | same test | catalog includes every representative table with `is_nullable = NO` | [CI integration](https://github.com/BorjaRM/dive-platform/actions/runs/36256124088/job/108443130352) (`2f55ad85`) | Covered |
| MT-REQ-002 | MT-SC-004 Authorized read/write inside tenant and center | `authorization.integration.test.ts` — membership validated then insert/select | insert + select by id returns one row after `authorize` | [CI integration](https://github.com/BorjaRM/dive-platform/actions/runs/36256124088/job/108443130352) (`2f55ad85`) | Covered |
| MT-REQ-002 | MT-SC-005 Context only after identity–tenant validation | `authorization.integration.test.ts` — “creates tenant context only after…” | `authorize(identityA, tenantA)` returns tenant, identity, typical permissions | [CI integration](https://github.com/BorjaRM/dive-platform/actions/runs/36256124088/job/108443130352) (`2f55ad85`) | Covered |
| MT-REQ-002 | MT-SC-006 Membership required | `authorization.integration.test.ts` — “rejects identities without membership…” | unaffiliated identity and A-in-B throw `Access denied` | [CI integration](https://github.com/BorjaRM/dive-platform/actions/runs/36256124088/job/108443130352) (`2f55ad85`) | Covered |
| MT-REQ-002 | MT-SC-007 Client tenant id is not authorization | `authorization.integration.test.ts` — “does not treat a client-supplied tenant id…” | `authorize(identityA, tenantB)` throws `Access denied` | [CI integration](https://github.com/BorjaRM/dive-platform/actions/runs/36256124088/job/108443130352) (`2f55ad85`) | Covered |
| MT-REQ-002 | MT-SC-008 UoW does not treat arbitrary UUID as authorized context | `authorization.integration.test.ts` — forged context object and package export check | `withAuthorizedTenant` re-checks membership and denies A on tenant B; package root does not export `withTenant` | [CI integration](https://github.com/BorjaRM/dive-platform/actions/runs/36256124088/job/108443130352) (`2f55ad85`) | Covered |
| MT-REQ-003 | MT-SC-009 Insert note A → center B rejected | `isolation.integration.test.ts` — “rejects cross-tenant center relationships” | insert throws | [CI integration](https://github.com/BorjaRM/dive-platform/actions/runs/36256124088/job/108443130352) (`2f55ad85`) | Covered |
| MT-REQ-003 | MT-SC-010 Update existing note to other-tenant center rejected | same test | `UPDATE notes.center_id` to `centerB1` throws | [CI integration](https://github.com/BorjaRM/dive-platform/actions/runs/36256124088/job/108443130352) (`2f55ad85`) | Covered |
| MT-REQ-003 | MT-SC-011 Cross-tenant receipt/outbox relation rejected | same test | tenant B receipt cannot reference tenant A event | [CI integration](https://github.com/BorjaRM/dive-platform/actions/runs/36256124088/job/108443130352) (`2f55ad85`) | Covered |
| MT-REQ-004 | MT-SC-012 No `BYPASSRLS`, not superuser | `roles.integration.test.ts` — “has forced RLS, no BYPASSRLS, and no DDL” | `rolbypassrls === false`, `rolsuper === false` | [CI integration](https://github.com/BorjaRM/dive-platform/actions/runs/36256124088/job/108443130352) (`2f55ad85`) | Covered |
| MT-REQ-004 | MT-SC-013 No DDL | same test | `CREATE TABLE` rejected | [CI integration](https://github.com/BorjaRM/dive-platform/actions/runs/36256124088/job/108443130352) (`2f55ad85`) | Covered |
| MT-REQ-004 | MT-SC-014 Forced RLS on every tenant-owned table | same test | `relrowsecurity` and `relforcerowsecurity` true for all seven tenant-owned tables | [CI integration](https://github.com/BorjaRM/dive-platform/actions/runs/36256124088/job/108443130352) (`2f55ad85`) | Covered |
| MT-REQ-004 | MT-SC-015 Policies `USING` + `WITH CHECK` | same test | exactly one `ALL` policy per tenant-owned table constrains both expressions with transaction tenant context | [CI integration](https://github.com/BorjaRM/dive-platform/actions/runs/36256124088/job/108443130352) (`2f55ad85`) | Covered |
| MT-REQ-004 | MT-SC-016 App role cannot weaken controls | same test | disable RLS, drop policy, and grant `BYPASSRLS` all fail | [CI integration](https://github.com/BorjaRM/dive-platform/actions/runs/36256124088/job/108443130352) (`2f55ad85`) | Covered |
| MT-REQ-004 | MT-SC-017 App role is not owner / not migrator | same test | all eight prototype tables are owned by `dive_migration`, never `dive_app` | [CI integration](https://github.com/BorjaRM/dive-platform/actions/runs/36256124088/job/108443130352) (`2f55ad85`) | Covered |
| MT-REQ-005 | MT-SC-018 Context empty after commit on a later checkout | `pooling.integration.test.ts` — “clears transaction-local tenant context…” | same PID has empty context; tenant B sees no A rows | [CI integration](https://github.com/BorjaRM/dive-platform/actions/runs/36256124088/job/108443130352) (`2f55ad85`) | Covered |
| MT-REQ-005 | MT-SC-019 Same physical connection alternates A/B | `pooling.integration.test.ts` — “alternates tenants repeatedly…” | pool `max: 1`; same PID observes A, B, A | [CI integration](https://github.com/BorjaRM/dive-platform/actions/runs/36256124088/job/108443130352) (`2f55ad85`) | Covered |
| MT-REQ-005 | MT-SC-020 Rollback leaves no residual context | `pooling.integration.test.ts` — “clears tenant context and writes after rollback…” | same PID has empty context and no rolled-back row | [CI integration](https://github.com/BorjaRM/dive-platform/actions/runs/36256124088/job/108443130352) (`2f55ad85`) | Covered |
| MT-REQ-005 | MT-SC-021 SQL error abort leaves no residual context | `pooling.integration.test.ts` — “clears context after a SQL error…” | division-by-zero abort; same PID has empty context | [CI integration](https://github.com/BorjaRM/dive-platform/actions/runs/36256124088/job/108443130352) (`2f55ad85`) | Covered |
| MT-REQ-005 | MT-SC-022 Context is transaction-local after `BEGIN` | `pooling.integration.test.ts` — “alternates tenants repeatedly…” | context is visible in each transaction and absent after checkout | [CI integration](https://github.com/BorjaRM/dive-platform/actions/runs/36256124088/job/108443130352) (`2f55ad85`) | Covered |
| MT-REQ-006 | MT-SC-023 `SELECT` without context fails closed | `isolation.integration.test.ts` — “fails closed without tenant context” | `SELECT` throws | [CI integration](https://github.com/BorjaRM/dive-platform/actions/runs/36256124088/job/108443130352) (`2f55ad85`) | Covered |
| MT-REQ-006 | MT-SC-024 `INSERT`/`UPDATE`/`DELETE` without context fail closed | same test | each DML throws | [CI integration](https://github.com/BorjaRM/dive-platform/actions/runs/36256124088/job/108443130352) (`2f55ad85`) | Covered |
| MT-REQ-006 | MT-SC-025 Empty / malformed context fails closed | `isolation.integration.test.ts` — “fails closed with malformed or unknown…” | empty and non-UUID contexts throw; unknown UUID sees no rows and cannot insert | [CI integration](https://github.com/BorjaRM/dive-platform/actions/runs/36256124088/job/108443130352) (`2f55ad85`) | Covered |
| MT-REQ-006 | MT-SC-026 Spoofed row tenant key rejected | `isolation.integration.test.ts` — spoofed insert/update tests | insert and update with row tenant ≠ context throw | [CI integration](https://github.com/BorjaRM/dive-platform/actions/runs/36256124088/job/108443130352) (`2f55ad85`) | Covered |
| MT-REQ-007 | MT-SC-027 Consume keeps tenant; audit has correlation id | Consumer half: `outbox.integration.test.ts`; producer half: `MT-COND-IAM-001` | current handler receives tenant/correlation and audit matches; first IAM/API producer must derive both from immutable authorized context | Consumer half: [CI integration](https://github.com/BorjaRM/dive-platform/actions/runs/36256124088/job/108443130352) (`2f55ad85`); producer evidence required by first IAM/API vertical | Conditional (`MT-COND-IAM-001`) |
| MT-REQ-007 | MT-SC-028 Consumer rebuilds tenant UoW | same test (`processOutboxOnce` → `withTenant`) | tenant B consume of A’s event returns generic not-visible failure | [CI integration](https://github.com/BorjaRM/dive-platform/actions/runs/36256124088/job/108443130352) (`2f55ad85`) | Covered |
| MT-REQ-007 | MT-SC-029 Domain + audit + outbox commit together | same test | note, audit, and outbox are all visible after commit | [CI integration](https://github.com/BorjaRM/dive-platform/actions/runs/36256124088/job/108443130352) (`2f55ad85`) | Covered |
| MT-REQ-007 | MT-SC-030 Domain + audit + outbox roll back together | `outbox.integration.test.ts` — “rolls back outbox together with the domain write” | note, audit, and outbox are all absent after forced failure | [CI integration](https://github.com/BorjaRM/dive-platform/actions/runs/36256124088/job/108443130352) (`2f55ad85`) | Covered |
| MT-REQ-007 | MT-SC-031 Worker retries preserve tenant and correlation | Database half: `outbox.integration.test.ts`; external half: `MT-COND-WORKER-001` | database retry is atomic and tenant-safe; first real worker must prove external delivery, dead-letter, and redacted logging preserve tenant/correlation | Database half: [CI integration](https://github.com/BorjaRM/dive-platform/actions/runs/36256124088/job/108443130352) (`2f55ad85`); external evidence required by first real worker | Conditional (`MT-COND-WORKER-001`) |
| MT-REQ-008 | MT-SC-032 Sequential duplicate is idempotent | `outbox.integration.test.ts` — first test | second delivery returns `duplicate`; handler invoked once | [CI integration](https://github.com/BorjaRM/dive-platform/actions/runs/36256124088/job/108443130352) (`2f55ad85`) | Covered |
| MT-REQ-008 | MT-SC-033 Other tenant cannot consume | same test | tenant B receives a generic not-visible error without event/correlation identifiers | [CI integration](https://github.com/BorjaRM/dive-platform/actions/runs/36256124088/job/108443130352) (`2f55ad85`) | Covered |
| MT-REQ-008 | MT-SC-034 Concurrent workers do not double-apply | `outbox.integration.test.ts` — “does not double-apply concurrent deliveries” | concurrent workers return one `processed`, one `duplicate`, and one receipt | [CI integration](https://github.com/BorjaRM/dive-platform/actions/runs/36256124088/job/108443130352) (`2f55ad85`) | Covered |
| MT-REQ-008 | MT-SC-035 Lost ACK then retry is idempotent | `outbox.integration.test.ts` — first test | committed receipt followed by redelivery returns `duplicate` without invoking handler | [CI integration](https://github.com/BorjaRM/dive-platform/actions/runs/36256124088/job/108443130352) (`2f55ad85`) | Covered |
| MT-REQ-008 | MT-SC-036 Retry limit / exhaustion does not switch tenant | `MT-COND-WORKER-001` | approved retry/backoff/exhaustion policy is implemented; exhausted A event remains in A and B cannot process it | Required by first real worker before external effects | Conditional (`MT-COND-WORKER-001`) |
| MT-REQ-009 | MT-SC-037 Other-tenant list is empty | `isolation.integration.test.ts` — “hides other-tenant rows…” | tenant B list is empty; cross-tenant update/delete affect no rows | [CI integration](https://github.com/BorjaRM/dive-platform/actions/runs/36256124088/job/108443130352) (`2f55ad85`) | Covered |
| MT-REQ-009 | MT-SC-038 Get-by-id does not leak other tenant | same test | select by tenant A id in tenant B returns empty | [CI integration](https://github.com/BorjaRM/dive-platform/actions/runs/36256124088/job/108443130352) (`2f55ad85`) | Covered |
| MT-REQ-009 | MT-SC-039 Aggregates do not include other tenant | same test | tenant B count is zero | [CI integration](https://github.com/BorjaRM/dive-platform/actions/runs/36256124088/job/108443130352) (`2f55ad85`) | Covered |
| MT-REQ-009 | MT-SC-040 Audit of A hidden from B | same test | tenant B audit list is empty | [CI integration](https://github.com/BorjaRM/dive-platform/actions/runs/36256124088/job/108443130352) (`2f55ad85`) | Covered |
| MT-REQ-009 | MT-SC-041 Errors/logs do not disclose payloads, tokens, or emails | Database error: `outbox.integration.test.ts`; application/worker logging: `MT-COND-IAM-001` and `MT-COND-WORKER-001` | current cross-tenant error is generic; first API and worker loggers must prove redaction with token/email-bearing synthetic fixtures | Database half: [CI integration](https://github.com/BorjaRM/dive-platform/actions/runs/36256124088/job/108443130352) (`2f55ad85`); logger evidence required by owning verticals | Conditional (`MT-COND-IAM-001`, `MT-COND-WORKER-001`) |
| MT-REQ-010 | MT-SC-042 Fixtures: two tenants, two+ centers | `harness.ts`; isolation tests | tenants A/B and centers A1/A2/B1 are created and exercised | [CI integration](https://github.com/BorjaRM/dive-platform/actions/runs/36256124088/job/108443130352) (`2f55ad85`) | Covered |
| MT-REQ-010 | MT-SC-043 Repeatable negatives across tenants and centers | `isolation.integration.test.ts` — “rejects spoofed tenant changes…” | tenant B cross-center inserts fail against both A1 and A2 | [CI integration](https://github.com/BorjaRM/dive-platform/actions/runs/36256124088/job/108443130352) (`2f55ad85`) | Covered |
| MT-REQ-001 | MT-SC-055 Drizzle columns/nullability match PostgreSQL | `drizzle.integration.test.ts` — “keeps Drizzle columns and foreign keys aligned…” | `getTableConfig` columns equal `pg_attribute` for every representative table | [CI integration](https://github.com/BorjaRM/dive-platform/actions/runs/36256124088/job/108443130352) (`2f55ad85`) | Covered |
| MT-REQ-003 | MT-SC-056 Drizzle foreign keys match PostgreSQL | same test | each Drizzle FK matches `pg_constraint` target, columns, and on-delete | [CI integration](https://github.com/BorjaRM/dive-platform/actions/runs/36256124088/job/108443130352) (`2f55ad85`) | Covered |
| MT-REQ-006 | MT-SC-057 Drizzle outside UoW fails closed | `drizzle.integration.test.ts` — “fails closed for Drizzle queries outside…” | `drizzle(pool)` select/insert on `notes` throws | [CI integration](https://github.com/BorjaRM/dive-platform/actions/runs/36256124088/job/108443130352) (`2f55ad85`) | Covered |
| MT-REQ-006 | MT-SC-058 SQL through Drizzle stays tenant-scoped | `drizzle.integration.test.ts` — “keeps parameterized SQL through Drizzle…” | tenant A `db.execute` sees A; tenant B sees none | [CI integration](https://github.com/BorjaRM/dive-platform/actions/runs/36256124088/job/108443130352) (`2f55ad85`) | Covered |
| MT-REQ-006 | MT-SC-059 Escaped Drizzle handle cannot be reused | `drizzle.integration.test.ts` — “rejects a Drizzle handle escaped…” | `db` captured after `withTenant` throws on select | [CI integration](https://github.com/BorjaRM/dive-platform/actions/runs/36256124088/job/108443130352) (`2f55ad85`) | Covered |
| MT-REQ-002, MT-REQ-004, MT-REQ-005 | MT-SC-060 Membership bootstrap remains under RLS | `authorization.integration.test.ts` — membership lookup and pool-reuse tests; `roles.integration.test.ts` | `memberships` has forced RLS; direct app query fails; restricted `SECURITY DEFINER` function sets transaction-local tenant context that is absent on the next checkout | [CI integration](https://github.com/BorjaRM/dive-platform/actions/runs/36256124088/job/108443130352) (`2f55ad85`) | Covered |
| — | MT-SC-044 Cache isolation | — | n/a until cache exists | — | Deferred |
| — | MT-SC-045 File isolation | — | n/a until files exist | — | Deferred |
| — | MT-SC-046 Search isolation | — | n/a until search exists | — | Deferred |
| — | MT-SC-047 Export isolation | — | n/a until export exists | — | Deferred |
| — | MT-SC-048 Deletion / erasure isolation | — | n/a until deletion exists | — | Deferred |
| — | MT-SC-049 Restore isolation | — | n/a until restore rehearsal exists | — | Deferred |
| — | MT-SC-050 Support-access expiry | — | owned by `SPEC-DIVE-IAM-001` (`DIVE-IAM-REQ-020`, `028`) | — | Deferred |
| — | MT-SC-051 Noisy-neighbor / per-tenant limits | — | n/a until quotas exist | — | Deferred |
| — | MT-SC-052 Last-seat / capacity | — | `SPIKE-DIVE-001` | — | Excluded |
| — | MT-SC-053 Widget / public channel | — | `SPIKE-DIVE-003` | — | Excluded |
| — | MT-SC-054 Trip operations | — | `SPEC-DIVE-OPS-001` / `SPIKE-DIVE-002` | — | Excluded |

## Accepted conditions and activation gates

| Condition | Scenarios | Why evidence is not possible in this harness | Binding activation gate |
|---|---|---|---|
| `MT-COND-IAM-001` | producer half of MT-SC-027; API/log half of MT-SC-041; HTTP isolation | No application command, HTTP boundary, identity adapter, or structured API logger exists | First IAM/API vertical, before accepting production traffic or emitting production outbox events; test with `DIVE-IAM-REQ-006` |
| `MT-COND-WORKER-001` | external-delivery/dead-letter/log half of MT-SC-031; MT-SC-036; worker-log half of MT-SC-041 | `apps/worker` is a starter and no destination-idempotency, retry/backoff/exhaustion, dead-letter, or logging contract is approved | First real outbox worker, after those policies are approved and before any external effect |

These conditions retain their parent `MT-REQ-*`. They are not moved to IAM or worker product requirements and are not waivers. The owning vertical must add its own traceability row back to these `MT-SC-*` IDs and produce new evidence.

The HTTP question is resolved by `MT-COND-IAM-001`. Persistence coverage must not be presented as HTTP evidence.

## Counts (current worktree)

| Coverage | Rows |
|---|---|
| Covered | 45 |
| Conditional | 4 |
| Gap | 0 |
| Deferred (Option B) | 8 |
| Excluded (product) | 3 |

`MT-SPIKE-001` is Accepted with conditions because no executable `Gap` remains in the current harness. `Conditional` rows become blocking when their owning component is introduced. `Deferred` rows do not block this persistence result; they block declaring the reusable baseline fully adopted.

Update paths with immutable commit references during execution.
