# PERF-01 Catalog pagination and list indexes

## Scope

Catalog activity and slot lists retain the approved one-based offset contract
from `DIVE-BOOK-REQ-057`. Unsafe JavaScript offsets now return the existing
`422 validation_error` path. The catalog keeps the status-specific indexes and
adds separate temporal-order indexes for requests where `status` is omitted.

## Executable evidence

Focused commands:

```text
pnpm --filter @dive-center/api exec vitest run src/catalog/catalog.validation.spec.ts
pnpm --filter @dive-center/api typecheck
pnpm --filter @dive-center/database typecheck
pnpm --filter @dive-center/database exec node --env-file=../../.env.example ./node_modules/vitest/vitest.mjs run --config vitest.config.ts test/integration/migrations.integration.test.ts
pnpm db:migrate
```

Observed locally: catalog validation `4/4`, migration integration `7/7`, and
both API/database typechecks passed. The migration test verifies the four
catalog indexes and the temporal column order.

The pre-change plans used the status-prefixed indexes followed by `Sort` for
activity and slot lists without a status predicate. After migration, a plan
check with `enable_seqscan=off` selected
`activities_center_created_id_idx` and `slots_activity_starts_id_idx`; both
queries used the index order, with no `Sort` node.

## Known gaps

- The local booking tables do not contain representative catalog volume, so the
  normal planner chooses a sequential scan by cost. No production latency or
  capacity claim is made.
- A follow-up `EXPLAIN (ANALYZE, BUFFERS)` with approved synthetic data is still
  required to measure deep-page behavior and compare the status/no-status
  variants. Cursor pagination remains outside this correction.