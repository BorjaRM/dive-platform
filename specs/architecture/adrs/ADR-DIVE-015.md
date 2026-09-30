# ADR-DIVE-015 — Separate trial availability from bootstrap and IAM

- **Status:** Draft
- **Version:** 0.1
- **Date:** 2026-09-30
- **Deciders:** Product / Security / Data / Backend Architecture
- **Affected IDs:** `DIVE-TRIAL-REQ-001..018`; `DIVE-ONB-REQ-001..019`; applicable `DIVE-IAM-REQ-*` authority and tenant-context requirements

## Provenance

| Decision | Provenance | Exact source | Approval / status |
|---|---|---|---|
| Bootstrap remains invite-only and PostgreSQL-authoritative | `Documented` | `SPEC-DIVE-ONBOARDING-001` `DIVE-ONB-REQ-001..019`; `ADR-DIVE-013` | Existing normative constraint |
| Trial duration is platform-configured and begins only after successful bootstrap | `Proposed` | [Issue #84](https://github.com/BorjaRM/dive-platform/issues/84) | Approved by product owner for Draft incorporation on 2026-09-30 |
| MVP trial requires no card and grants all otherwise available product capabilities | `Proposed` | Issue #84 decisions 3–5 | Approved by product owner for Draft incorporation on 2026-09-30 |
| Commercial availability remains separate from IAM, bootstrap authority, rollout flags, and future capability policy | `Proposed` | Issue #84 technical direction | Approved by product owner for Draft incorporation on 2026-09-30 |
| Expiry, conversion, extension, retention eligibility, and repeated-trial controls | `Proposed` | Issue #84 decisions 7–14 | Approved by product owner for Draft incorporation on 2026-09-30; privacy and implementation details remain open |
| Trial creation shares the bootstrap transaction | `Derived` | `SPEC-DIVE-ONBOARDING-001` `DIVE-ONB-REQ-012..013`; issue #84 start boundary | Approved by product owner for Draft incorporation; derivation requires SDD review |

## Context

The approved onboarding flow creates a tenant, first center, and initial Owner only for an explicitly invited identity. It intentionally excludes public signup, billing, plans, and payment data. A commercial trial must begin at successful bootstrap without turning Clerk, browser metadata, tenant roles, or the invitation itself into commercial authority.

The MVP grants all otherwise available product capabilities, but future commercial limits may vary. Encoding trial state in IAM roles or assuming that every active membership has commercial access would couple authentication and authorization to pricing policy. Conversely, building a generic entitlement platform before any limits are approved would invent scope and abstractions.

## Decision

### Authority boundaries

- PostgreSQL owns trial state, timing, conversion, and commercial availability.
- Clerk continues to own identity authentication and invitation delivery only.
- IAM continues to own membership, roles, permissions, tenant context, and center scope.
- Commercial availability is an additional server-side decision and never grants authorization by itself.
- Deployment flags, safety gates, artifact readiness, and worker activation remain independent controls.

### Bootstrap integration

- Authorized platform staff configure trial duration before bootstrap completes.
- Trial timing does not begin at issue, delivery, acceptance, sign-in, or partial setup.
- Successful bootstrap creates the trial in the same PostgreSQL transaction as tenant, first center, active Owner membership, invitation result, audit, and outbox persistence.
- Bootstrap rollback leaves no trial. Idempotent replay returns the same commercial result. Reissue does not create another trial.

### MVP capability policy

- An active MVP trial grants all product capabilities that are otherwise implemented, deployed, operationally enabled, and authorized.
- The first implementation must preserve a commercial-policy boundary, but it must not invent future limit types, quotas, packages, plugin systems, or a generic entitlement framework.
- A later normative revision must define enablement granularity, dependencies, disablement, historical access, public channels, jobs, failure behavior, and audit before the first limited capability is implemented.

### Expiry and conversion

- Expiry denies new business mutations and new external-effect requests without deleting existing tenant data.
- The Owner receives a restricted expired surface for status, activation contact, and rights requests. Export and deletion execution remain owned by a future rights/privacy contract.
- No automatic grace period is introduced. Extension and exceptional reactivation are explicit platform operations.
- Conversion is an internal platform operation until billing exists and preserves the existing tenant and data.
- Platform trial mutations require a dedicated non-tenant capability, reason, audit, and idempotency.
- Data is initially retained for 30 days after expiry, subject to legal/privacy validation. After that it may become eligible for a separate audited deletion process; expiry itself never deletes it.
- A second trial is never automatic.

### Deliberately unresolved

This ADR does not select duration units or bounds, persistence labels, API routes, events, error codes, rollout flags, notification schedules, rights execution, or handling of already-committed external effects at expiry. These remain the blocking questions in `SPEC-DIVE-TRIAL-001`.

## Consequences

### Positive

- Bootstrap, IAM, and commercial policy keep distinct authorities.
- Trial start is atomic with the tenant result and cannot drift from onboarding completion.
- MVP behavior stays simple while retaining a reviewed boundary for future limits.
- Conversion preserves tenant identity and data.

### Costs and risks

- Every protected business operation and effect-producing worker eventually needs a consistent commercial-availability check in addition to IAM.
- Expiry can conflict with effects committed immediately before the boundary; implementation is blocked until that policy is approved.
- Retention, export, and deletion require privacy/legal ownership before real data.
- A poorly placed commercial check could leak tenant state or be bypassed by alternate channels.

## Alternatives considered

### Use the Clerk invitation as the trial

Rejected. Invitation delivery and seven-day provider expiry are not the commercial trial, and Clerk is not product authority.

### Encode trial access in IAM roles or membership state

Rejected. Authentication and authorization remain independent from commercial availability; an active membership alone must not bypass an expired trial.

### Public signup with automatic trial

Rejected for current scope. The approved product remains invite-only.

### Require a card before bootstrap

Rejected for the MVP. The approved trial has no card or billing dependency.

### Build a generic entitlement framework now

Rejected. No limited capability or quota is approved yet. The design preserves the boundary without inventing an abstraction before demonstrated variation.

### Delete tenant data immediately at expiry

Rejected. Expiry preserves data and starts the approved retention direction; deletion requires a separate audited rights/privacy process.

## Acceptance criteria / evidence

This Draft grants no implementation authority. Before Ready-to-start promotion:

- all blocking questions in `SPEC-DIVE-TRIAL-001` are resolved with provenance and explicit approval;
- privacy/legal review validates retention and rights boundaries for real data;
- the exact persistence, API/event, error, rollout, expiry-worker, concurrency, idempotency, audit, and rollback contracts are defined;
- TRACE records the approved artifact status and expected coverage;
- implementation work is split into an issue with a Development Brief and exact Ready requirement IDs.
