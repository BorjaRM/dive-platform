# Multitenancy architecture — reusable SaaS pattern (baseline)

- **Status:** Ready to start
- **Version:** 0.2

## Purpose

Reusable multi-tenant architecture independent of a business domain. Each product completes it with an adoption profile. This document does not choose the product’s tenant entity, roles, SLO, or legal basis.

## 1. Objectives

- Prevent access and relations between tenants, including under application bugs
- Keep tenant context end-to-end: request, transaction, event, job, cache, file, search, and audit
- Separate tenant from operational scopes
- Allow the same pattern in different products via configuration and documented decisions
- Keep an evolution path to partitioning, dedicated databases, or regions without introducing that complexity early

## 2. Concepts

| Concept | Definition |
|---|---|
| Tenant | Primary boundary of ownership, isolation, and data administration |
| Operational scope | Internal subdivision used for authorization or operations; it does not replace the tenant |
| Identity | Authenticated principal that may access one or more tenants |
| Access | Relationship between an identity and a tenant, with roles, permissions, and scopes |
| Global data | Platform-owned or shared data that does not belong to a tenant |
| Tenant-owned data | Data whose logical owner is exactly one tenant |
| Tenant context | Authorized identifier and metadata required to run an operation inside a tenant |
| Adoption profile | Concrete decisions through which a product applies this pattern |

## 3. Decisions each solution must declare

1. What entity is the tenant, and why
2. Which operational scopes exist and what they limit
3. Whether an identity may access several tenants
4. Which data are global, tenant-owned, or derived
5. Persistence model: shared, schema-per-tenant, database-per-tenant, or hybrid
6. How tenant context is obtained and validated on each entry channel
7. Which processes run without an interactive session and how they receive context
8. Residency, retention, export, deletion, and recovery requirements
9. Limits that prevent one tenant from degrading others
10. Evidence that demonstrates isolation

The tenant identifier received from a client is never sufficient to authorize an operation. It must be resolved or validated against identity, session, and internal assignments.

## 4. Normative invariants

- Every tenant-owned datum includes a non-null tenant key
- Every operation on tenant-owned data runs with explicit authorized tenant context
- A relation between two tenant-owned records is valid only if both belong to the same tenant
- Business authorization and data isolation are complementary; neither replaces the other
- Tenant context does not accidentally survive the unit of work that established it
- No event, job, cache, file, search index, export, or audit record processes tenant-owned data without preserving tenant
- Global data is classified explicitly; missing tenant key does not imply global data
- Privileged platform access is temporary, minimal, justified, and audited
- Errors do not reveal existence of another tenant’s resources
- Every exception is documented with scope, risk, owner, expiry, and compensating control

## 5. Identity, access, and authorization

Authentication establishes who acts; it does not by itself determine the tenant.

Recommended flow:

1. Validate session or credential
2. Resolve a stable internal identity
3. Check the active relationship with the requested or inferred tenant
4. Compute internal roles, permissions, and scopes
5. Create an immutable authorization context for the operation
6. Propagate only the minimum data needed to application and persistence

Product roles remain under product control even when authentication is delegated.

## 6. Persistence strategies

| Strategy | Use |
|---|---|
| Shared database and schema | Common initial option; requires strict controls |
| Schema per tenant | Extra logical separation; heavier migrations |
| Database per tenant | Higher isolation; high operational cost |
| Hybrid | Evolution by size, region, or regulation |

This pattern does not mandate one topology. It mandates the same invariants of context, authorization, traceability, and verification.

## 7. PostgreSQL shared-schema reference profile

When using a shared database and schema:

- Each tenant-owned table has a non-null tenant column
- Unique keys and frequent indexes include the tenant key when uniqueness or access is per tenant
- Relations between tenant-owned tables use composite foreign keys or an equivalent guarantee against cross-tenant references
- RLS is defense in depth in addition to repositories and use cases
- The application role is not table owner, has no `BYPASSRLS`, and is not the migrations role
- Policies are forced for the table owner when applicable
- Tenant context is set inside the transaction with a transaction-local mechanism
- Use cases receive a restricted unit of work, not a global connection without context
- Native SQL is valid when it improves constraints, RLS, locking, indexes, or clarity, if versioned, reviewable, and tested

```ts
await unitOfWork.withTenant(authorizedTenantId, async (tx) => {
  await repository.execute(tx, command)
  await audit.append(tx, auditEntry)
  await outbox.append(tx, event)
})
```

## 8. Pooling and context lifecycle

- Set context after opening the transaction and before any tenant-owned query
- Limit it to the transaction; do not use persistent session state on reusable connections
- Always commit or roll back before returning the connection to the pool
- Fail closed when context is missing
- Test reuse of the same connection while alternating tenants
- Avoid APIs that accidentally run a tenant-owned query outside the unit of work

## 9. Async processes and integrations

Every tenant-owned message or job includes a validatable tenant identifier and an idempotency identifier.

- Producer records tenant from authorized context, not from untrusted data
- Consumer rebuilds a tenant-aware unit of work before read or write
- Domain events, outbox, dead-letter, and retries preserve tenant
- Consumers are idempotent and apply retry limits and backoff
- Inbound webhooks resolve tenant via internal secure configuration
- Outbound webhooks, exports, and reports do not mix tenants unless explicit authorized aggregation

## 10. Cache, files, search, and derived data

- Cache keys include tenant and data-contract version
- File paths or metadata include tenant and are validated before issuing an access URL
- Search indexes keep tenant as a mandatory filter not controlled by the client
- Projections and analytics keep lineage and deletion rules
- Invalidation, export, and deletion cover originals and derived data
- Globally unique identifiers are not an isolation control

## 11. Observability, audit, and support

- Logs and traces include a safe tenant identifier when needed, avoiding unnecessary PII
- Per-tenant metrics are aggregated and protected against high cardinality
- Audit records actor, tenant, action, resource, result, reason, time, and correlation ID
- Support access requires temporary elevation, purpose, duration, and later review
- Global administrative queries use separate paths and explicit permissions; they do not silently disable ordinary isolation

## 12. Performance and noisy neighbor

- Quotas, rate limits, pagination, and timeouts per tenant or plan
- Concurrency limits for jobs, exports, and expensive operations
- Indexes compatible with tenant-scoped access
- Resource budgets and alerts
- Prioritization and circuit breakers on shared dependencies
- Ability to route specific tenants to dedicated resources for a measured reason

## 13. Backups, recovery, export, and deletion

Global restore and logical tenant recovery are different capabilities.

Selective recovery:

1. Restore the backup in an isolated environment
2. Identify the full graph of tenant data and derived stores
3. Validate relations, counts, and point in time
4. Reconcile later changes with a documented strategy
5. Replay events idempotently
6. Audit and review

Export and deletion must include primary data, derived data, files, caches, indexes, queues, and the defined treatment of backups and audit.

## 14. Minimum test strategy

Isolation, pooling, and transaction tests run against the real technology that enforces the control. Mocks do not prove these properties.

Required categories: cross-tenant CRUD, missing context, spoofed tenant key, cross-tenant relations, non-leaking errors, connection reuse alternating tenants, rollback without residual context, atomic business+audit+outbox, jobs/events/cache/files/search/export, retries and idempotency, support access expiry, uneven load, global restore, export/deletion, migrations that do not weaken controls.

## 15. Evidence and acceptance

A product may declare this pattern adopted when:

- An approved adoption profile exists
- Data categories are classified
- Sync and async paths preserve tenant context
- Persistence controls are implemented with separate roles
- Negative and pooling tests pass in integration
- Export, deletion, restore, and support have documented procedures
- Exceptions are registered and owned
- Traceability exists from requirements to evidence

## 16. Limits

This document does not define a product’s tenant, roles, domain, SLO, legal basis, or commercial strategy. It does not require PostgreSQL, RLS, or shared topology. Those decisions belong to the adoption profile and product ADRs. What is mandatory is keeping the invariants and providing equivalent evidence.
