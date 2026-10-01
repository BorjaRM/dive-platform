# ADR-DIVE-007 - IAM audit and revocation boundaries

- **Status:** Ready to start
- **Version:** 0.3
- **Date:** 2026-09-26
- **Decision date:** 2026-09-26
- **Deciders:** Product / Security / Architecture
- **Affected IDs:** `DIVE-IAM-REQ-015`, `016`, `021`, `022`, `024`, `025`

## Provenance

The decisions were introduced as `Proposed` from `SPEC-DIVE-IAM-001`, `specs/foundation/iam-baseline.md`, `specs/foundation/security-privacy-baseline.md`, ADR-DIVE-001, and ADR-DIVE-002. Product, Security, and Architecture explicitly approved all proposals on 2026-09-26; this ADR is now normative implementation authority. Its open questions remain outside the approved decision.

The version 0.2 Clerk token-profile and deletion-signal clarifications are `Derived` from `DIVE-IAM-REQ-004`, `018`, `021`, `022` and the approved rule that webhooks do not authorize. They were approved on 2026-09-26 under the explicit delegated decision instruction for this implementation session.

**Documented -- JWT validity boundary:** source: product-owner selection of acceptance until JWT expiry and explicit contract-update authorization in the authentication/BFF planning conversation on 2026-10-01. This supersedes provider-confirmed session/user status on every dashboard request, not local authorization or the existing five-minute revocation requirement. It authorizes this contract change, not implementation, publication, activation, artifact status promotion or a claim of provider verification. The owning clarification is [SPEC-DIVE-IAM-001](../../iam/SPEC-DIVE-IAM-001.md#dashboard-jwt-validity-boundary).

## Context

Sensitive allow and deny decisions need durable audit, while failures before trusted identity or tenant resolution cannot safely populate tenant-owned audit rows. Membership and role revocation must take effect within five minutes, Clerk webhooks are synchronization input rather than authorization truth, and direct runtime database updates must not bypass audit/outbox behavior.

## Proposed decision

### Audit boundary

- Use one vendor-neutral audit command with stable action and reason strings defined in an internal contract package.
- Authorization actions use the stable capability string being evaluated. Identity synchronization uses `identity.webhook.apply` because it is not a tenant capability.
- The initial sensitive action set is `membership.invite`, `membership.disable`, `booking.create`, `booking.read`, `booking.update`, `booking.confirm`, `booking.cancel`, `customer_contact.read`, `support.tenant.read`, and `identity.webhook.apply`.
- Audit result is `success` or `denied`. Success has no denial reason.
- Initial denial reasons are `authentication_missing_or_invalid`, `membership_missing_or_inactive`, `permission_missing`, `scope_mismatch`, `resource_missing_or_inaccessible`, `resource_state_invalid`, `credential_invalid_or_expired`, `duplicate_or_replayed`, `assurance_insufficient`, `support_grant_invalid`, `last_owner`, and `invariant_violation`.
- Reason strings are internal evidence, not client responses. External errors remain non-disclosing.
- A tenant audit record carries tenant, actor identity, action, resource type and safe identifier, result, reason, purpose or justification when required, correlation ID, occurred-at time, and safe source metadata.
- Sensitive allows include membership mutations, booking create/update/confirm/cancel, customer-contact reads, support reads, public-token consumption, and identity-webhook state changes.
- Sensitive denies are audited when trusted tenant and actor context exist.
- Failures before trusted identity or tenant resolution emit a non-tenant security event with correlation ID and safe reason. Untrusted request values are not recorded as authoritative tenant or actor fields.
- Audit and outbox records commit atomically with a sensitive mutation.
- Audit and security logs exclude bearer tokens, authorization headers, invitation credentials, raw webhook bodies, email addresses, and customer-contact payloads.

### Persistence mutation boundary

- The runtime database role must not have unrestricted direct membership-state update privileges.
- Membership mutation is exposed through a narrow persistence command that atomically enforces invariants, writes audit, and appends outbox state.
- The application depends on a persistence port; whether the command is implemented as a database function or transaction service remains an implementation detail, provided database grants prevent bypass.

### Purpose-limited customer contact

- `customer_contact.read` is available only through a booking-operations use case with an explicit `booking_operations` purpose.
- Tenant, center, booking, and contact scope are derived internally. No generic contact-search use case is authorized.
- Return only fields required by the calling booking operation and audit every allow and deny with the purpose.

### Revocation and session boundary

- Do not cache application authorization decisions in the MVP.
- Re-resolve active membership, roles, and scopes for every authorized use case and again inside sensitive mutation transactions.
- **Documented, approved 2026-10-01:** the identity adapter cryptographically validates the Clerk standard session JWT on every protected dashboard request, including signature, expiry, temporal validity, exact issuer, approved `azp` and required identity/session claims. It does not query Clerk session or user status for request-time revocation, deletion or blocking checks. Invalid credentials or inability to establish token validity fail closed; signing-key retrieval may still require provider access.
- Verified Clerk webhooks are idempotent synchronization signals. They never grant authorization by themselves.
- **Documented, approved 2026-10-01:** a previously issued JWT remains eligible for authentication until expiry after external logout, session revocation, user blocking or deletion. This does not override local membership, permission, resource or tenant-context denials. No session-status cache, revocation list, custom JWT template or application audience is introduced; the existing standard-token profile remains selected.
- **Documented, approved 2026-10-01:** a verified `user.deleted` webhook remains an idempotent synchronization signal and does not automatically disable internal identities or memberships. An already issued JWT is governed by the validity boundary above, rather than a request-time user lookup. Restoring ownership after external deletion remains an explicit operational recovery question.
- **Documented:** measure revocation from membership/role commit, session termination, or accepted webhook event to the first denied request. The observed duration must not exceed `DIVE-IAM-REQ-016`; the activation checks in the owning JWT clarification must establish that expiry-based session invalidation meets this unchanged limit without relying exclusively on webhook delivery.

## Consequences

- Pre-authentication failures remain observable without weakening tenant audit integrity.
- Membership state cannot change through the runtime role without invariant, audit, and outbox enforcement.
- Revocation correctness does not depend on an application permission cache.
- Identity-provider details remain behind the adapter, but Phase 2 cannot close until Clerk session and webhook guarantees are verified.

## Alternatives considered

- Insert tenant audit rows using a client-supplied tenant before resolution: rejected because it treats untrusted input as audit authority.
- Log only denied decisions: rejected because sensitive allows also require evidence.
- Keep direct table update privileges and rely on service conventions: rejected because another code path could bypass audit and outbox.
- Use webhooks as authorization decisions: rejected because internal membership state remains the source of truth.
- Add an authorization cache immediately: rejected because it increases revocation complexity without measured need.

## Open questions

- Clerk session termination, webhook event inventory, timestamp tolerance, retry behavior, and event-ID retention require verification against the selected Clerk integration contract.
- **Documented -- Activation gate, approved 2026-10-01:** verify actual JWT lifetime and verifier clock tolerance, and that Clerk stops issuing or renewing tokens after session revocation, user blocking or deletion. If the effective residual-access window does not meet `DIVE-IAM-REQ-016`, activation is blocked pending an explicit configuration or requirement decision; no new token lifetime or exception is selected here.
- Booking states that permit customer-contact access and the minimum returned field set remain owned by the booking/privacy contract.
- Audit, security-event, and idempotency-record retention require approved operations and privacy policy.
- Audit visibility and export authorization require a dedicated implementation slice for the existing `audit.read` and `audit.export` permissions.

## Acceptance criteria / evidence

- Allow, deny, pre-resolution, redaction, correlation, atomic rollback, and direct-mutation tests cover the audit boundary.
- Customer-contact tests cover valid purpose, wrong purpose, excess fields, wrong center, wrong tenant, and audit.
- Membership disable and role removal are denied on the next request.
- **Documented, approved 2026-10-01:** test valid JWT authentication without session/user-status lookups; reject expired tokens, invalid signatures, temporal claims, issuer and unauthorized `azp`. External session revocation or user blocking alone does not reject an otherwise valid unexpired JWT; local revocation still denies access. Verifier/key failures grant no authority; status-endpoint availability is no longer an ordinary authentication dependency.
- **Documented:** duplicate/out-of-order webhook and invalid webhook-signature checks remain required. Dashboard logout stops client calls, removes browser context and preserves explicit handle revocation; it does not prove immediate invalidation of every previously issued JWT.
- A documented measurement demonstrates the five-minute revocation requirement.