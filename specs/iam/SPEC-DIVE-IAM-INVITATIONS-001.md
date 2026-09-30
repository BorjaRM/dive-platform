# SPEC-DIVE-IAM-INVITATIONS-001 - Ordinary tenant invitations

- **Status:** Ready to start
- **Version:** 0.1
- **Last reviewed:** 2026-09-30
- **Owner:** Product / Security
- **Approval reference:** Unchanged requirements and approval records extracted from SPEC-DIVE-IAM-001 at commit `86e9d97`; documentation split requested 2026-09-30. No new semantic approval or status promotion is inferred.

## Normative authority

**Documented:** owns only the requirements declared below, extracted verbatim from [SPEC-DIVE-IAM-001](SPEC-DIVE-IAM-001.md). Original Derived/Proposed classifications, sources and approvals are preserved. This file does not authorize unrelated contracts or infer conformance from implementation existence.

## Requirement provenance

| Requirement IDs | Provenance | Exact source | Decision status |
|---|---|---|---|
| `DIVE-IAM-REQ-017` | `Proposed` | PR #1 invitation, owner-lockout, MFA-readiness, and support-access decisions | Approved by product owner for MVP validation |

## Requirements

- **DIVE-IAM-REQ-017:** Invitation creates a pending membership in one tenant with explicit roles and centers.

## Boundary and verification

**Documented:** ADR-DIVE-004 owns ordinary invitation credentials and delivery; SPEC-DIVE-IAM-001 owns roles, last-Owner protection and revocation. Ordinary invitations belong to existing tenants and cannot bootstrap a tenant. Bootstrap grants belong to SPEC-DIVE-ONBOARDING-001. Test issue, response, revoke, credential purpose and cross-tenant denial.

### Invitation service boundary follow-up

**Proposed — Draft; follow-up only, not an approved requirement:** The current application service boundary accepts `tenantId` directly for invitation issue, response, and revocation. The database commands perform server-side checks, and no invitation HTTP route is currently exposed. Before invitation HTTP routes are added, the boundary decision remains open:

- `issueInvitation` and `revokeInvitation` should derive tenant access from the authorized tenant-context handle or `IamAccessContext`, rather than accepting a raw tenant identifier from a controller or request.
- `respondToInvitation` needs a separate credential-bound tenant-resolution design because an invitee may not have an active tenant membership.
- The implementation must add cross-tenant, spoofed-tenant, missing-context, and credential-boundary tests before this slice is considered covered.

Source context: `DIVE-IAM-REQ-006`, `DIVE-IAM-REQ-017`, `DIVE-IAM-REQ-024`, `DIVE-IAM-REQ-025`, `DIVE-IAM-REQ-028`, `DIVE-IAM-REQ-030`; `apps/api/src/iam/invitations/invitations.service.ts`; `packages/database/src/iam-membership-commands.ts`.
