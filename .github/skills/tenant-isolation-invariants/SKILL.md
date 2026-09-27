---
name: tenant-isolation-invariants
description: Enforce tenant isolation (tenant_id, RLS, cross-tenant tests) without inventing MT rules. Use when implementing or reviewing apps/api, packages/db, SQL, repositories, RLS, tenant_id, outbox on tenant-owned data, apps/web tenant/center resolution, or any change that could leak data across operators.
---

# Tenant isolation invariants

Do not invent isolation rules, TTLs, RLS policy text, or new `MT-REQ-*` IDs. Read the sources. If a control is missing, stop and record an open question.

This skill does not merge Backend/API Implementer with Tenancy and Data Isolation Engineer. Implementers apply it; Tenancy remains the specialist for leaks, RLS design, and `MT-REQ-*`.

## Sources (read, do not paraphrase)

- `specs/architecture/adrs/ADR-DIVE-001.md`
- `specs/foundation/multitenancy-architecture.md`
- `specs/multitenancy/MT-SPIKE-001-requirements.md`
- Existing harness: `tests/integration/multitenancy/**`, `tests/integration/rls/**`, `pnpm test:integration`

Keep `MT-REQ-*` results separate from `DIVE-*`.

## When this skill is in scope

A change is in scope if it touches any of: SQL, Drizzle schema, repositories, `tenant_id`, RLS, new tenant-owned tables, query filters, outbox/audit on tenant-owned data, pooled connections, or browser/channel resolution of tenant/center/activity.

## Procedure

1. Identify tenant-owned data vs operational scope (center/base). Center is not a tenant (`ADR-DIVE-001`).
2. Confirm tenant context is explicit and already authorized at application, repository, and transaction boundaries. Never recover it from arbitrary request data, mutable global state, or client-supplied tenant/center/activity (`MT-REQ-002`).
3. Do not ship a query filter as the only control. Prefer existing constraints and RLS; application checks are for clear failures (`MT-REQ-001`, `MT-REQ-003`, `MT-REQ-004`, `MT-REQ-006`).
4. Keep transaction-scoped tenant context on the same connection for the full operation, including outbox writes (`MT-REQ-005`, `MT-REQ-007`, `MT-REQ-008`).
5. Add or extend executable tests in the same PR, using at least two tenants (`MT-REQ-010`). Through public data-access behavior, cover:
   - permitted same-tenant access
   - denied cross-tenant access
   - missing / empty / malformed context fails closed
   - pooled-connection context reset
6. If those tests cannot be written, or the path has no established tenant-scoped primitive, **stop**. Do not implement the persistence/query slice. Offer a VS Code handoff to Tenancy and Data Isolation Engineer.
7. Never grant `BYPASSRLS`, use the migration role as the app role, or disable RLS temporarily (`MT-REQ-004`).

## Exit criteria

- In-scope persistence/query changes include the tests in step 5, or the slice was not implemented
- `MT-REQ-*` IDs listed separately from `DIVE-*`
- Residual isolation risks recorded; no silent bypass

## Stop

- Possible cross-tenant leak or pool-context leak
- Query, repository, or table change without `tenant_id` / RLS / the tests in step 5
- Public widget/page trusting browser `tenant_id` / center / activity
