# SPEC-DIVE-TRIAL-001 — Configurable trial access

- **Status:** Draft
- **Version:** 0.1
- **Owner:** Product / Security / Data / Backend Architecture
- **Last reviewed:** 2026-09-30
- **Approved by:** Product owner for Draft incorporation
- **Approval reference:** [Issue #84](https://github.com/BorjaRM/dive-platform/issues/84) and product-owner confirmation on 2026-09-30
- **IDs:** `DIVE-TRIAL-REQ-001` … `DIVE-TRIAL-REQ-018`

## Normative authority

This Draft SPEC owns the proposed commercial trial lifecycle after an invited Owner completes `SPEC-DIVE-ONBOARDING-001`. It does not redefine authentication, membership, tenant authorization, bootstrap invitation delivery, billing, payments, privacy rights, or deletion execution.

`SPEC-DIVE-ONBOARDING-001` and `ADR-DIVE-013` remain authoritative for invite-only bootstrap. `SPEC-DIVE-IAM-001` remains authoritative for identity, membership, roles, permissions, and tenant context. A future rights/privacy contract must own export and deletion execution.

This document is not implementation authority while it remains Draft.

## Provenance policy

Every requirement below declares its provenance and exact source. `Proposed` items were approved by the product owner for incorporation into this Draft, but the artifact has not been promoted to Ready to start.

## Requirement provenance

| Requirement IDs | Provenance | Exact source | Decision status |
|---|---|---|---|
| `DIVE-TRIAL-REQ-001` | `Documented` | `SPEC-DIVE-ONBOARDING-001` `DIVE-ONB-REQ-001`; `ADR-DIVE-013` § Public signup | Existing normative constraint |
| `DIVE-TRIAL-REQ-002` | `Derived` | `SPEC-DIVE-ONBOARDING-001` `DIVE-ONB-REQ-002`, `004`; `SPEC-DIVE-IAM-001` authority boundary; [issue #84](https://github.com/BorjaRM/dive-platform/issues/84) | Approved by product owner for Draft incorporation on 2026-09-30 |
| `DIVE-TRIAL-REQ-003..DIVE-TRIAL-REQ-004` | `Proposed` | [Issue #84](https://github.com/BorjaRM/dive-platform/issues/84) § Decisiones de producto aprobadas | Approved by product owner for Draft incorporation on 2026-09-30 |
| `DIVE-TRIAL-REQ-005..DIVE-TRIAL-REQ-006` | `Derived` | `SPEC-DIVE-ONBOARDING-001` `DIVE-ONB-REQ-012..013`, `018..019`; [issue #84](https://github.com/BorjaRM/dive-platform/issues/84) | Approved by product owner for Draft incorporation on 2026-09-30 |
| `DIVE-TRIAL-REQ-007..DIVE-TRIAL-REQ-010` | `Proposed` | [Issue #84](https://github.com/BorjaRM/dive-platform/issues/84) decisions 3–5, 7, 12 | Approved by product owner for Draft incorporation on 2026-09-30 |
| `DIVE-TRIAL-REQ-011` | `Derived` | [Issue #84](https://github.com/BorjaRM/dive-platform/issues/84) decision 7; `TRACE-DIVE-MVP-001` § Baseline channels deferred from MT-SPIKE-001 | Approved direction with execution explicitly deferred |
| `DIVE-TRIAL-REQ-012..DIVE-TRIAL-REQ-018` | `Proposed` | [Issue #84](https://github.com/BorjaRM/dive-platform/issues/84) decisions 8–14; `specs/product/dive-mvp-profile.md` § Before real personal data or pilot for `DIVE-TRIAL-REQ-016` | Approved by product owner for Draft incorporation on 2026-09-30; privacy validation still required |

## Goal

Allow an explicitly invited dive operator to use the available MVP product for a platform-configured trial after successful self bootstrap, while keeping commercial availability separate from authentication and tenant authorization and preserving a future path for capability or usage limits.

## Scope

### In scope

- Trial creation at the successful bootstrap boundary.
- Platform-owned duration, lifecycle transitions, conversion, extension, early end, and exceptional reactivation.
- MVP full-product availability subject to existing authorization, rollout, deployment, and safety gates.
- Expiry restrictions, retention eligibility, audit, idempotency, and repeated-trial controls.

### Out of scope

- Public signup or direct uninvited access.
- Card collection, billing, payments, checkout, invoices, tax, refunds, and automatic subscription charging.
- Defining future capability or consumption limits.
- Implementing data export, deletion, or legal-retention workflows.
- Promoting any onboarding, privacy, deployment, or pilot gate.

## Model and definitions

- **Bootstrap grant:** pre-tenant authority governed by `SPEC-DIVE-ONBOARDING-001`; it authorizes one invited self-bootstrap and is not a trial credential.
- **Trial:** PostgreSQL-authoritative commercial access period created only by successful bootstrap.
- **Commercial availability:** server-resolved decision that is evaluated separately from IAM authorization.
- **Capability policy:** commercial projection that grants all otherwise available product capabilities in the MVP and may later support approved limits without changing authentication or bootstrap. It does not override deployment flags, safety gates, IAM, tenant scope, or feature readiness.
- **Conversion:** audited platform operation that changes the tenant from trial access to active customer access without recreating the tenant or its data.

## Requirements

- **DIVE-TRIAL-REQ-001:** Trial access MUST remain invite-only and MUST NOT introduce public operator signup or uninvited tenant creation.
- **DIVE-TRIAL-REQ-002:** PostgreSQL MUST be authoritative for trial state, timing, conversion, and commercial availability; Clerk, browser state, invitation metadata, and client input MUST NOT grant or modify them.
- **DIVE-TRIAL-REQ-003:** Authorized platform staff MUST configure the trial duration before successful bootstrap. The client and invited Owner MUST NOT select or override it. No default, minimum, maximum, or unit is defined by this Draft.
- **DIVE-TRIAL-REQ-004:** The trial MUST begin only when bootstrap completes successfully; invitation issue, delivery, acceptance, authentication, or partial setup MUST NOT start it.
- **DIVE-TRIAL-REQ-005:** Successful bootstrap MUST create the tenant, first center, active Owner membership, invitation result, and trial in one PostgreSQL transaction; any failure MUST leave no partial trial or tenant result.
- **DIVE-TRIAL-REQ-006:** One successful bootstrap MUST create at most one trial. Idempotent replay MUST return the same trial result; invitation reissue MUST NOT create another trial.
- **DIVE-TRIAL-REQ-007:** During the MVP, an active trial MUST grant every product capability that is otherwise implemented, deployed, operationally enabled, and authorized for that tenant and actor. It MUST NOT bypass IAM, tenant scope, rollout controls, safety gates, or artifact readiness.
- **DIVE-TRIAL-REQ-008:** Commercial availability MUST be evaluated separately from authentication, membership, roles, permissions, tenant scope, UI preferences, and deployment flags. Every protected operation MUST still satisfy its existing IAM and tenant-isolation contract.
- **DIVE-TRIAL-REQ-009:** The MVP trial MUST NOT require a payment card and MUST NOT introduce billing or automatic charging.
- **DIVE-TRIAL-REQ-010:** When the trial expires, the server MUST reject new business mutations and new external-effect requests while preserving existing tenant data. Expiry MUST NOT itself delete or rewrite reservations, customers, configuration, audit, or outbox records.
- **DIVE-TRIAL-REQ-011:** After expiry, the Owner MUST receive only a restricted surface for trial status, activation contact, and requests for export or deletion. This SPEC MUST NOT define or claim execution of export or deletion before an approved rights/privacy contract exists.
- **DIVE-TRIAL-REQ-012:** Expiry MUST NOT add an automatic grace period. Authorized platform staff MAY explicitly extend or exceptionally reactivate a trial through an audited operation.
- **DIVE-TRIAL-REQ-013:** Until billing is approved, conversion to active customer access MUST be an internal platform operation and MUST preserve the existing tenant, centers, memberships, users, data, and configuration.
- **DIVE-TRIAL-REQ-014:** Only a dedicated platform capability MAY configure, extend, shorten, end, convert, or reactivate a trial. Each mutation MUST require a reason and MUST be authorized, idempotent, and audited with actor, prior value, new value, and occurrence time. Tenant roles and read-only support MUST NOT authorize these operations.
- **DIVE-TRIAL-REQ-015:** The Owner MAY request cancellation, export, or deletion, but MUST NOT modify trial duration, state, conversion, or reactivation.
- **DIVE-TRIAL-REQ-016:** After expiry, tenant data MUST initially be retained for 30 days for activation or rights requests. Legal or privacy obligations MUST take precedence, and real-data activation remains blocked until the required review validates the retention contract.
- **DIVE-TRIAL-REQ-017:** After the retention period, data MAY become eligible for a separate explicit and audited deletion process. Expiry MUST NOT automatically delete data, and this Draft MUST NOT define deletion execution.
- **DIVE-TRIAL-REQ-018:** An identity or tenant that completed a trial MUST NOT receive another automatically. A second trial or extension MUST require an authorized manual decision and reason; reissuing bootstrap delivery MUST NOT reset commercial history.

### Derivations

- **DIVE-TRIAL-REQ-002:** PostgreSQL already owns tenant and authorization state, so commercial trial authority cannot move to Clerk or browser metadata without contradicting the approved authority boundary.
- **DIVE-TRIAL-REQ-005:** Starting the trial only after successful bootstrap requires trial creation to share the existing atomic completion boundary; otherwise one side could commit without the other.
- **DIVE-TRIAL-REQ-006:** Existing bootstrap idempotency and concurrency guarantees logically require one stable trial result for one bootstrap result.
- **DIVE-TRIAL-REQ-011:** The approved restricted post-expiry surface can collect rights requests, but current TRACE assigns export and deletion to a future rights/privacy contract; this Draft therefore cannot claim those workflows as implemented or ready.

## Proposed decisions

All behavioral decisions approved in issue #84 are represented above for Draft review. No additional default, duration bound, capability limit, notification schedule, API, event, or persistence label is proposed here.

## Open questions

| Question ID | Question | Why it matters | Decision owner | Blocking |
|---|---|---|---|---|
| `DIVE-TRIAL-Q-001` | What duration unit, precision, minimum, maximum, and persistence representation are allowed? | Required for validation, time computation, API contracts, and tests without inventing a default. | Product / Backend | Yes |
| `DIVE-TRIAL-Q-002` | Where is platform configuration attached before bootstrap: the bootstrap grant, a separate commercial grant, or another authoritative record? | Determines atomicity, reissue behavior, and persistence ownership. | Backend / Data / Security | Yes |
| `DIVE-TRIAL-Q-003` | At expiry, are already-committed outbox effects completed, cancelled, or classified by purpose? | Suspending all workers could violate effects already committed before expiry; continuing all could produce unwanted effects afterward. | Product / Backend / Operations | Yes |
| `DIVE-TRIAL-Q-004` | Which reads and operations remain available in the restricted expired surface, and what error contract applies elsewhere? | Required to avoid inconsistent server and UI behavior. | Product / Security / Frontend | Yes |
| `DIVE-TRIAL-Q-005` | Which future rights/privacy artifact owns export, deletion, legal holds, and the exact interpretation of the 30-day period? | Required before real personal data and before deletion can be implemented. | Product / Privacy / Legal | Yes |
| `DIVE-TRIAL-Q-006` | Are expiry or retention notifications required, and through which approved channel? | No notification schedule or delivery contract has been approved. | Product | No |
| `DIVE-TRIAL-Q-007` | What exact persistence labels, commands, API routes, events, error codes, and rollout controls implement the lifecycle? | Required before implementation; this Draft defines outcomes but not transport or storage names. | Backend / Architecture | Yes |

## States and invariants

The approved conceptual lifecycle is: active trial, expired trial, converted customer access, early-ended trial, and exceptional reactivation. Exact persistence labels remain open under `DIVE-TRIAL-Q-007`.

Invariants:

1. No trial exists before successful bootstrap.
2. One bootstrap result maps to at most one trial result.
3. Commercial availability never substitutes for IAM authorization or tenant scope.
4. Expiry does not delete tenant data.
5. Conversion, extension, shortening, early end, and reactivation are platform-authorized and audited.
6. Client, Clerk, tenant role, and support state do not grant commercial authority.

## Edge cases and acceptance scenarios

- Failed or rolled-back bootstrap leaves no started trial.
- Idempotent bootstrap replay returns the same trial result and dates.
- Concurrent bootstrap attempts cannot create duplicate trials.
- Reissued delivery does not restart or duplicate the trial.
- Expired commercial access cannot be bypassed by an active Clerk session, active membership, alternate center, direct API call, worker invocation, or browser state.
- A converted tenant retains its identifiers, memberships, centers, and data.
- A platform mutation without the dedicated capability, reason, or valid idempotency context fails closed and does not change trial state.
- Rights requests remain requests until an approved privacy contract defines their execution.

## API, events, and data

Open under `DIVE-TRIAL-Q-001`, `002`, and `007`. No route, DTO, table, column, event name, error code, duration default, or capability schema is approved by this Draft.

## Security, privacy, isolation, and operations

- Trial records are tenant-owned after bootstrap and must preserve the existing tenant-isolation baseline.
- Platform mutations use a capability independent of tenant roles and read-only support.
- Audit and idempotency are mandatory for commercial mutations.
- The 30-day direction does not override legal holds, privacy obligations, or the real-data gate.
- Export and deletion execution remain outside this SPEC until an approved rights/privacy contract exists.

## Performance and observability

No numeric budget is approved. Implementation must expose enough safe state to operate expiry and conversion without logging personal data or provider credentials. Exact metrics and alerts remain part of the implementation design after the blocking questions close.

## Errors, concurrency, and idempotency

Bootstrap replay and concurrency inherit the owning onboarding guarantees. Platform trial mutations require command-specific idempotency and conflict on changed intent. Exact error codes and namespaces remain open under `DIVE-TRIAL-Q-007`.

## Migration, rollout, and rollback

No implementation or migration is authorized by this Draft. Rollout controls and compatibility with tenants created before trial support remain open under `DIVE-TRIAL-Q-007`. Rollback must not delete tenant data or weaken IAM and tenant-isolation controls.

## Tests and expected evidence

After promotion and implementation authorization, expected tests include atomic bootstrap/trial creation, rollback, idempotent replay, concurrency, cross-tenant denial, platform-capability denial, expiry boundary, conversion preservation, extension/reactivation audit, repeated-trial denial, and treatment of committed external effects. Rights/privacy review is required before real personal data.

## Traceability

- Decision: `specs/architecture/adrs/ADR-DIVE-016.md`
- Bootstrap: `specs/onboarding/SPEC-DIVE-ONBOARDING-001.md`; `specs/architecture/adrs/ADR-DIVE-013.md`
- IAM: `specs/iam/SPEC-DIVE-IAM-001.md`
- Product gate: `specs/product/dive-mvp-profile.md`
- Map: `specs/traceability/TRACE-DIVE-MVP-001.md`
- Proposal record: [Issue #84](https://github.com/BorjaRM/dive-platform/issues/84)
