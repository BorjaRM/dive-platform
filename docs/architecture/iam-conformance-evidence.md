# IAM conformance evidence register

This is a non-normative working register for planning and review. It does not redefine requirements or replace `SPEC-DIVE-IAM-001`.

## Status vocabulary

- **Demonstrated:** implementation and executable proof exist for the stated slice.
- **Partial:** a slice is implemented, but the requirement or matrix is broader than the current proof.
- **Open:** no implementation or proof exists in the current vertical.
- **Deferred:** governed by another SPEC or an explicit product scope decision.

## Requirement register

| Area | IDs | Current status | Required closeout proof | Planned phase |
|---|---|---|---|---|
| Global identities, memberships, issuer/subject, tenant resolution | `DIVE-IAM-REQ-001`, `002`, `005`, `006` | Demonstrated for the current API slice | Keep database integration, pooled-context, and cross-tenant tests as regression coverage | 1 |
| Internal authorization decision | `DIVE-IAM-REQ-003` | Demonstrated for the Phase 1 membership boundary | Retain the explicit role matrix, permission-granting-role scope calculation, resource/state checks, and default-deny tests | 1 |
| Cross-resource non-disclosure | `DIVE-IAM-REQ-024` | Partial | Extend the demonstrated center, membership-disable, and invitation cases as later resource APIs are implemented | 1 and later phases |
| Tenant-wide and center-scoped internal roles | `DIVE-IAM-REQ-010..014` | Demonstrated for generic Phase 1 evaluation | Retain the role x permission x scope x membership-state matrix, including mixed valid roles, disabled External Collaborator, purpose-limited contact denial, and deferred export denial | 1 |
| Stable capability names | `DIVE-IAM-REQ-023` | Demonstrated | Retain the central catalog and unknown-capability tests | 1 |
| Last-owner invariant | `DIVE-IAM-REQ-018` | Demonstrated | Retain service, direct app-role, rollback, and concurrency evidence | 1 |
| Invitations and membership lifecycle | `DIVE-IAM-REQ-017` | Demonstrated for persistence and the provider-neutral assertion boundary | Retain pending membership, immutable proposal, no-bearer retries, deliberate reissue, concurrent acceptance/reissue, lifecycle, conflict, expiry, and atomic audit/outbox tests; external delivery remains unimplemented | 1 |
| Sensitive-operation audit | `DIVE-IAM-REQ-015`, `025` | Partial | Membership and invitation allow/deny, pre-resolution, direct mutation protection, and atomic rollback are covered; purpose-limited contact and later booking paths remain open | 1 and 4 |
| Clerk identity boundary | `DIVE-IAM-REQ-004` | Partial | Real SDK local-signature and authorized-party verification exists; session/user Backend API fetch, expiry, logout, and provider-failure tests use an explicit injectable provider seam and require Clerk sandbox integration proof | 2 |
| Clerk webhooks | `DIVE-IAM-REQ-021` | Demonstrated for the official verifier and database boundary | Retain official raw-body signature verification plus database tests for internal tenant resolution, idempotency, no grants, no authorization mutation, audit, and safe outbox signals | 2 |
| Revocation and sessions | `DIVE-IAM-REQ-016`, `DIVE-IAM-REQ-022` | Partial | Membership disable and role removal use local PostgreSQL; expiry and logout/termination use deterministic or injected provider seams and still require real Clerk session integration proof | 2 |
| Step-up readiness | `DIVE-IAM-REQ-019` | Provider-neutral model demonstrated; support policy use remains open | Retain optional-`fva` and conservative factor mapping tests; confirm the provider step-up contract before Phase 4 support activation | 0, 2, and 4 |
| Platform support access | `DIVE-IAM-REQ-020`, `028` | Open | Read-only, tenant-explicit, justified, time-bounded, audited access and expiry tests | 0 and 4 |
| Public channels | `DIVE-IAM-REQ-007`, `008` | Open | Published server-side channel resolution and proof that public input cannot grant dashboard access | 0 and 3 |
| Public tokens | `DIVE-IAM-REQ-009`, `026`, `028` | Open | Opaque, single-purpose, expiring, non-disclosing, tamper/replay-resistant token tests | 0 and 3 |
| Operational trip roles | `DIVE-IAM-REQ-027` | Deferred | No implementation until `SPEC-DIVE-OPS-001` changes the approved scope | Not planned |

## Phase 0 decision register

| Decision record | Status | Selected proposal | Remaining blockers |
|---|---|---|---|
| `ADR-DIVE-004` | Ready to start / Approved | Separate invitation and pending membership lifecycle; seven-day invitation; immutable reissue; external collaborator assignments rejected | None for the approved lifecycle |
| `ADR-DIVE-005` | Ready to start / Approved | Server-resolved public channels; opaque single-purpose tokens; 72-hour confirmation-read and cancellation tokens | `SPIKE-DIVE-003` origin boundary; verifier-metadata retention |
| `ADR-DIVE-006` | Ready to start / Approved | Provider-neutral assurance; separate read-only support grants; multi-factor activation; 60-minute maximum | Grant issuer/approver, resource allow-list, emergency process, retention |
| `ADR-DIVE-007` | Ready to start / Approved | Stable audit envelope; narrow membership mutation boundary; no authorization cache; fail-closed identity adapter; deletion webhooks are non-authorizing signals | Clerk sandbox session behavior, ownership recovery after external deletion, event/retry contract, booking contact fields/states, retention, audit export |

Approved decisions are implementation authority. Open blockers must not be replaced with code defaults.

## Evidence locations

Use the existing repository ownership boundaries:

- Unit and authorization matrix proof: `apps/api/src/` and focused unit specs.
- API behavior: `apps/api/test/`.
- Persistence, RLS, transaction, and role-boundary proof: `packages/database/test/integration/`.
- Isolation and concurrency evidence: `tests/` and the applicable `evidence/` directory.
- Requirement relationships: `specs/traceability/TRACE-DIVE-MVP-001.md`.
- Approved Phase 0 decisions: `specs/architecture/adrs/ADR-DIVE-004.md` through `ADR-DIVE-007.md`.
- Non-normative implementation follow-ups: `docs/architecture/iam-vertical-follow-ups.md`.
- Phase 2 synthetic revocation contract measurement: `evidence/releases/iam-phase-2-revocation.md`.

Do not mark a row Demonstrated from a source-file reference alone. The row needs a passing executable check or a dated evidence artifact that proves the observable behavior.

## Review checkpoints

At the end of each phase, review the register with these questions:

1. Did the implementation change any permission, state, TTL, invariant, or acceptance criterion? If yes, stop and update the normative artifact with provenance before continuing.
2. Does every claimed proof exist and run in the current repository?
3. Are `DIVE-IAM-*` and `MT-REQ-*` results still separated?
4. Are unresolved decisions, deferred scope, rollback impact, and known validation gaps explicit?