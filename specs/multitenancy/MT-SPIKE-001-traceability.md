# MT-SPIKE-001 — Traceability

- **Status:** Initial
- **Version:** 0.2
- **Pull request:** https://github.com/BorjaRM/dive-platform/pull/8
- **Human review:** pending
- **Evidence:** `evidence/multitenancy/MT-SPIKE-001/` (placeholder until CI)
- **Results:** `specs/multitenancy/MT-SPIKE-001-results.md` (Not executed)

Do not duplicate normative requirement text here. Scenario IDs (`MT-SC-*`) are a `Proposed` index. Coverage is not acceptance.

Coverage values:

- `Partial`: a test exists but does not prove the criterion.
- `Gap`: no executable test yet; required to close this spike.
- `Deferred`: Option B; not this spike; baseline still not fully adopted.
- `Excluded`: documented product spike/SPEC, not `MT-SPIKE-001`.

Evidence for every executable row remains `Pending CI` until `results.md` records a commit, environment, and command output.

## Matrix

| Requirement | Scenario | Test | Assertion | Evidence | Coverage |
|---|---|---|---|---|---|
| MT-REQ-001 | MT-SC-001 Authorized insert persists `tenant_id` | `isolation.integration.test.ts` — “allows authorized writes and reads…” | inserted note `tenantId === tenantA` | Pending CI | Partial |
| MT-REQ-001 | MT-SC-002 Null tenant key rejected | — | `INSERT` with null tenant key fails on each tenant-owned table | — | Gap |
| MT-REQ-001 | MT-SC-003 Non-null tenant column on all tenant-owned tables | — | `information_schema` / catalog: `tenant_id` is `NOT NULL` on `centers`, `notes`, `outbox_events`, `audit_records`, `consumer_receipts` | — | Gap |
| MT-REQ-002 | MT-SC-004 Authorized read/write inside tenant and center | `isolation.integration.test.ts` — “allows authorized writes and reads…” | insert + select by id returns one row | Pending CI | Partial (UUID passed to `withTenant`; no identity/membership) |
| MT-REQ-002 | MT-SC-005 Context only after identity–tenant validation | — | unauthorized identity cannot obtain a tenant UoW | — | Gap |
| MT-REQ-002 | MT-SC-006 Membership required | — | identity without membership in T cannot set context for T | — | Gap |
| MT-REQ-002 | MT-SC-007 Client tenant id is not authorization | — | spoofed client tenant id rejected before UoW | — | Gap |
| MT-REQ-002 | MT-SC-008 UoW does not treat arbitrary UUID as authorized context | — | `withTenant` (or caller) rejects unauthorized tenant ids | — | Gap |
| MT-REQ-003 | MT-SC-009 Insert note A → center B rejected | `isolation.integration.test.ts` — “rejects cross-tenant center relationships” | insert throws | Pending CI | Partial (insert only, one relation) |
| MT-REQ-003 | MT-SC-010 Update existing note to other-tenant center rejected | — | `UPDATE notes.center_id` to `centerB1` throws | — | Gap |
| MT-REQ-003 | MT-SC-011 Cross-tenant receipt/outbox relation rejected | — | receipt/outbox child cannot reference another tenant’s parent | — | Gap |
| MT-REQ-004 | MT-SC-012 No `BYPASSRLS`, not superuser | `roles.integration.test.ts` — “has forced RLS, no BYPASSRLS, and no DDL” | `rolbypassrls === false`, `rolsuper === false` | Pending CI | Partial |
| MT-REQ-004 | MT-SC-013 No DDL | same test | `CREATE TABLE` rejected | Pending CI | Partial |
| MT-REQ-004 | MT-SC-014 Forced RLS on every tenant-owned table | — | `relrowsecurity` and `relforcerowsecurity` true for all six tables | — | Gap |
| MT-REQ-004 | MT-SC-015 Policies `USING` + `WITH CHECK` | — | each table has policies covering select/insert/update/delete on tenant key | — | Gap |
| MT-REQ-004 | MT-SC-016 App role cannot weaken controls | — | `DISABLE ROW LEVEL SECURITY`, `DROP POLICY`, `BYPASSRLS` grant fail | — | Gap |
| MT-REQ-004 | MT-SC-017 App role is not owner / not migrator | — | `dive_app` ≠ table owner; ≠ `dive_migration` | — | Gap |
| MT-REQ-005 | MT-SC-018 Context empty after commit on a later checkout | `pooling.integration.test.ts` — “clears transaction-local tenant context…” | `current_setting('app.tenant_id', true)` is empty; tenant B sees no rows | Pending CI | Partial (pool `max: 4`; same backend not asserted) |
| MT-REQ-005 | MT-SC-019 Same physical connection alternates A/B | — | pool `max: 1` or same `pg_backend_pid`; A then B then A | — | Gap |
| MT-REQ-005 | MT-SC-020 Rollback leaves no residual context | — | after rollback, same backend has empty `app.tenant_id` | — | Gap |
| MT-REQ-005 | MT-SC-021 SQL error abort leaves no residual context | — | after aborted SQL, same backend has empty `app.tenant_id` | — | Gap |
| MT-REQ-005 | MT-SC-022 Context is transaction-local after `BEGIN` | — | `set_config(..., true)` (or equivalent) observed; not session-lifetime | — | Gap |
| MT-REQ-006 | MT-SC-023 `SELECT` without context fails closed | `isolation.integration.test.ts` — “fails closed without tenant context” | `SELECT * FROM mt_spike.notes` throws | Pending CI | Partial |
| MT-REQ-006 | MT-SC-024 `INSERT`/`UPDATE`/`DELETE` without context fail closed | — | each DML without context throws | — | Gap |
| MT-REQ-006 | MT-SC-025 Empty / malformed context fails closed | — | empty string and non-UUID context throw before tenant-owned access | — | Gap |
| MT-REQ-006 | MT-SC-026 Spoofed row tenant key rejected | — | insert/update with `tenant_id` ≠ context fails `WITH CHECK` | — | Gap |
| MT-REQ-007 | MT-SC-027 Consume keeps tenant; audit has correlation id | `outbox.integration.test.ts` — “writes domain audit and outbox atomically…” | first consume `processed`; audit `tenantId === tenantA` and matching `correlationId` | Pending CI | Partial (no domain row; consumer does not assert correlation propagation in logs) |
| MT-REQ-007 | MT-SC-028 Consumer rebuilds tenant UoW | same test (implicit `processOutboxOnce` → `withTenant`) | tenant B consume of A’s event throws `not visible` | Pending CI | Partial |
| MT-REQ-007 | MT-SC-029 Domain + audit + outbox commit together | — | one transaction writes note + audit + outbox; all three visible after commit | — | Gap |
| MT-REQ-007 | MT-SC-030 Domain + audit + outbox roll back together | `outbox.integration.test.ts` — “rolls back outbox together with the domain write” | after forced error, outbox empty | Pending CI | Partial (only outbox written; no domain/audit in the failing tx) |
| MT-REQ-007 | MT-SC-031 Worker retries preserve tenant and correlation | — | retried job still bound to original tenant + correlation id | — | Gap |
| MT-REQ-008 | MT-SC-032 Sequential duplicate is idempotent | `outbox.integration.test.ts` — “writes domain audit and outbox atomically…” | second `processOutboxOnce` returns `duplicate` | Pending CI | Partial |
| MT-REQ-008 | MT-SC-033 Other tenant cannot consume | same test | `processOutboxOnce(tenantB, eventId)` throws / not visible | Pending CI | Partial |
| MT-REQ-008 | MT-SC-034 Concurrent workers do not double-apply | — | two workers, one `processed`, one `duplicate`; one receipt | — | Gap |
| MT-REQ-008 | MT-SC-035 Lost ACK then retry is idempotent | — | receipt exists; retry returns `duplicate` and does not re-apply | — | Gap |
| MT-REQ-008 | MT-SC-036 Retry limit / exhaustion does not switch tenant | — | exhausted event remains in tenant A; B cannot process it | — | Gap |
| MT-REQ-009 | MT-SC-037 Other-tenant list is empty | `isolation.integration.test.ts` — “hides other-tenant rows…” | tenant B `select notes` equals `[]` | Pending CI | Partial |
| MT-REQ-009 | MT-SC-038 Get-by-id does not leak other tenant | — | select by A’s id in B returns empty; error text has no A payload | — | Gap |
| MT-REQ-009 | MT-SC-039 Aggregates do not include other tenant | — | count/sum in B ignores A rows | — | Gap |
| MT-REQ-009 | MT-SC-040 Audit of A hidden from B | — | B cannot read A’s `audit_records` | — | Gap |
| MT-REQ-009 | MT-SC-041 Errors/logs do not disclose payloads, tokens, or emails | — | worker/UoW errors have no payload/PII/other-tenant ids | — | Gap |
| MT-REQ-010 | MT-SC-042 Fixtures: two tenants, two+ centers | `harness.ts` setup (used by tests; no dedicated assertion) | tenants A/B; centers A1, A2, B1 inserted | Pending CI | Partial (`centerA2` unused by tests) |
| MT-REQ-010 | MT-SC-043 Repeatable negatives across tenants and centers | — | negative cases run with A1 and A2 and tenant B | — | Gap |
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

## Counts (this PR head)

| Coverage | Rows |
|---|---|
| Partial | 12 |
| Gap | 31 |
| Deferred (Option B) | 8 |
| Excluded (product) | 3 |

Closing `MT-SPIKE-001` requires replacing every `Gap` with an executable test and evidence. `Partial` rows must be strengthened until the assertion matches the criterion. `Deferred` rows do not block this spike; they block declaring the reusable baseline fully adopted.

Update paths with immutable commit references during execution.
