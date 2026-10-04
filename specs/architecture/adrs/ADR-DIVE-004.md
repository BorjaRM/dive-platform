# ADR-DIVE-004 - IAM invitation and membership lifecycle

- **Status:** Ready to start
- **Version:** 1.6
- **Date:** 2026-09-26
- **Decision date:** 2026-09-26
- **Deciders:** Product / Security / Architecture
- **Affected IDs:** `DIVE-IAM-REQ-003`, `005`, `006`, `011`, `012`, `014`, `017`, `022`, `024`, `025`

## Provenance

The decisions were introduced as `Proposed` from `SPEC-DIVE-IAM-001`, `specs/foundation/iam-baseline.md`, and `specs/foundation/security-privacy-baseline.md`. Product, Security, and Architecture explicitly approved all proposals on 2026-09-26; this ADR is now normative implementation authority.

The version 0.2 identity-assertion and retry clarifications are `Derived` from the approved provider-neutral identity boundary, one-way credential storage, and immutable reissue model. They were approved on 2026-09-26 under the explicit delegated decision instruction for this implementation session.

The version 0.3 verified-address clarification is `Derived` from `DIVE-IAM-REQ-005` and the invitation-only address match in this ADR. It was approved on 2026-09-26 under the same delegated decision instruction.

The version 0.5 ordinary-delivery revision is `Documented` from the explicit
human approval recorded in chat on 2026-10-04. It adopts Clerk Application
Invitations for ordinary invitations while preserving bootstrap as a separate
authority kind. Implementation evidence remains required before claiming
conformance.

The version 0.6 scope-safety refinement is `Documented`, derived from
`DIVE-IAM-REQ-003`, `DIVE-IAM-REQ-006`, `DIVE-IAM-REQ-011`,
`DIVE-IAM-REQ-012`, and `DIVE-IAM-REQ-017`, and explicitly authorized in chat
on 2026-10-04. It records the fail-closed rule and the separate command for
adding a center to an existing same-tenant membership. Implementation
conformance remains unclaimed.

The version 0.7 ordinary-credential handling and latest-wins reissue policy
were `Documented` from the explicit authorization recorded in chat on
2026-10-04. The credential-disposition part is superseded by version 1.6
below; bootstrap remains unchanged and separate. The same-tenant duplicate
policy, correlation boundary, and scope-command contract remain part of the
implementation target, without promoting the artifact status.

The version 1.6 bearer-retention clarification is `Documented` from the
explicit instruction recorded in chat on 2026-10-04. The application-owned
ordinary bearer remains the current acceptance credential, stored only as a
hash and retained until Clerk evidence proves an equivalent exact-correlation
replacement and that replacement is explicitly approved. The administrative
HTTP contract must not expose the bearer, its hash, or delivery secret.

The version 0.8 canonical-address and exact Clerk-local correlation contract
is `Documented` from the explicit acceptance of the proposed solution in chat
on 2026-10-04. It defines the local comparison value, immutable attempt
reference, provider invitation identifier and fail-closed acceptance boundary.
Verification against the Clerk SDK and harness, migration and runtime tests
remain pending; the artifact status is unchanged.

The version 0.9 employee-record extension is superseded by the confirmed
employee-profile boundary below. The version 1.1 clarification is `Documented`
from the explicit decision recorded in chat on 2026-10-04: Owner/Admin may
create, edit and assign an operational employee profile whether or not it is
linked to a Clerk identity. The profile still cannot authenticate or authorize
access without an identity, and the artifact status remains unchanged.

The version 1.0 rejection of shared access accounts is `Documented` from the
explicit decision recorded in chat on 2026-10-04. Each person who needs access
uses an individual identity and session; this preserves attribution and
individual revocation without changing the existing role catalog. The
artifact status remains unchanged.

The version 1.4 role-assignment clarification is `Documented` from the
explicit decision recorded in chat on 2026-10-04. Roles are reusable catalog
definitions assigned individually to memberships; one membership may contain
multiple roles, while its allowed centers remain explicit at membership scope
for the MVP. Employee groups are outside the MVP permission model, and profile
presentation or operational-assignment data never grants authorization. The
artifact status remains unchanged.

The version 1.5 MVP employee-profile contract is `Documented` from the explicit
decision recorded in chat on 2026-10-04. It fixes the profile fields, active/
archived lifecycle, non-unique display names, explicit domain assignments,
audit/idempotency expectations and the separation between operational
qualifications and IAM permissions. Avatar upload, Clerk identity linking and
employee groups remain outside the MVP. The artifact status remains unchanged.

## Context

An invitation must create a pending membership with explicit roles and centers, but email is not a stable identity key. Pending memberships may be unbound; acceptance binds the authenticated identity and changes the membership to `active`. Memberships have only `pending`, `active`, and `disabled` states. The first pilot also reserves `external_collaborator` while keeping it disabled.

## Proposed decision

### Invitation and identity binding

- Store an invitation separately from the membership it controls.
- Creating an invitation creates an unbound `pending` membership in the target tenant with immutable proposed roles and center scopes.
- The invitation delivery address is routing and acceptance-validation data, not an identity identifier.
- Acceptance requires an authenticated `issuer + subject`, a valid Clerk Application Invitation acceptance context associated with exactly one local ordinary invitation, and a provider-verified address matching the invitation target.
- The authenticated principal and verified addresses come only from `IdentityProviderPort`; request fields and direct persistence-command arguments are never identity evidence. Persistence rejects empty principal identifiers, while provider verification remains an application-boundary responsibility.
- Ordinary dashboard authentication requires the stable `issuer + subject` binding and may carry no verified address. A non-empty provider-verified address match is required only for invitation acceptance.
- Acceptance binds the internal identity to the pending membership and changes it to `active` in one transaction.
- Pending memberships never authorize access and are not returned by access resolution.

This requires the persistence model to support a pending membership before identity binding without introducing placeholder identities.

### Role catalog and membership assignment

**Documented -- explicit decision 2026-10-04.** Owner/Admin assigns one or
more existing catalog roles to a membership. Effective capabilities are the
union of those roles, constrained by the explicit centers assigned to the
membership. `job_title`, nickname, avatar, employee profile and operational
assignments do not grant permissions. Permission groups are not part of the
MVP; any future group feature must resolve to the same explicit role and
center authorization boundary.

### Canonical target address and Clerk-local correlation

**Documented -- explicit acceptance 2026-10-04.** The invitation stores the
original target address for delivery and audit, and a canonical target address
for comparison and pending-invitation uniqueness. Canonicalization trims
Unicode whitespace, applies Unicode `NFKC`, requires exactly one `@` with
non-empty parts, converts the domain to lower-case IDNA/UTS-46 ASCII, and
uses lower-case comparison for the local part without removing dots, `+`
tags, hyphens or provider-specific aliases. Invalid or ambiguous addresses
are rejected. This is a comparison rule, not an identity key or an email
aliasing rule.

The pending uniqueness boundary is `(tenant_id, target_address_canonical)`;
the same canonicalization function is used on issuance, latest-wins lookup,
provider reconciliation and acceptance. The provider-verified address must
match this value. If Clerk's verified-address behavior cannot establish that
match unambiguously, acceptance fails closed rather than selecting by email.

Every local attempt receives an immutable `invitation_attempt_id` before
delivery. The Clerk Application Invitation's exact provider object identifier
is persisted as `provider_invitation_id`, together with provider kind `clerk`,
and is unique for the provider. Private Clerk metadata may carry the local
attempt identifier as a reconciliation hint, but it never supplies tenant,
role, center or activation authority. The ticket, link and browser reference
are not substitutes for the provider object identifier.

Acceptance must resolve the authenticated Clerk context to exactly one local
attempt through `provider_invitation_id`, then verify ordinary authority kind,
pending state, expiry, revocation/supersession, `issuer + subject` and the
provider-verified address before the local transaction binds and activates the
membership. A browser-return reference may select a candidate only. If Clerk
cannot expose or resolve the exact provider invitation identifier after
authentication, the provider-only replacement remains blocked and fails
closed. The existing DIVE bearer remains the acceptance mechanism until an
equivalent replacement is proven and explicitly approved; it must not be
introduced into the administrative HTTP response as a workaround.

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
- A retry with the same tenant-scoped command idempotency key returns the existing invitation identifiers, lifecycle state, and delivery status. The Clerk provider ticket is never returned in the administrative response or replayed through that response. An unknown or lost delivery outcome requires deliberate reissue, which revokes the previous provider invitation and local invitation attempt.
- A deliberate reissue revokes the previous pending invitation and membership and creates a new immutable local/provider invitation pair. For the same canonical target address within one tenant, a new issuance with a different idempotency key is a latest-wins reissue: the prior pending invitation is revoked with a supersession reason and reference to the replacement before the replacement becomes current. Pending invitations for the same address in different tenants remain independent.
- `membership.invite` authorizes creation and reissue.
- `membership.disable` authorizes revocation of a pending invitation and disabling an active membership.
- A retry never creates a second invitation. Concurrent issuances for the same tenant and canonical target address are serialized so that only one pending invitation remains current. A membership that already exists in the tenant is not silently merged with an invitation; acceptance resolves the authenticated `issuer + subject` and returns a non-disclosing conflict without changing the existing membership.

### Scope omission and same-tenant center access

**Documented -- explicit authorization 2026-10-04.** No invitation or membership
operation may infer authority from an omitted value. Missing, null, empty,
unknown or ambiguous roles, permissions, tenant identifiers, center IDs or
resource scopes fail closed; they never mean "all", "current", or a default
role. Center-scoped roles require an explicit non-empty set of centers, and
every selected center must belong to the target tenant. Tenant-wide authority
exists only when a tenant-wide role is explicitly assigned. A null or empty
center set is valid only when the effective permission is tenant-wide; any
center-scoped permission denies without an explicit center.

An active center-scoped membership that needs access to another center in the
same tenant is updated through a separate `membership.scope.update` command.
Only an authorized Tenant Owner or Tenant Admin may invoke it for an active
non-owner membership in the same tenant. The command takes the explicit target
membership, an additive non-empty set of center IDs, and a tenant-scoped
idempotency key; tenant context comes from the authenticated handle, not from a
client tenant field. Every center must belong to that tenant. The command does
not alter roles, remove existing centers, activate pending or disabled
memberships, or grant tenant-wide access. Repeated center IDs are idempotent;
concurrent scope changes, disablement and role changes are serialized. The
write, audit record and outbox effect are atomic. An ordinary invitation
request against an active same-tenant membership returns a non-disclosing
conflict rather than silently converting to direct access. Cross-tenant access
still requires an ordinary invitation and acceptance.

Bootstrap grants remain outside this rule's ordinary membership command: their
tenant, centers and grants are resolved only through the bootstrap authority,
metadata, route and permissions owned by the onboarding specifications. No
bootstrap field or default is accepted as an ordinary invitation grant.

### Disabled external collaborator

- Keep `external_collaborator` reserved in the stable role catalog.
- Reject it in new invitations and active role assignments during the first pilot.
- If an imported or stale membership contains `external_collaborator`, deny authorization for the whole membership, including mixed-role assignments.

## Consequences

- Invitation delivery can change without changing identity semantics.
- Invitation state is auditable without overloading membership status.
- The application uses Clerk Application Invitations for ordinary provider ticket, identity enrollment and delivery, while PostgreSQL remains authoritative for the local invitation and membership lifecycle.
- Persistence needs a reversible migration for unbound pending memberships, provider references, supersession references/reasons, canonical target-address uniqueness among pending invitations, and invitation records. The canonical address and exact Clerk-local correlation contract above owns the comparison and association boundary; implementation must still verify the Clerk SDK/harness behavior before enabling the constraint and acceptance path.
- Existing active rows containing `external_collaborator` require a pre-activation data check.

## Alternatives considered

- Create a placeholder identity from email: rejected because email is not a stable identifier.
- Create the membership only after acceptance: rejected because `DIVE-IAM-REQ-017` requires invitation to create a pending membership.
- Allow `external_collaborator` as an active capability-free role: rejected because an apparently active assignment is ambiguous and mixed roles could accidentally grant access.
- Update a pending invitation in place on reissue: rejected because immutable attempts provide clearer audit and idempotency behavior.
- Remove the application-owned ordinary bearer immediately: not selected because Clerk exact-correlation evidence is still pending. The bearer remains provisionally retained and must stay out of administrative HTTP responses until a replacement is proven and explicitly approved.

## Open questions

- **Documented:** ordinary invitations use Clerk Application Invitations with distinct ordinary-flow metadata, redirect, outbox purpose, acceptance command and authorization boundary. Bootstrap metadata, routes, grants, records and permissions remain separate.
- **Documented -- explicit instruction 2026-10-04:** the application-owned ordinary bearer remains in generation, hash persistence, acceptance and the internal delivery flow until an equivalent Clerk replacement is proven and explicitly approved. It must not appear in administrative HTTP responses, logs, errors or traces.
- **Documented:** the Clerk harness must prove the ticket-aware return for new and existing users and must reject ambiguity when the same address has pending invitations in multiple tenants. This is implementation evidence for a possible future replacement, not evidence that the current bearer can already be removed.
- **Documented:** the Clerk harness must verify that the Application Invitation object identifier can be recovered and associated with exactly one local attempt after both new-user and existing-user authentication. A missing, mismatched or ambiguous provider reference blocks bearer removal and fails the provider-only path closed.

### Documented employee profile without identity

**Documented -- explicit decision 2026-10-04.** A tenant Owner or Admin may
create and edit an operational employee profile without a Clerk identity,
`issuer + subject` or IAM membership. Such a profile does not authenticate,
authorize access or become a placeholder identity. Owner/Admin may also assign
the profile to existing activities, calendar/booking records and other
operational records whether or not it is linked to an identity.

The profile may also contain an optional `nickname` and optional avatar/photo
reference for visual distinction in calendar views. These are presentation
data, not an identity, credential or authorization. The image upload, storage,
format and privacy contract remains open.

Although the MVP does not execute Clerk identity linking, the future design
reserves an `employee_profile_identity_link` relation with `tenant_id`,
`employee_profile_id`, `membership_id`, `issuer`, `subject`, `linked_at` and
nullable `unlinked_at`. The stable identity key is the exact `issuer + subject`
pair; email, nickname and avatar are not used for correlation. The MVP creates
no links and leaves these future-link fields unused.

A later ordinary invitation may reference that exact local profile and, after
normal Clerk correlation and acceptance, bind the authenticated identity and
activate the explicit membership. The assignment capability does not grant
application access to the employee while the profile has no identity.

Existing activity/catalog and calendar/booking contracts remain owned by
the booking and scheduling specifications. Any relation between an employee
profile and an activity, scheduled activity or center must reuse those
contracts and preserve tenant/center scope; it is not implied by this IAM
proposal. Individual identities and sessions are required for every person who
needs access.

The MVP profile contract is:

- required fields are `id`, `tenant_id`, `display_name`, `status`, `created_at`
  and `updated_at`;
- optional fields are `nickname`, `avatar_asset_id`, `given_name`,
  `family_name`, `job_title`, `contact_email` and `phone`;
- profiles start as `active`, may become `archived`, and archived profiles do
  not receive new assignments;
- `display_name` and `nickname` are not unique, and physical deletion is not
  allowed while history or a referenced assignment remains;
- activity/calendar assignments use explicit domain-owned relations rather than
  a generic polymorphic relation; create, edit, archive, assign and remove
  operations are auditable, idempotent and serialized under concurrent writes;
- Owner/Admin management remains limited by tenant and authorized center scope.

The avatar upload/storage contract and future Clerk-link lifecycle remain
outside the MVP. This decision does not alter
`DIVE-IAM-REQ-017`, add a role or permission, or authorize implementation of
Deferred `SPEC-DIVE-OPS-001`.

### Ordinary Clerk invitation delivery

**Documented — approved 2026-10-04.** Ordinary invitation delivery uses Clerk
Application Invitations with a distinct ordinary-invitation metadata key,
redirect route, outbox purpose, acceptance command and authorization boundary.
Clerk owns identity enrollment, provider ticket and email delivery. DIVE
remains authoritative for the existing tenant, pending membership, roles,
centers, expiry, revocation and activation.

The ordinary flow does not reuse bootstrap metadata, routes, grants, records or
permissions. Shared provider transport and error handling are allowed, but
bootstrap and ordinary invitations remain separate authority kinds.

The application-owned ordinary bearer credential remains in generation,
hashing, persistence, outbox and acceptance contracts while the exact Clerk
replacement is unproven. It must not be returned in administrative HTTP
responses. Acceptance may use the bearer together with the existing identity,
verified-address, state, expiry and tenant checks. A browser-return reference
may select a candidate for a future provider-only path, but it is not authority
and cannot replace provider validation; email alone is not an adequate
association when the same address can have invitations in multiple tenants.

**Historical rationale — Documented.** The application-owned credential was
introduced in commit `3c77591` together with the initial ordinary invitation
vertical. It provided a provider-neutral bearer, one-way persistence through a
hash, and a value that could be emitted once to a trusted delivery boundary.
The ADR did not authorize returning that value from an administrative HTTP
response. Clerk now provides a potential delivery and enrollment capability,
but the repository has not yet demonstrated an equivalent exact-correlation
acceptance path for every required case. Retaining the bearer therefore remains
the current decision until that evidence and a follow-up approval exist.

## Acceptance criteria / evidence

- Transition-table tests cover every allowed and forbidden transition.
- Acceptance binds only the authenticated intended principal.
- Cross-tenant, wrong-address, expired, revoked, and replayed acceptance attempts fail without disclosure.
- Roles and centers cannot change between issuance and acceptance.
- Missing or omitted scope never grants a role, permission, tenant or center; center-scoped roles require explicit valid centers.
- Same-tenant center assignment for an active membership changes only explicitly selected centers through its separate authorized command; it does not infer all centers or silently convert an invitation.
- Reissue, acceptance, membership change, audit, and outbox behavior are transactional and idempotent.
- Clerk ticket-aware return resolves exactly one local ordinary invitation for new and existing users.
- A second issuance for the same canonical address in one tenant revokes the previous pending invitation before creating the current replacement; same-key retries do not reissue, while different tenants remain independent.
- Provider-reference manipulation, provider/local mismatch, ambiguous provider outcome, and concurrent reissue fail closed without activating access or creating duplicate current invitations.
- Canonicalization tests cover Unicode whitespace, `NFKC`, domain IDNA/case normalization, local-part comparison, preserved dots and `+` tags, invalid addresses, tenant-scoped pending uniqueness and concurrent latest-wins issuance.
- The provider correlation test covers the immutable local attempt identifier, unique Clerk Application Invitation identifier, ordinary/bootstrap separation, provider-verified address matching and failure when Clerk cannot return an exact identifier.
- Two pending invitations for the same address in different tenants cannot be confused or cross-accepted.
- External collaborator assignments are rejected and stale rows fail closed.