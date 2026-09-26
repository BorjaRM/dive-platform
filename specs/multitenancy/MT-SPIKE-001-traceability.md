# MT-SPIKE-001 — Traceability

- **Status:** Initial
- **Version:** 0.2
- **Pull request:** https://github.com/BorjaRM/dive-platform/pull/8
- **Human review:** pending
- **Evidence:** `evidence/multitenancy/MT-SPIKE-001/` (placeholder until CI)
- **Results:** `specs/multitenancy/MT-SPIKE-001-results.md` (Not executed)

Do not duplicate normative requirement text here. Scenario IDs (`MT-SC-*`) are a `Proposed` index. Coverage is not acceptance.

Coverage values:

- `Covered`: an executable test proves the criterion; evidence remains pending until recorded below.
- `Partial`: a test exists but does not prove the criterion.
- `Gap`: no executable test yet; required to close this spike.
- `Deferred`: Option B; not this spike; baseline still not fully adopted.
- `Excluded`: documented product spike/SPEC, not `MT-SPIKE-001`.

Evidence for every executable row remains `Pending CI` until `results.md` records a commit, environment, and command output.

## Matrix

| Requirement | Scenario | Test | Assertion | Evidence | Coverage |
|---|---|---|---|---|---|
| MT-REQ-001 | MT-SC-001 Authorized insert persists `tenant_id` | `isolation.integration.test.ts` — “allows authorized writes and reads…” | inserted note `tenantId === tenantA` | Pending CI | Covered |
| MT-REQ-001 | MT-SC-002 Null tenant key rejected | `isolation.integration.test.ts` — “requires a non-null tenant key…” | null `tenant_id` insert fails on every representative tenant-owned table | Pending CI | Covered |
| MT-REQ-001 | MT-SC-003 Non-null tenant column on all tenant-owned tables | same test | catalog includes every representative table with `is_nullable = NO` | Pending CI | Covered |
| MT-REQ-002 | MT-SC-004 Authorized read/write inside tenant and center | `isolation.integration.test.ts` — “allows authorized writes and reads…” | insert + select by id returns one row | Pending CI | Partial (UUID passed to `withTenant`; no identity/membership) |
| MT-REQ-002 | MT-SC-005 Context only after identity–tenant validation | — | unauthorized identity cannot obtain a tenant UoW | — | Gap |
| MT-REQ-002 | MT-SC-006 Membership required | — | identity without membership in T cannot set context for T | — | Gap |
| MT-REQ-002 | MT-SC-007 Client tenant id is not authorization | — | spoofed client tenant id rejected before UoW | — | Gap |
| MT-REQ-002 | MT-SC-008 UoW does not treat arbitrary UUID as authorized context | — | `withTenant` (or caller) rejects unauthorized tenant ids | — | Gap |
| MT-REQ-003 | MT-SC-009 Insert note A → center B rejected | `isolation.integration.test.ts` — “rejects cross-tenant center relationships” | insert throws | Pending CI | Covered |
| MT-REQ-003 | MT-SC-010 Update existing note to other-tenant center rejected | same test | `UPDATE notes.center_id` to `centerB1` throws | Pending CI | Covered |
| MT-REQ-003 | MT-SC-011 Cross-tenant receipt/outbox relation rejected | same test | tenant B receipt cannot reference tenant A event | Pending CI | Covered |
| MT-REQ-004 | MT-SC-012 No `BYPASSRLS`, not superuser | `roles.integration.test.ts` — “has forced RLS, no BYPASSRLS, and no DDL” | `rolbypassrls === false`, `rolsuper === false` | Pending CI | Covered |
| MT-REQ-004 | MT-SC-013 No DDL | same test | `CREATE TABLE` rejected | Pending CI | Covered |
| MT-REQ-004 | MT-SC-014 Forced RLS on every tenant-owned table | same test | `relrowsecurity` and `relforcerowsecurity` true for all six tables | Pending CI | Covered |
| MT-REQ-004 | MT-SC-015 Policies `USING` + `WITH CHECK` | same test | six `ALL` policies constrain both expressions with transaction tenant context | Pending CI | Covered |
| MT-REQ-004 | MT-SC-016 App role cannot weaken controls | same test | disable RLS, drop policy, and grant `BYPASSRLS` all fail | Pending CI | Covered |
| MT-REQ-004 | MT-SC-017 App role is not owner / not migrator | same test | all six tables owned by `dive_migration`, never `dive_app` | Pending CI | Covered |
| MT-REQ-005 | MT-SC-018 Context empty after commit on a later checkout | `pooling.integration.test.ts` — “clears transaction-local tenant context…” | same PID has empty context; tenant B sees no A rows | Pending CI | Covered |
| MT-REQ-005 | MT-SC-019 Same physical connection alternates A/B | `pooling.integration.test.ts` — “alternates tenants repeatedly…” | pool `max: 1`; same PID observes A, B, A | Pending CI | Covered |
| MT-REQ-005 | MT-SC-020 Rollback leaves no residual context | `pooling.integration.test.ts` — “clears tenant context and writes after rollback…” | same PID has empty context and no rolled-back row | Pending CI | Covered |
| MT-REQ-005 | MT-SC-021 SQL error abort leaves no residual context | `pooling.integration.test.ts` — “clears context after a SQL error…” | division-by-zero abort; same PID has empty context | Pending CI | Covered |
| MT-REQ-005 | MT-SC-022 Context is transaction-local after `BEGIN` | `pooling.integration.test.ts` — “alternates tenants repeatedly…” | context is visible in each transaction and absent after checkout | Pending CI | Covered |
| MT-REQ-006 | MT-SC-023 `SELECT` without context fails closed | `isolation.integration.test.ts` — “fails closed without tenant context” | `SELECT` throws | Pending CI | Covered |
| MT-REQ-006 | MT-SC-024 `INSERT`/`UPDATE`/`DELETE` without context fail closed | same test | each DML throws | Pending CI | Covered |
| MT-REQ-006 | MT-SC-025 Empty / malformed context fails closed | `isolation.integration.test.ts` — “fails closed with malformed or unknown…” | empty and non-UUID contexts throw; unknown UUID sees no rows and cannot insert | Pending CI | Covered |
| MT-REQ-006 | MT-SC-026 Spoofed row tenant key rejected | `isolation.integration.test.ts` — spoofed insert/update tests | insert and update with row tenant ≠ context throw | Pending CI | Covered |
| MT-REQ-007 | MT-SC-027 Consume keeps tenant; audit has correlation id | `outbox.integration.test.ts` — “writes domain audit and outbox atomically…” | handler receives tenant/correlation; audit matches both | Pending CI | Partial (producer still accepts caller values without authorized identity context) |
| MT-REQ-007 | MT-SC-028 Consumer rebuilds tenant UoW | same test (`processOutboxOnce` → `withTenant`) | tenant B consume of A’s event returns generic not-visible failure | Pending CI | Covered |
| MT-REQ-007 | MT-SC-029 Domain + audit + outbox commit together | same test | note, audit, and outbox are all visible after commit | Pending CI | Covered |
| MT-REQ-007 | MT-SC-030 Domain + audit + outbox roll back together | `outbox.integration.test.ts` — “rolls back outbox together with the domain write” | note, audit, and outbox are all absent after forced failure | Pending CI | Covered |
| MT-REQ-007 | MT-SC-031 Worker retries preserve tenant and correlation | `outbox.integration.test.ts` — “retries with the same tenant…” | failed handler rolls receipt back; retry receives identical tenant/correlation | Pending CI | Partial (no dead-letter path or worker logger exists) |
| MT-REQ-008 | MT-SC-032 Sequential duplicate is idempotent | `outbox.integration.test.ts` — first test | second delivery returns `duplicate`; handler invoked once | Pending CI | Covered |
| MT-REQ-008 | MT-SC-033 Other tenant cannot consume | same test | tenant B receives a generic not-visible error without event/correlation identifiers | Pending CI | Covered |
| MT-REQ-008 | MT-SC-034 Concurrent workers do not double-apply | `outbox.integration.test.ts` — “does not double-apply concurrent deliveries” | concurrent workers return one `processed`, one `duplicate`, and one receipt | Pending CI | Covered |
| MT-REQ-008 | MT-SC-035 Lost ACK then retry is idempotent | `outbox.integration.test.ts` — first test | committed receipt followed by redelivery returns `duplicate` without invoking handler | Pending CI | Covered |
| MT-REQ-008 | MT-SC-036 Retry limit / exhaustion does not switch tenant | — | exhausted event remains in tenant A; B cannot process it | — | Gap |
| MT-REQ-009 | MT-SC-037 Other-tenant list is empty | `isolation.integration.test.ts` — “hides other-tenant rows…” | tenant B list is empty; cross-tenant update/delete affect no rows | Pending CI | Covered |
| MT-REQ-009 | MT-SC-038 Get-by-id does not leak other tenant | same test | select by tenant A id in tenant B returns empty | Pending CI | Covered |
| MT-REQ-009 | MT-SC-039 Aggregates do not include other tenant | same test | tenant B count is zero | Pending CI | Covered |
| MT-REQ-009 | MT-SC-040 Audit of A hidden from B | same test | tenant B audit list is empty | Pending CI | Covered |
| MT-REQ-009 | MT-SC-041 Errors/logs do not disclose payloads, tokens, or emails | `outbox.integration.test.ts` — first test | cross-tenant worker error is generic and omits event/correlation identifiers | Pending CI | Partial (no application logger or token/email-bearing fixture exists) |
| MT-REQ-010 | MT-SC-042 Fixtures: two tenants, two+ centers | `harness.ts`; isolation tests | tenants A/B and centers A1/A2/B1 are created and exercised | Pending CI | Covered |
| MT-REQ-010 | MT-SC-043 Repeatable negatives across tenants and centers | `isolation.integration.test.ts` — “rejects spoofed tenant changes…” | tenant B cross-center inserts fail against both A1 and A2 | Pending CI | Covered |
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

## Uncovered criteria and activation gates

| Scenarios | Why they cannot be proved now | Must be tested when |
|---|---|---|
| MT-SC-004–008 | `packages/identity` and `packages/application` have no identity, membership, permission, or typed authorization-context implementation. The database UoW currently accepts a UUID and cannot prove who authorized it. | The first IAM/API vertical implements `DIVE-IAM-REQ-003` and `DIVE-IAM-REQ-006`; before `MT-SPIKE-001` closes unless a human resolves the HTTP/open-scope question otherwise. |
| MT-SC-027 producer half | There is no authorized application command that derives tenant/correlation from immutable request context; the harness inserts those fields directly. | The same first IAM/API vertical introduces the producer command and before it emits production outbox events. |
| MT-SC-031 dead-letter/log half; MT-SC-036 | `apps/worker` is a starter. No approved retry limit, backoff, exhaustion state, dead-letter transport, or worker logging/redaction contract exists. Choosing values here would invent normative behavior. | The first real outbox worker change, after retry/dead-letter/observability policy is approved; before the worker handles production events. |
| MT-SC-041 application-log half | No tenant-aware API error mapper or structured worker logger exists, and fixtures contain no tokens/emails. PostgreSQL and the prototype consumer can only prove generic non-disclosing failures. | The first IAM/API error boundary and worker logger implementation; before handling real identity or personal data. |

The HTTP part of the spike question remains the open question recorded in the requirements and specification. Persistence coverage must not be presented as HTTP evidence.

## Counts (current worktree)

| Coverage | Rows |
|---|---|
| Covered | 34 |
| Partial | 4 |
| Gap | 5 |
| Deferred (Option B) | 8 |
| Excluded (product) | 3 |

Closing `MT-SPIKE-001` requires replacing every `Gap` with an executable test and evidence. `Partial` rows must be strengthened until the assertion matches the criterion or receive an explicitly approved scope decision. `Deferred` rows do not block this spike; they block declaring the reusable baseline fully adopted.

Update paths with immutable commit references during execution.
