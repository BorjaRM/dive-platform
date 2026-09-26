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
- **Documented, Partial for `DIVE-IAM-REQ-004`, `016`, `022`; scoped proof for `DIVE-IAM-REQ-005`, `019`, `021`; ADR-DIVE-004, ADR-DIVE-006, ADR-DIVE-007.** The single API process uses one configured Clerk adapter for dashboard and webhook ports and fails startup closed on incomplete configuration. Standard session tokens require exact issuer, approved `azp`, no `aud`, and active session/user checks. Ordinary authentication may have no verified address; invitation acceptance may not. The official SDK verifies local signatures and webhook signatures, while session/user lifecycle tests remain mocked. Deletion webhooks are tenant-resolved, idempotent, audited signals that do not mutate authorization state. The synthetic next-call samples are recorded in `evidence/releases/iam-phase-2-revocation.md`.

## Follow-ups

These are implementation follow-ups for requirements already defined in `SPEC-DIVE-IAM-001`; they are not new product decisions.

| Priority | IDs | Follow-up | Reason it remains open |
|---|---|---|---|
| High | `DIVE-IAM-REQ-007..009`, `026` | Implement published-channel authorization and opaque, single-purpose public tokens. | No public capability or token endpoint exists in this vertical. |
| High | `DIVE-IAM-REQ-025` | Extend the stable audit boundary to sensitive booking and customer-contact operations when those use cases are implemented. | Phase 1 covers membership and invitation allow/deny, pre-resolution events, command-only mutation, and atomic rollback; later sensitive operations do not exist yet. |
| Medium | `DIVE-IAM-REQ-015`, `019`, `020` | Add purpose-limited contact access, future step-up fields, and read-only time-bounded support access. | No API, schema, or evidence covers these later-phase flows yet. |
| Medium | `DIVE-IAM-REQ-020`, `028` | Implement and measure support-grant expiry. | Phase 2 proves dashboard and membership/session revocation; support grants remain Phase 4 and are not implemented. |

## Open Phase 2 questions

- Clerk's `fva` claim is optional and marked experimental by the installed SDK. The adapter maps valid available ages, but an absent claim yields minimal `single_factor` assurance with no fabricated verification timestamp. Phase 4 must confirm the supported Clerk step-up contract before support grants consume this field.
- Webhook retry/exhaustion behavior is provider-owned and no application retry limit or retention TTL is introduced here. The inbox makes repeated delivery idempotent.
- Real Clerk sandbox evidence is still missing for session expiry, logout/termination propagation, user-state fetches, and provider failure behavior. Local tests use the real SDK only for public-key token signature/`azp` verification and webhook signatures.
- Restoring tenant ownership after a Clerk user is externally deleted remains an operational recovery question. The webhook deliberately leaves identities and memberships unchanged.
- Audit, security-event, webhook-inbox, and idempotency-record retention remain unapproved; no TTL is introduced by Phase 2.

## Validation note

Validation commands and results are recorded in the implementation handoff or pull request. Do not treat historical command results in this planning note as current evidence.