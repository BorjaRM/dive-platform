# REL-01 PostgreSQL operational limits

## Scope

The API runtime pool now requires explicit environment-owned values for pool
size, connection acquisition, statement execution, lock waits, and idle
transactions. The values in `.env.example` are synthetic local examples marked
`Proposed`; they are not production approvals or SLOs.

## Executable evidence

Test: `packages/database/test/integration/operability.integration.test.ts`

- PostgreSQL reports the configured `statement_timeout`, `lock_timeout`, and
  `idle_in_transaction_session_timeout` values.
- A saturated pool with `max: 1` rejects a second checkout within the configured
  connection timeout.
- `statement_timeout` cancels `pg_sleep` with SQLSTATE `57014`.
- `lock_timeout` cancels a real row-lock contention with SQLSTATE `55P03`.
- `idle_in_transaction_session_timeout` terminates the idle session, and the
  test handles the destroyed client rather than returning it for reuse.

Focused command:

```text
pnpm --filter @dive-center/database exec node --env-file=../../.env.example ./node_modules/vitest/vitest.mjs run --config vitest.config.ts test/integration/operability.integration.test.ts
```

Observed result: 1 test file, 5 tests passed locally against synthetic
PostgreSQL 18. No CI, production database, load, or browser evidence is
claimed.

## Known gaps

- `APP_DATABASE_*` values require operational approval per environment before
  production use.
- `@dive-center/observability` has no metrics API yet, so pool wait, usage, and
  saturation metrics are not implemented.
- This evidence demonstrates the current `pg` pool behavior; it does not define
  a production SLO or a workload capacity limit.