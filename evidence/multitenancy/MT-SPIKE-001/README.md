# MT-SPIKE-001 Isolation Evidence

This record maps the application audit findings `DATA-01`, `DATA-02`, and
`DATA-03` to executable PostgreSQL checks. `MT-REQ-*` results remain separate
from product `DIVE-*` results.

## Executable mapping

| Isolation category | Requirements | Executable test | Passing assertion | Audit finding / status |
|---|---|---|---|---|
| Same-tenant access | `MT-REQ-001`, `MT-REQ-002`, `MT-REQ-010` | `packages/database/test/integration/isolation.integration.test.ts` — `allows authorized writes and reads inside tenant and center scope`; `authorization.integration.test.ts` — `creates tenant context only after identity-tenant membership is validated` | Tenant A can insert and read its own row through the tenant-scoped Drizzle unit of work; the fixture uses tenants A/B and centers A1/A2/B1 | Baseline control exercised; supports `DATA-01` and `DATA-02` preconditions |
| Cross-tenant access | `MT-REQ-003`, `MT-REQ-009`, `MT-REQ-010` | `isolation.integration.test.ts` — `rejects cross-tenant center relationships`, `hides other-tenant rows and does not disclose them`; `authorization.integration.test.ts` — `rejects identities without membership in the requested tenant`; `iam-api.integration.test.ts` — `constrains the non-forced tenant-context table through privileged commands` | Cross-tenant insert/update/relation attempts fail; tenant B gets empty list/get/aggregate/audit results for tenant A data and cannot mutate it; an identity cannot issue or resolve another identity's tenant context | `DATA-01` remains an explicit RLS exception for `iam_app.tenant_contexts`; the representative harness proves the compensating command boundary but not literal forced-RLS conformance |
| Missing or invalid context | `MT-REQ-006` | `isolation.integration.test.ts` — `fails closed without tenant context`, `fails closed with malformed or unknown tenant context`, `rejects spoofed tenant changes`; `drizzle.integration.test.ts` — `fails closed for Drizzle queries outside the unit of work` | `SELECT`, `INSERT`, `UPDATE`, and `DELETE` without context fail; empty/malformed/unknown context cannot read or insert; a spoofed row tenant key is rejected | Confirms fail-closed behavior relevant to `DATA-01`; not HTTP evidence |
| Pool reset | `MT-REQ-005` | `pooling.integration.test.ts` — `clears transaction-local tenant context before pool reuse`, `clears tenant context and writes after rollback`, `alternates tenants repeatedly on the same physical connection`, `clears context after a SQL error aborts the transaction`, `destroys the client when rollback itself fails`; `authorization.integration.test.ts` — `clears bootstrap tenant context before pooled connection reuse` | Pool size 1 / same `pg_backend_pid()` observes no context after commit, rollback, or SQL error, alternates A/B/A without residue, and receives a different PID after a forced rollback failure | `DATA-03` corrected: failed rollback destroys the client instead of returning it to the pool |
| Runtime role | `MT-REQ-004` | `packages/database/test/integration/roles.integration.test.ts` — restricted connection and negative role-snapshot cases | Runtime connection is accepted only when it is not the migration role, owner, superuser, `BYPASSRLS`, `CREATEDB`, `CREATEROLE`, or able to `CREATE` in the database/schema; unsafe snapshots are rejected | `DATA-02` implemented and tested; this does not resolve `DATA-01` or `DATA-03` |

## Finding status

| Finding | Executable evidence | Honest result |
|---|---|---|
| `DATA-01` — `tenant_contexts` is not forced RLS | `packages/database/test/integration/iam-api.integration.test.ts` records `relrowsecurity = true` and `relforcerowsecurity = false` for `iam_app.tenant_contexts`; direct app-role reads remain denied; the privileged-command test proves authorized A/B issuance, unauthorized issuance rejection, and cross-identity resolution denial | **Compensating control evidenced; literal `MT-REQ-004` remains unresolved.** The test proves the current owner/function boundary, but it does not prove forced RLS for this table |
| `DATA-02` — runtime role was not verified | `packages/database/test/integration/roles.integration.test.ts` plus API/database typechecks; the API database provider calls the preflight and closes the pool on failure | **Corrected.** The local integration suite passes the restricted-role check and all negative role conditions |
| `DATA-03` — rollback failure can return a bad client to the pool | `packages/database/test/integration/pooling.integration.test.ts` — `destroys the client when rollback itself fails`; shared `packages/database/src/transaction-lifecycle.ts` used by production and harness UoW | **Corrected.** A forced rollback failure preserves the original transaction error and the next pool checkout receives a different physical backend PID |

## Validation

### Automated checks

- `pnpm --filter @dive-center/database test:integration` — passed locally: 11 test files, 71 tests. The command loads synthetic values from `.env.example`; it is not a GitHub Actions result.
- `pnpm --filter @dive-center/api test` — passed locally: 18 test files, 358 tests.
- `CI=1 pnpm check` — passed locally: Biome clean and 17 workspace typecheck tasks successful.
- `git diff --check` — passed with no whitespace errors.

### Focused tests

- Same-tenant, cross-tenant, missing-context, Drizzle-boundary, IAM command-boundary, and pool-reset proof lives under `packages/database/test/integration/` in `isolation.integration.test.ts`, `authorization.integration.test.ts`, `iam-api.integration.test.ts`, `drizzle.integration.test.ts`, and `pooling.integration.test.ts`.
- The focused pool command passes 5 tests, including forced rollback failure and physical client replacement.
- Runtime-role proof for `DATA-02` is in `roles.integration.test.ts`.
- Requirement-level scenario mapping remains in `specs/multitenancy/MT-SPIKE-001-traceability.md`; this file adds the audit-finding mapping and current local evidence.

### Manual validation

None performed. No browser, HTTP, external-worker, or production-database validation is claimed by this record.

### Evidence and known gaps

- No new CI run URL is recorded for this worktree. Existing CI links in `MT-SPIKE-001-results.md` refer to the earlier spike commit and must not be read as proof of the current remediation commit.
- `DATA-01` now has executable proof for the current `tenant_contexts` owner/function boundary, but still requires an approved SDD decision before literal forced-RLS conformance can be claimed.
- HTTP/API boundary isolation, worker delivery, cache/files/search/export/deletion/restore, support access, and noisy-neighbor limits remain conditional or deferred under `MT-SPIKE-001`.
