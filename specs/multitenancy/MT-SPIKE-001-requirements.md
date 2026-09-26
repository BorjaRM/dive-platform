# MT-SPIKE-001 — Requirements

- **Status:** Draft

- **MT-REQ-001:** Every tenant-owned row has a non-null tenant key.
- **MT-REQ-002:** Every tenant-owned operation runs under explicit authorized tenant context.
- **MT-REQ-003:** Cross-tenant relationships are rejected by constraints.
- **MT-REQ-004:** Runtime database role has forced RLS, no BYPASSRLS, and no DDL.
- **MT-REQ-005:** Tenant context is transaction-local and cleared before pooled connection reuse.
- **MT-REQ-006:** Operations without valid tenant context fail closed.
- **MT-REQ-007:** Async work propagates tenant and correlation identifiers.
- **MT-REQ-008:** Outbox processing is idempotent and cannot act in another tenant context.
- **MT-REQ-009:** Audit and errors do not disclose another tenant data.
- **MT-REQ-010:** Reproducible evidence uses at least two tenants and two centers.

## Completion rule

Every requirement must map to at least one executable test or an explicitly reviewed non-executable validation, plus evidence in `results.md` or the referenced evidence directory.
