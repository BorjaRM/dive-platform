# ADR-DIVE-004 - IAM invitation and membership lifecycle

- **Status:** Ready to start
- **Version:** 0.4
- **Date:** 2026-09-26
- **Decision date:** 2026-09-26
- **Deciders:** Product / Security / Architecture
- **Affected IDs:** `DIVE-IAM-REQ-014`, `017`, `022`, `024`, `025`

## Provenance

The decisions were introduced as `Proposed` from `SPEC-DIVE-IAM-001`, `specs/foundation/iam-baseline.md`, and `specs/foundation/security-privacy-baseline.md`. Product, Security, and Architecture explicitly approved all proposals on 2026-09-26; this ADR is now normative implementation authority.

The version 0.2 identity-assertion and retry clarifications are `Derived` from the approved provider-neutral identity boundary, one-way credential storage, and immutable reissue model. They were approved on 2026-09-26 under the explicit delegated decision instruction for this implementation session.

The version 0.3 verified-address clarification is `Derived` from `DIVE-IAM-REQ-005` and the invitation-only address match in this ADR. It was approved on 2026-09-26 under the same delegated decision instruction.

## Context

An invitation must create a pending membership with explicit roles and centers, but email is not a stable identity key. The current persistence model requires an identity on every membership and has only `pending`, `active`, and `disabled` membership states. The first pilot also reserves `external_collaborator` while keeping it disabled.

## Proposed decision

### Invitation and identity binding

- Store an invitation separately from the membership it controls.
- Creating an invitation creates an unbound `pending` membership in the target tenant with immutable proposed roles and center scopes.
- The invitation delivery address is routing and acceptance-validation data, not an identity identifier.
- Acceptance requires an authenticated `issuer + subject`, a valid opaque invitation credential, and a provider-verified address matching the invitation target.
- The authenticated principal and verified addresses come only from `IdentityProviderPort`; request fields and direct persistence-command arguments are never identity evidence. Persistence rejects empty principal identifiers, while provider verification remains an application-boundary responsibility.
- Ordinary dashboard authentication requires the stable `issuer + subject` binding and may carry no verified address. A non-empty provider-verified address match is required only for invitation acceptance.
- Acceptance binds the internal identity to the pending membership and changes it to `active` in one transaction.
- Pending memberships never authorize access and are not returned by access resolution.

This requires the persistence model to support a pending membership before identity binding without introducing placeholder identities.

### Lifecycle

Invitation states are `pending`, `accepted`, `rejected`, `revoked`, and `expired`. Only these transitions are allowed:

```text
pending -> accepted
pending -> rejected
pending -> revoked
pending -> expired
```

Terminal invitation states do not transition again. `accepted` activates the linked membership; `rejected`, `revoked`, and `expired` disable the linked pending membership. Memberships retain the existing `pending`, `active`, and `disabled` states.

### Expiry, reissue, and authorization

- An invitation expires seven days after issuance.
- A retry with the same tenant-scoped command idempotency key returns the existing invitation identifiers, lifecycle state, and delivery status. The bearer credential is emitted only to the trusted delivery boundary on initial creation and is never replayed. An unknown or lost delivery outcome requires deliberate reissue, which revokes the previous credential.
- A deliberate reissue revokes the previous pending invitation and membership and creates a new immutable pair with a new credential.
- `membership.invite` authorizes creation and reissue.
- `membership.disable` authorizes revocation of a pending invitation and disabling an active membership.
- A membership that already exists in the tenant is not silently merged with an invitation; the command returns a non-disclosing conflict and records an audit result.

### Disabled external collaborator

- Keep `external_collaborator` reserved in the stable role catalog.
- Reject it in new invitations and active role assignments during the first pilot.
- If an imported or stale membership contains `external_collaborator`, deny authorization for the whole membership, including mixed-role assignments.

## Consequences

- Invitation delivery can change without changing identity semantics.
- Invitation state is auditable without overloading membership status.
- The application depends on lifecycle ports and stable commands, not on Clerk invitation objects.
- Persistence needs a reversible migration for unbound pending memberships and invitation records.
- Existing active rows containing `external_collaborator` require a pre-activation data check.

## Alternatives considered

- Create a placeholder identity from email: rejected because email is not a stable identifier.
- Create the membership only after acceptance: rejected because `DIVE-IAM-REQ-017` requires invitation to create a pending membership.
- Allow `external_collaborator` as an active capability-free role: rejected because an apparently active assignment is ambiguous and mixed roles could accidentally grant access.
- Update a pending invitation in place on reissue: rejected because immutable attempts provide clearer audit and idempotency behavior.

## Open questions

- **Documented:** the lifecycle already has the approval recorded above. Invitation HTTP/application-boundary hardening remains Draft in SPEC-DIVE-IAM-INVITATIONS-001; existing approval does not settle that new boundary.

## Acceptance criteria / evidence

- Transition-table tests cover every allowed and forbidden transition.
- Acceptance binds only the authenticated intended principal.
- Cross-tenant, wrong-address, expired, revoked, and replayed acceptance attempts fail without disclosure.
- Roles and centers cannot change between issuance and acceptance.
- Reissue, acceptance, membership change, audit, and outbox behavior are transactional and idempotent.
- External collaborator assignments are rejected and stale rows fail closed.