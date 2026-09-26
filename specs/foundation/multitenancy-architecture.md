# Multitenancy architecture — reusable SaaS pattern (baseline)

## Purpose

Provide a reusable multitenant architecture pattern independent from a specific business domain.

## Core invariants

- All tenant-owned data has a non-null tenant key.
- All tenant-owned operations run under an explicit, authorized tenant context.
- No cross-tenant relations are allowed.
- Tenant context must propagate end-to-end (sync + async).
- Async work must be tenant-aware and idempotent.
- RLS can be used as defense in depth (when using PostgreSQL shared DB/schema).

## Minimum evidence

- Negative tests for cross-tenant access
- Pooling/context reset tests
- Async/outbox correctness and idempotency tests