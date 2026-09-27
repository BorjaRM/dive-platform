# ADR-DIVE-008 — Internal tenant-scoped dashboard context

- **Status:** Draft
- **Version:** 0.1
- **Date:** 2026-09-27
- **Deciders:** Product / Security / Architecture
- **Affected IDs:** `DIVE-IAM-REQ-001..006`, `016`, `022`, `024`, `028`; `MT-REQ-002`, `006`, `009`

## Provenance

| Decision | Provenance | Exact source | Status |
|---|---|---|---|
| Clerk authenticates identity; PostgreSQL owns memberships, roles, permissions, and center scopes | `Documented` | `SPEC-DIVE-IAM-001` `DIVE-IAM-REQ-001..006`; ADR-DIVE-001 | Existing normative constraint |
| One identity may belong to several tenants; the operator is the tenant and center/base is operational scope | `Documented` | `DIVE-IAM-REQ-002`; ADR-DIVE-001 | Existing normative constraint |
| Revocation must prevent further authorized calls and ordinary revocation takes effect within five minutes | `Documented` | `DIVE-IAM-REQ-016`, `DIVE-IAM-REQ-022` | Existing normative constraint |
| Replace tenant identifiers in dashboard API paths with an internal tenant-scoped context credential | `Proposed` | Product direction requested by Borja on 2026-09-27; constrained by `DIVE-IAM-REQ-006` | Pending approval and merge |
| Automatically select the tenant when exactly one active membership is available | `Proposed` | Product discussion on 2026-09-27 | Pending approval and merge |
| Keep roles, permissions, and center scopes out of the context credential and resolve current authorization from PostgreSQL | `Derived` | `DIVE-IAM-REQ-003`, `004`, `016`, `022`; multitenancy baseline §5 | Pending approval and merge |

This ADR remains Draft. The proposed decisions are non-normative until approved and merged. It does not promote or rewrite `SPEC-DIVE-IAM-001`.

## Context

The current IAM/API vertical authenticates a Clerk session token and receives `tenantId` in dashboard route paths. The service then resolves the identity–tenant membership and establishes authorized transaction-local tenant context.

The product direction is to remove tenant identifiers from dashboard API paths while keeping Clerk limited to identity authentication and PostgreSQL authoritative for product authorization. The solution must preserve multi-tenant isolation, multi-center scopes, revocation, non-disclosing failures, and identities that belong to several operators.

This decision applies to authenticated dashboard traffic. It does not change public widget, hosted-page, or booking-specific capability authorization defined by ADR-DIVE-005 and `SPEC-DIVE-BOOKING-001`.

## Proposed decision

### Responsibility split

- Clerk continues to authenticate the external session and produce the provider-neutral identity assertion.
- PostgreSQL continues to own internal identity, tenant memberships, membership state, roles, permissions, and authorized centers.
- After authenticating the Clerk session, the backend may issue an internal tenant-scoped context credential only after validating an active membership for the same identity and tenant.
- The context credential selects a tenant; it is not sufficient authorization by itself.
- A context credential is bound to the authenticated identity and cannot be replayed with another identity.
- Dashboard API paths do not carry `tenantId` after the replacement contract is approved and implemented.

### Operator selection

- With no active tenant membership, no dashboard tenant context is issued.
- With exactly one active tenant membership, the backend may select it automatically without displaying an operator chooser.
- With more than one active tenant membership, the user selects from a server-produced list of memberships available to the authenticated identity.
- Any operator reference submitted by a client is treated as untrusted input and is revalidated before context issuance.
- Missing, inactive, unrelated, malformed, or cross-identity selections fail with the existing non-disclosing authorization behavior.

The exact endpoint names, request shapes, and whether operator references are internal IDs or opaque references remain open.

### Multi-center organizations

- A context credential is tenant-scoped, not center-scoped.
- An operator with several centers still uses one tenant context.
- Each center-scoped operation validates that the center belongs to the selected tenant and is within the membership’s current authorized center scopes.
- Center identifiers remain resource selectors and never authorize access by themselves.
- Tenant-wide roles may operate across centers only as already allowed by `SPEC-DIVE-IAM-001`.

### Authorization and revocation

- Every protected dashboard request continues to authenticate the Clerk session.
- The tenant context is resolved from the internal context credential, not from an arbitrary tenant field or dashboard route segment.
- The application resolves current membership status, roles, permissions, center scopes, resource, and resource state from authoritative internal data before allowing the operation.
- The initial implementation keeps request-time membership validation, matching the current IAM vertical and applying membership disablement on the next request.
- A future measured optimization may reduce repeated database work only if it still satisfies `DIVE-IAM-REQ-016` and `DIVE-IAM-REQ-022`; this ADR does not authorize a cache, cache TTL, or stale-authorization default.
- Missing, invalid, expired, revoked, identity-mismatched, or otherwise unusable context credentials fail closed without disclosing another tenant, membership, or resource.

### Credential contents and authority

The credential must not make client-visible claims authoritative for:

- roles;
- permissions;
- center scopes;
- membership state;
- resource state.

Whether the credential is an opaque server-side handle or a signed internal token remains open. Its transport, lifetime, rotation, storage, and revocation representation also remain open and must be approved before implementation.

### Public widget and hosted page

Public channels do not use this dashboard credential:

- published channel configuration resolves tenant, center, allowed offering scope, publication state, and origin policy server-side;
- public users receive no dashboard membership or role;
- booking confirmation-read and cancellation continue to use separate purpose-limited credentials under ADR-DIVE-005.

## Performance notes

The current API already resolves membership and authorization context for each exposed dashboard request. Keeping request-time validation therefore preserves the current security path rather than adding a new authorization round trip to those operations.

The proposed operator-list and context-issuance calls add work when a dashboard context is established or changed, not for widget traffic. Before changing request-time validation, implementation evidence must measure the actual query path, indexes, API latency, and connection-pool impact. No numeric latency budget or cache TTL is introduced here.

## Security and isolation consequences

- Removing `tenantId` from a path does not remove the requirement for explicit authorized tenant context.
- Context issuance and use require negative tests with at least two tenants, two centers, unrelated identities, inactive memberships, and identity/context mismatch.
- The persistence unit of work still receives an already-authorized tenant identifier and establishes transaction-local RLS context.
- No application or context-resolution path may use an RLS bypass or a migration role.
- Logs and audit may include a safe tenant identifier when required but must not record bearer credentials.

## Compatibility and rollout

A migration plan is required before replacing existing routes. The following remain open:

1. whether old tenant-path routes coexist temporarily or are replaced atomically;
2. how existing clients discover and select operators;
3. context transport and browser storage;
4. behavior across tabs and simultaneous tenant contexts;
5. context invalidation on Clerk logout, session expiry, membership disable, and role/scope change.

No compatibility default is selected by this Draft ADR.

## Expected validation

Implementation must demonstrate:

- zero memberships issues no tenant context;
- one active membership can be selected automatically;
- multiple memberships require an explicit valid selection;
- fabricated, unrelated, inactive, and cross-identity selections issue no context;
- a context for tenant A cannot read or mutate tenant B;
- a center outside the current membership scope is denied;
- membership disable, Clerk logout, and session expiry prevent further authorized calls within the existing requirements;
- context credentials cannot be replayed by another identity;
- public widget and hosted-page flows remain independent of dashboard credentials;
- pooled connections retain no tenant context after commit, rollback, or failure.

Tests must link the relevant `DIVE-IAM-REQ-*` and existing `MT-SC-*` rows without merging product and multitenancy evidence.

## Open questions requiring approval

1. Opaque server-side handle or signed internal token?
2. Header, secure cookie, or another transport?
3. Credential lifetime, renewal, and rotation?
4. Server-side revocation representation and cleanup?
5. One simultaneous tenant context per browser session or several independent contexts?
6. Exact operator-list, selection, context-issuance, and context-revocation API contracts?
7. Backward-compatible migration or immediate route replacement?
8. What measured performance evidence is required before considering authorization caching?

## Alternatives considered

### Active Clerk Organization

Not selected for this proposal. It would duplicate or synchronize organization membership with the PostgreSQL membership and invitation model and increase dependence on the identity provider. Clerk remains the identity adapter.

### Tenant identifier in every dashboard route

Current implementation. It keeps the requested tenant explicit but is not required by the existing IAM invariants when an equivalent server-authorized context exists.

### Infer tenant from each resource

Rejected as the general mechanism because list/create operations have no existing resource, resolution can complicate RLS establishment, and lookup behavior can create cross-tenant disclosure risk.

## Approval gate

Before implementation, Product / Security / Architecture must approve the proposed decision and close or explicitly defer the open questions that affect the API and security contract. After approval, update `SPEC-DIVE-IAM-001`, TRACE relationships, tests, and the route migration plan before changing the public dashboard API contract.
