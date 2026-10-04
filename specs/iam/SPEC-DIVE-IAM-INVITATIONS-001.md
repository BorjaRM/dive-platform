# SPEC-DIVE-IAM-INVITATIONS-001 - Ordinary tenant invitations

- **Status:** Ready to start
- **Version:** 0.2
- **Last reviewed:** 2026-10-04
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

### Invitation service boundary

**Documented -- implementation status, 2026-10-04:** ordinary membership issue/revoke routes are exposed at `/v1/memberships/invitations` and ownership issue/revoke routes at `/v1/ownership/invitations`. Both derive tenant access from the authorized tenant-context handle through `TenantContextService`; a request-body `tenantId` is not an authority input. Ownership routes use a dedicated database command that requires an active owner actor and a pending owner invitation target. This documents the current implementation and does not promote the SPEC status or close the separate response boundary.

- `respondToInvitation` needs a separate credential-bound tenant-resolution design because an invitee may not have an active tenant membership.
- Cross-tenant, spoofed-tenant, missing-context, and credential-boundary tests remain required for the complete invitation slice; the current route tests cover the issue/revoke boundary and spoofed request-body tenant input.

Source context: `DIVE-IAM-REQ-006`, `DIVE-IAM-REQ-017`, `DIVE-IAM-REQ-024`, `DIVE-IAM-REQ-025`, `DIVE-IAM-REQ-028`, `DIVE-IAM-REQ-030`; `apps/api/src/iam/invitations/invitations.service.ts`; `packages/database/src/iam-membership-commands.ts`.
