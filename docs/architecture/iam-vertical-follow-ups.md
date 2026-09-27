# IAM vertical follow-ups

This is a non-normative implementation note. `SPEC-DIVE-IAM-001` remains the normative source. No new requirement, permission, state, TTL, or acceptance criterion is introduced here.

## Planning documents

- [IAM conformance plan](iam-conformance-plan.md): phases, PR slices, dependencies, and exit gates.
- [IAM conformance evidence register](iam-conformance-evidence.md): requirement groups, current status, proof, and closeout checks.
- [IAM Phase 0 recommendations](iam-phase-0-recommendations.md): non-normative decision preparation.

Phase 0 decisions are approved and Ready to start in `ADR-DIVE-004` through `ADR-DIVE-007`. Their remaining open questions do not authorize implementation defaults.

## Resolved in the current change

- **Documented: `DIVE-IAM-REQ-010..014`, `023`, ADR-DIVE-007.** Explicit Phase 1 grants cover tenant-wide and assigned-center scopes, inactive memberships, mixed valid roles, unknown capabilities, and disabled or mixed `external_collaborator` assignments. Generic evaluation denies purpose-limited `customer_contact.read` and the deferred `audit.export` implementation slice.
- **Documented: `DIVE-IAM-REQ-004`, `005`, `017`, ADR-DIVE-004.** The provider-neutral assertion boundary and PostgreSQL own authenticated principal handoff, the immutable invitation and pending-membership lifecycle, no-bearer retries, deliberate reissue, concurrent acceptance/reissue, terminal transitions, and transactional audit/outbox behavior. Clerk and external delivery remain open.
- **Documented: `DIVE-IAM-REQ-018`, `025`, ADR-DIVE-007.** The runtime role cannot mutate membership, invitation, audit, or outbox tables directly. Narrow security-definer commands enforce last-owner and atomic audit/outbox behavior.
- **Documented: ADR-DIVE-002, ADR-DIVE-004.** The pre-pilot migration is maintenance-only with an explicit migrate-then-deploy sequence and roll-forward recovery; direct DML and RLS bypass are never restored.
- **Traceability:** `TRACE-DIVE-MVP-001` records only the passing Phase 1 proof and keeps broader non-disclosure/audit plus Phase 2+ behavior partial or open.
- **Derived from `apps/api/src/app.module.ts`, `packages/identity/src/clerk.ts`, `apps/api/test/app.e2e-spec.ts`, `apps/api/test/iam.clerk.sandbox.e2e-spec.ts`, `packages/identity/src/clerk.spec.ts`, and `packages/identity/src/clerk-webhook.spec.ts`; Partial for `DIVE-IAM-REQ-004`, `DIVE-IAM-REQ-016`, `DIVE-IAM-REQ-022`; scoped proof for `DIVE-IAM-REQ-005`, `DIVE-IAM-REQ-019`, `DIVE-IAM-REQ-021`; within ADR-DIVE-004, ADR-DIVE-006, and ADR-DIVE-007.** The single API process uses one configured Clerk adapter for dashboard and webhook ports and fails startup closed on incomplete configuration. Standard session tokens require exact issuer, approved `azp`, no `aud`, and active session/user checks. Ordinary authentication may have no verified address; invitation acceptance may not. The official SDK verifies local signatures and webhook signatures; the Clerk Development sandbox proves browser authentication and provider session revocation, while remaining lifecycle cases use the explicit injectable provider seam. Deletion webhooks are tenant-resolved, idempotent, audited signals that do not mutate authorization state. The synthetic next-call samples and dated sandbox result are recorded in `evidence/releases/iam-phase-2-revocation.md`.

## Follow-ups

These are implementation follow-ups for requirements already defined in `SPEC-DIVE-IAM-001`; they are not new product decisions.

| Priority | IDs | Follow-up | Reason it remains open |
|---|---|---|---|
| High | `DIVE-IAM-REQ-007..009`, `026` | Implement published-channel authorization and opaque, single-purpose public tokens. | No public capability or token endpoint exists in this vertical. |
| High | `DIVE-IAM-REQ-025` | Extend the stable audit boundary to sensitive booking and customer-contact operations when those use cases are implemented. | Phase 1 covers membership and invitation allow/deny, pre-resolution events, command-only mutation, and atomic rollback; later sensitive operations do not exist yet. |
| Medium | `DIVE-IAM-REQ-015`, `019`, `020` | Add purpose-limited contact access, future step-up fields, and read-only time-bounded support access. | No API, schema, or evidence covers these later-phase flows yet. |
| Medium | `DIVE-IAM-REQ-020`, `028` | Implement and measure support-grant expiry. | Phase 2 proves dashboard and membership/session revocation; support grants remain Phase 4 and are not implemented. |

## ADR-DIVE-008 follow-ups

These items are implementation and operations follow-ups for the approved
dashboard context contract. They do not change the current runtime behavior or
introduce a new TTL, role, scheduler, latency budget, or authorization cache.

| Priority | Owner / slice | Follow-up | Current boundary |
|---|---|---|---|
| High | Platform / worker | Schedule `cleanupRevokedIamTenantContexts()` from `apps/worker` and define its database credential, cadence, retry, alerting, and deletion metrics. | The SQL command and `dive_app` execution grant exist; no scheduler invokes it. Do not use `dive_migration` or the proposed `dive_webhook` role. |
| High | Web | Implement the dashboard `sessionStorage` consumer and context-selection flow in `apps/web`. | The web app is still a starter and does not consume the context API. |
| Medium | Product / Security | Review whether forgotten active handles need an independent maximum-age or idle TTL, including behavior for a handle that is still bound to a valid Clerk session. | With a cap of 20 live handles, an abandoned active handle can occupy a slot indefinitely; the 30-day deletion rule applies only after revocation and does not release that slot. ADR-DIVE-008 currently specifies no independent active-handle TTL. |
| Medium | API / Test | Add concurrent issuance tests proving the 10/minute and 20-live-handle limits under simultaneous requests. | The SQL command takes an advisory transaction lock; current e2e coverage proves the limits sequentially only. |
| Medium | API / Performance | Measure operator listing, context issuance, context resolution, center listing, query plans, pool utilization, and response latency with representative membership and center counts before considering indexes, batching, or caching. | Request-time authorization remains authoritative; no cache TTL or numeric performance budget is approved. |
| Medium | Identity / Release | Run real Clerk browser/session lifecycle and deployment validation for the dashboard consumer. | Deterministic e2e and the existing sandbox evidence do not cover every production lifecycle path. |
| Low | Security / Database | Revisit a dedicated `dive_webhook` login and pool after the webhook process boundary is provisioned. | The role is Proposed only and is not implemented by ADR-DIVE-008. |

### TTL and live-handle cap review

This is an open product and security decision, not an implementation default.
The current behavior is to reject issuance at 20 live handles and never revoke
an existing handle automatically. A forgotten handle can therefore block a new
context for the same identity and Clerk session even when the Clerk session is
still valid.

The review must compare at least these policies:

- **Current policy:** keep all live handles until explicit/session revocation;
	reject new issuance at 20.
- **Active-handle TTL:** expire a handle after an approved maximum age. This
	bounds forgotten-handle retention but can invalidate a still-open tab.
- **Idle TTL:** expire a handle after an approved period without use. This
	requires defining whether validation updates activity and accounting for the
	extra write or contention on the request path.
- **New-handle preference:** revoke the oldest or least-recently-used handle
	when issuing a new one. This would make new contexts available, but it would
	silently invalidate an existing tab and contradict the current no-automatic-
	revocation decision. It also lets a caller holding a valid session evict its
	own other contexts.

No policy is selected here. Before changing the ADR, Product/Security should
decide whether continuity of existing tabs or availability for new tabs has
priority, and define the user-visible failure, revocation audit, concurrency,
and recovery behavior.

## Open Phase 2 questions

- Clerk's `fva` claim is optional and marked experimental by the installed SDK. The adapter maps valid available ages, but an absent claim yields minimal `single_factor` assurance with no fabricated verification timestamp. Phase 4 must confirm the supported Clerk step-up contract before support grants consume this field.
- Webhook retry/exhaustion behavior is provider-owned and no application retry limit or retention TTL is introduced here. The inbox makes repeated delivery idempotent.
- Real Clerk sandbox evidence is still missing for natural session expiry, browser logout, Clerk-delivered webhook/retry behavior, and provider failure behavior. The dated sandbox run covers browser authentication, real session/user fetches, and explicit provider session revocation; the remaining lifecycle tests use deterministic or injected provider seams. The seam is a testability hook; production composition remains the configured `ClerkIdentityAdapter` in `apps/api/src/app.module.ts`.
- Restoring tenant ownership after a Clerk user is externally deleted remains an operational recovery question. The webhook deliberately leaves identities and memberships unchanged.
- Audit, security-event, webhook-inbox, and idempotency-record retention remain unapproved; no TTL is introduced by Phase 2.

## Validation note

Validation commands and results are recorded in the implementation handoff or pull request. Do not treat historical command results in this planning note as current evidence.