# SPEC-DIVE-ONBOARDING-DELIVERY-001 - Clerk invitation delivery and recovery

- **Status:** Ready to start
- **Version:** 0.1
- **Last reviewed:** 2026-09-30
- **Owner:** Product / Security / Frontend Architecture
- **Approval reference:** Unchanged requirements and approval records extracted from SPEC-DIVE-ONBOARDING-001 at commit `86e9d97`; documentation split requested 2026-09-30. No new semantic approval or status promotion is inferred.

## Normative authority

**Documented:** owns only the requirements declared below, extracted verbatim from [SPEC-DIVE-ONBOARDING-001](SPEC-DIVE-ONBOARDING-001.md). Original Derived/Proposed classifications, sources and approvals are preserved. This file does not authorize unrelated contracts or infer conformance from implementation existence.

## Requirement provenance

| Requirement IDs | Provenance | Exact source | Decision status |
|---|---|---|---|
| `DIVE-ONB-REQ-044` | `Proposed` | [Clerk createInvitation](https://clerk.com/docs/reference/backend/invitations/create-invitation); `specs/spikes/SPIKE-DIVE-004/results.md`; `specs/multitenancy/MT-SPIKE-001-specification.md` `MT-COND-WORKER-001`; product confirmations 2026-09-29 approving provider reconciliation, retry/backoff/exhaustion, dead-letter recovery, separate rollout controls, explicit delivery states, and `Retry-After` fallback | Policy approved for implementation; `MT-COND-WORKER-001` remains an activation gate until the policy is implemented and tested |

## Requirements

- **DIVE-ONB-REQ-044:** After the grant transaction commits, the worker MUST consume a dedicated pre-tenant outbox command and call Clerk `createInvitation()` with the approved email, seven-day expiry, notification, and exact redirect. It MUST store only the provider invitation reference and safe delivery status, MUST honor provider rate limits and `Retry-After`, and MUST retry without creating duplicate grants or provider invitations. The provider request MUST carry an opaque grant reference in server-owned metadata for reconciliation only; PostgreSQL remains authoritative and provider metadata MUST NOT authorize or classify the grant. Before repeating an ambiguous create, the worker MUST reconcile that opaque reference. Network failures, provider `408`, `429`, and `5xx` are retryable; other provider `4xx` are terminal. The worker MUST make at most eight total attempts. After a retryable failure it MUST use full jitter from zero to `min(5 seconds × 2^(attempt - 1), 15 minutes)` and MUST NOT retry a `429` before its valid `Retry-After`. A valid `Retry-After` MUST be a non-negative delta-seconds value or a future HTTP date; when it is absent, malformed, or in the past, the worker MUST use the local full-jitter delay. Each outbox command MUST use delivery states `pending`, `retrying`, `succeeded`, or `dead_letter`: creation starts at `pending`, a retryable failure moves to `retrying`, successful provider completion moves to `succeeded`, and a terminal or exhausted command moves to `dead_letter`. Exhausted or terminal commands MUST emit `tenant_bootstrap_invitation.delivery_failed`; there is no in-place replay, and recovery MUST use the existing audited reissue command. The worker MUST use a restricted pre-tenant capability and MUST NOT use a migration role, create tenant data, authorize bootstrap, or receive tenant membership. **Proposed and approved 2026-09-29:** the explicit delivery-state and invalid-`Retry-After` fallback rules close the worker-policy definition without changing the activation gate.

## Boundary and activation

**Documented:** ADR-DIVE-002 owns the outbox and ADR-DIVE-013 the Clerk adapter choice. This is the specific pre-tenant provider policy, not a generic retry default for every worker. Administration and delivery have separate default-disabled controls. Delivery requires writes enabled and valid provider/worker configuration. Use the restricted pre-tenant worker role; never migration privileges or tenant membership.

## Verification and remaining evidence

**Proposed, Draft:** close the provider-call timeout/abort and ambiguous-timeout reconciliation contract before declaring delivery operationally complete. No numeric timeout is inferred from SDK defaults. This does not change the already approved retry classification or exhaustion policy.

Test post-commit dispatch, ambiguous-create reconciliation, safe metadata, retry classification, all eight-attempt exhaustion, jitter bounds, valid/invalid Retry-After, delivery states, dead-letter event and audited reissue-only recovery. SPIKE-DIVE-004 results remain provider evidence; MT-COND-WORKER-001 remains a separate activation gate until its scenario evidence demonstrates closure. Neither existing files nor this split declare it satisfied.
