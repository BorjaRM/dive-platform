---
name: tenant-isolation-invariants
description: Enforce tenant isolation (tenant_id, RLS, cross-tenant tests) without inventing MT rules. Use when implementing or reviewing apps/api, packages/database, SQL, repositories, RLS, tenant_id, outbox on tenant-owned data, apps/web tenant/center resolution, or any change that could leak data across operators.
---

# Tenant isolation invariants

Do not invent isolation rules, TTLs, RLS policy text, or new `MT-REQ-*` IDs. Read the sources. A missing decision blocks implementation; a missing control with an established contract is an in-scope repair, not permission to ship without it. In a read-only review, report the defect without editing.

This skill does not merge Backend with Tenancy. Implementers apply it; Tenancy remains the specialist for leaks, RLS design, and `MT-REQ-*`.

## Sources (read, do not paraphrase)

- `specs/architecture/adrs/ADR-DIVE-001.md`
- `specs/foundation/multitenancy-architecture.md`
- `specs/multitenancy/MT-SPIKE-001-requirements.md`
- Existing executable harness: `packages/database/test/integration/`, `pnpm test:integration`. The directories `tests/integration/multitenancy/` and `tests/integration/rls/` are TRACE pointers, not additional test suites.

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
   Put guarantees owned by shared database primitives in product-level contract suites, not only in the feature that first needs them. Keep a complete product inventory for tenant columns, protected RLS relations, policies, and runtime-executable privileged functions. Test the product unit of work across commit, rollback, SQL failure, and pooled tenant alternation. Test every low-level command that deliberately compares an explicit tenant with transaction-local context through a shared mismatch contract. Feature suites still prove their own authorization, relationships, atomic domain effects, and public behavior.
   When adding a tenant-owned table, RLS policy, runtime-executable database function, tenant-scoped unit-of-work primitive, or explicit-tenant SQL command, update the applicable product-level contract in the same change. A representative harness table or another feature's test is not proof for a new product relation or command.
6. Extend the existing tests and tenant-scoped primitives within the authorized scope. If the tests cannot be written or no established primitive supports the path, pause the affected slice and state the gap. Backend/Frontend may delegate a bounded investigation to Tenancy under `.github/agents/README.md`; a change of active agent requires a reason and confirmed handoff. A delegated specialist returns the blocker to its caller, without nested delegation or a handoff.
7. Never grant `BYPASSRLS`, use the migration role as the app role, or disable RLS temporarily (`MT-REQ-004`).

## Exit criteria

- In-scope persistence/query changes include the tests in step 5, or the slice was not implemented
- Shared product invariants are covered by product-level contract suites; feature tests do not carry global guarantees alone
- `MT-REQ-*` IDs listed separately from `DIVE-*`
- Residual isolation risks recorded; no silent bypass

## Stop

The following block declaring the slice complete. Repair them only within an authorized implementation task against existing requirements, or report them in a review. Missing decisions require a concrete question; missing proof remains an explicit gap.

- Possible cross-tenant leak or pool-context leak
- Query, repository, or table change without `tenant_id` / RLS / the tests in step 5
- Public widget/page trusting browser `tenant_id` / center / activity
