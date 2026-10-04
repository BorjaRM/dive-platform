# SPEC-DIVE-IAM-INVITATIONS-001 - Ordinary tenant invitations

- **Status:** Ready to start
- **Version:** 1.3
- **Last reviewed:** 2026-10-04
- **Owner:** Product / Security
- **Approval reference:** Requirements extracted from SPEC-DIVE-IAM-001 at commit `86e9d97`; ordinary Clerk Application Invitation delivery, retention of the application-owned bearer pending equivalent Clerk evidence, HTTP non-disclosure, and the remaining invitation recommendations explicitly authorized in chat on 2026-10-04. This revision does not promote the SPEC status.

## Normative authority

**Documented:** owns only the requirements declared below, extracted verbatim from [SPEC-DIVE-IAM-001](SPEC-DIVE-IAM-001.md). Original Derived/Proposed classifications, sources and approvals are preserved. This file does not authorize unrelated contracts or infer conformance from implementation existence.

## Requirement provenance

| Requirement IDs | Provenance | Exact source | Decision status |
|---|---|---|---|
| `DIVE-IAM-REQ-017` | `Proposed` | PR #1 invitation, owner-lockout, MFA-readiness, and support-access decisions | Approved by product owner for MVP validation |

## Requirements

- **DIVE-IAM-REQ-017:** Invitation creates a pending membership in one tenant with explicit roles and centers.

### Documented extension: reusable roles and individual assignment

**Documented -- explicit decision 2026-10-04.** Roles are reusable IAM catalog
definitions, not permissions created for an individual employee. Owner or Admin
may assign one or more roles to each membership; a worker may therefore hold
multiple roles. The allowed centers are assigned explicitly to the membership
as a whole for the MVP. Effective capabilities are the union of the assigned
roles, constrained by those centers.

Employee groups are outside the MVP permission model. A profile's `job_title`,
nickname, avatar, operational assignment or lack of identity must not grant
permissions. A profile without an identity and membership has no application
access, even when Owner/Admin can manage and assign it operationally.

### Documented extension: MVP operational profile contract

**Documented -- explicit decision 2026-10-04.** The operational profile must
contain `id`, `tenant_id`, `display_name`, `status`, `created_at` and
`updated_at`. `nickname`, `avatar_asset_id`, `given_name`, `family_name`,
`job_title`, `contact_email` and `phone` are optional. `job_title` describes an
operational qualification or function, such as instructor or divemaster, and
never grants IAM permissions.

The profile starts as `active` and may become `archived`. Archived profiles are
retained for history and receive no new assignments. `display_name` and
`nickname` are not unique. Physical deletion is not allowed while history or a
referenced assignment remains.

Assignments use explicit relations owned by each activity/calendar domain, not
a generic polymorphic relation. Creation, editing, archiving, assignment and
removal are auditable by actor, idempotent and serialized under concurrent
writes. Owner/Admin may manage profiles and assignments within the tenant and
their authorized center scope.

Avatar upload/storage, Clerk identity linking and employee groups are outside
the MVP implementation scope.


**Documented -- explicit decision 2026-10-04.** A tenant Owner or Admin may
create and edit an operational employee profile without creating a Clerk
identity or an IAM membership. The profile has no `issuer + subject`, cannot
authenticate, has no permissions and is not a pending authorization grant. It
is distinct from the pending membership created by an ordinary invitation.

The Owner or Admin may assign the profile to existing activities,
calendar/booking records and other operational records regardless of whether
the profile is linked to an identity. These administrative assignments do not
grant the profile or the employee access to the application. They must preserve
the tenant and center scope of the existing owning contract.

**Documented -- explicit decision 2026-10-04.** The profile may include an
optional `nickname` and an optional avatar/photo reference so calendar users can
distinguish assigned employees visually. These are presentation data, not an
identity, credential or authorization. The image upload, storage, format and
privacy contract remains open.

**Documented -- explicit decision 2026-10-04.** Although the MVP does not
execute Clerk identity linking, the future design reserves an
`employee_profile_identity_link` relation with `tenant_id`,
`employee_profile_id`, `membership_id`, `issuer`, `subject`, `linked_at` and
nullable `unlinked_at`. The stable identity key is the exact `issuer + subject`
pair; email, nickname and avatar are not used for correlation. The MVP creates
no links and leaves these future-link fields unused.

If access is needed later, an ordinary Clerk invitation may reference that
specific local employee profile. Acceptance must preserve the existing exact
Clerk-local correlation contract, bind the authenticated `issuer + subject` to
the profile and activate an explicit membership transactionally. Email alone
must not perform the binding. A failed, revoked or expired invitation leaves
the operational profile without access.

The employee cannot view activities or the
calendar without an identity. Existing activity/catalog and calendar/booking
contracts remain owned by [SPEC-DIVE-BOOKING-001](../booking/SPEC-DIVE-BOOKING-001.md)
and [SPEC-DIVE-BOOKING-SCHEDULING-001](../booking/SPEC-DIVE-BOOKING-SCHEDULING-001.md);
this extension does not replace them. The MVP profile schema, lifecycle,
duplicate policy and assignment boundary are documented above; executable
implementation must preserve tenant and center scope. It does not change `DIVE-IAM-REQ-017` or
authorize implementation of Deferred
`SPEC-DIVE-OPS-001`.

**Documented -- shared accounts rejected, 2026-10-04.** A center must not use a
shared Clerk account as the access model for its employees. Any worker who
needs access uses an individual identity and session so actions remain
attributable and revocation can be performed per person. This proposal does
not change the existing IAM role catalog or grant a new permission.

## Boundary and verification

**Documented:** ADR-DIVE-004 owns ordinary Clerk Application Invitation delivery and the local invitation lifecycle; SPEC-DIVE-IAM-001 owns roles, last-Owner protection and revocation. Ordinary invitations belong to existing tenants and cannot bootstrap a tenant. Bootstrap grants belong to SPEC-DIVE-ONBOARDING-001. Test issue, safe response, revoke, Clerk ticket association and cross-tenant denial.

### Invitation service boundary

**Documented -- implementation status, 2026-10-04:** ordinary membership issue/revoke routes are exposed at `/v1/memberships/invitations` and ownership issue/revoke routes at `/v1/ownership/invitations`. Both derive tenant access from the authorized tenant-context handle through `TenantContextService`; a request-body `tenantId` is not an authority input. Ownership routes use a dedicated database command that requires an active owner actor and a pending owner invitation target. This documents the current implementation and does not promote the SPEC status or close the separate response boundary.

- `respondToInvitation` needs a separate Clerk-ticket-bound tenant-resolution design because an invitee may not have an active tenant membership.
- Cross-tenant, spoofed-tenant, missing-context, and provider-ticket-boundary tests remain required for the complete invitation slice; the current route tests cover the issue/revoke boundary and spoofed request-body tenant input.

Source context: `DIVE-IAM-REQ-006`, `DIVE-IAM-REQ-017`, `DIVE-IAM-REQ-024`, `DIVE-IAM-REQ-025`, `DIVE-IAM-REQ-028`, `DIVE-IAM-REQ-030`; `apps/api/src/iam/invitations/invitations.service.ts`; `packages/database/src/iam-membership-commands.ts`.

### Scope omission and existing membership

**Documented -- explicit authorization 2026-10-04.** An ordinary invitation
must carry an explicit role selection and, for every center-scoped role, an
explicit non-empty list of valid centers belonging to the target tenant.
Missing, null, empty, unknown or ambiguous values fail closed; they never mean
all centers or a default role. Tenant-wide roles grant tenant-wide authority
only when they are explicitly selected. Mixed roles do not make a
center-scoped permission tenant-wide, and a null or empty center set is valid
only when every effective permission is tenant-wide. Scope ownership and the
direct membership command are defined by [SPEC-DIVE-IAM-001](SPEC-DIVE-IAM-001.md).

If the authenticated target identity already has an active membership in the
same tenant, acceptance returns a non-disclosing conflict and does not merge,
activate or alter that membership. Adding another center uses the separate
`membership.scope.update` command; it does not send or consume another
ordinary invitation. Pending or disabled memberships are not silently
activated by either path.

Membership in a different tenant still requires an ordinary invitation and
acceptance. Bootstrap invitations remain a separate authority kind and do not
inherit these ordinary membership defaults, metadata, grants or commands.

### Ordinary Clerk invitation delivery

**Documented — approved 2026-10-04.** Ordinary invitations use Clerk
Application Invitations for provider ticket, identity enrollment, verified
address and email delivery, following the provider pattern selected for
bootstrap. The ordinary flow uses its own metadata key, redirect route, outbox
purpose, acceptance command and authorization boundary.

PostgreSQL remains authoritative for the existing tenant, pending membership,
roles, centers, expiry, revocation and activation. Clerk authentication or
metadata never grants a tenant role by itself. The acceptance flow must resolve
one ordinary invitation through the ticket-aware return or a protected local
reference; it must not select an invitation from email alone.

The application-owned ordinary bearer credential remains in generation,
hashing, persistence, acceptance and the internal delivery flow until an
equivalent Clerk replacement is demonstrated and explicitly approved. The
administrative response is a safe projection with invitation and membership
identifiers, status, expiry and delivery state only; it must not expose the
bearer or its hash. Bootstrap remains a separate authority kind and does not
consume ordinary invitation records.

A provider ticket, Clerk metadata value, verified email or client-supplied
tenant, center or role field never grants membership authority by itself. The
local invitation or explicit same-tenant membership command remains the source
of roles, centers and tenant scope. A browser-return reference only selects a
candidate local attempt; the server must verify the provider reference and
local correlation before acceptance.

### Canonical address and exact provider correlation

**Documented -- explicit acceptance 2026-10-04.** The local invitation stores
the original target address and a canonical comparison value. Canonicalization
trims Unicode whitespace, applies `NFKC`, requires one non-empty local part and
domain, converts the domain to lower-case IDNA/UTS-46 ASCII, and compares the
local part in lower case without applying provider-specific dot or `+` alias
rules. Invalid or ambiguous values fail closed. The canonical value is used
only for pending-invitation uniqueness, latest-wins lookup and verified-address
comparison; it is not an identity or tenant selector.

The pending uniqueness key is `(tenant_id, target_address_canonical)`. Each
attempt gets an immutable local `invitation_attempt_id` before delivery. The
worker persists the exact Clerk Application Invitation object identifier as
`provider_invitation_id`, with provider kind `clerk`, and enforces its
uniqueness. Private provider metadata may repeat the local attempt identifier
for reconciliation, but cannot carry authorization data. Tickets, links,
browser references and email addresses are not substitutes for that exact
provider identifier.

The provider-only replacement path must resolve the authenticated Clerk
context to exactly one local ordinary attempt, then verify pending state,
expiry, revocation or supersession, `issuer + subject` and the
provider-verified canonical address before activating the membership
transactionally. If the exact provider identifier cannot be recovered or the
association is ambiguous, that replacement path fails closed. Until it is
proven and approved, the existing bearer acceptance path remains available
under the same local state, identity, address, tenant and non-disclosure
checks.

**Historical rationale — Documented.** The application-owned credential was
introduced in commit `3c77591` as a provider-neutral, one-way-stored bearer for
the trusted delivery boundary. It was not intended to be an administrative HTTP
response field. The approved Clerk integration may eventually replace that
second bearer, but the required unambiguous return association is not yet
demonstrated for every required case. The bearer therefore remains pending a
future replacement decision.

**Implementation evidence — Documented.** The Clerk harness must prove that a
new user and an existing user can complete the ordinary flow, that the return
identifies the intended local invitation, and that two pending invitations for
the same address cannot be confused. This evidence is required before deciding
whether an application bearer can be retired; it does not by itself retire the
current bearer or authorize exposing it through an administrative HTTP
response.

The implementation evidence must also show that omitted or invalid role and
center scope fails closed without creating or activating access, and that
same-tenant center expansion changes only explicitly selected centers through
its separate authorized membership command.

The implementation evidence must also show that a retry with the same
idempotency key returns the existing invitation, while a new issuance for the
same canonical address in the same tenant revokes the prior pending invitation
and creates one current replacement. Concurrent issuance, provider timeout,
provider/local reference mismatch, old-ticket use after reissue, and
cross-tenant same-address invitations must not activate the wrong membership.

The implementation evidence must also validate the canonicalization cases,
the tenant-scoped pending uniqueness constraint and recovery of the exact
Clerk Application Invitation identifier for new and existing users. Clerk SDK
and harness behavior, the SQL/TypeScript migration and executable acceptance
coverage remain pending; this contract does not promote the SPEC status.
