# MT-SPIKE-001 — Cross-cutting multi-tenant isolation validation

- **Status:** Draft
- **Hypothesis:** A non-null tenant key, tenant-aware constraints, forced RLS, explicit transaction-local context, and tenant-aware async processing can prevent cross-tenant access without dedicated databases.

## Question

Can the shared PostgreSQL architecture preserve tenant isolation across HTTP, transactions, pooled connections, RLS, audit, outbox, and workers?

## Scope

Cross-cutting isolation only. Product booking capacity and widget behavior are excluded.

## Method

Implement the smallest representative slice, execute deterministic positive and negative scenarios against real infrastructure where applicable, record commands and environment, and store reproducible evidence without real personal data.

## Required scenarios

1. Authorized reads and writes succeed inside tenant and center scope.
2. Cross-tenant identifiers and relationships are rejected by application and database controls.
3. Runtime role cannot bypass RLS or execute DDL.
4. Pooled connections do not retain tenant context between requests.
5. Missing or invalid context fails closed.
6. Outbox, worker, and audit preserve tenant and correlation context.
7. At least two tenants and two centers are used in repeatable negative tests.

## Dependencies

- specs/foundation/multitenancy-architecture.md
- specs/multitenancy/adoption-profile.md
- specs/architecture/adrs/ADR-DIVE-001.md
- specs/architecture/adrs/ADR-DIVE-002.md

## Closure outcomes

`Accepted`, `Accepted with conditions`, `Requires modification`, or `Rejected`. A conclusion requires committed tests and reproducible evidence; this document alone is not evidence.
