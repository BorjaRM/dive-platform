# SPEC-DIVE-ONBOARDING-001 — Controlled operator bootstrap and guided first-center onboarding

- **Status:** Draft
- **Version:** 0.1
- **Last reviewed:** 2026-09-27
- **Approved by:** Borja (product owner) for Draft review
- **Approval reference:** Product-owner confirmations on 2026-09-27; this Draft PR is the review record
- **Owner:** Product / Security / Frontend Architecture
- **IDs:** `DIVE-ONB-REQ-001` … `DIVE-ONB-REQ-036`

## Normative authority

This SPEC governs the controlled creation of an operator tenant, its first center, the initial Tenant Owner path, and the optional guided experience in `apps/web`.

`SPEC-DIVE-IAM-001` remains authoritative for identities, memberships, tenant roles, permissions, tenant context, and invitation acceptance. `ADR-DIVE-002` remains authoritative for the transactional outbox. `ADR-DIVE-013` owns the architecture choices introduced by this flow.

The decisions below were explicitly confirmed by the product owner, but this artifact remains Draft until this pull request is reviewed and merged. This Draft does not authorize implementation.

## Requirement provenance

| Requirement IDs | Provenance | Exact source | Decision status |
|---|---|---|---|
| `DIVE-ONB-REQ-001..DIVE-ONB-REQ-004` | `Derived` | `specs/product/dive-mvp-profile.md` §6; `SPEC-DIVE-IAM-001` `DIVE-IAM-REQ-001..006`; product-owner confirmation 2026-09-27 | Approved by product owner for Draft review; pending merge |
| `DIVE-ONB-REQ-005..DIVE-ONB-REQ-019` | `Proposed` | Product-owner confirmations 2026-09-27; `ADR-DIVE-013` Draft | Approved by product owner for Draft review; pending merge |
| `DIVE-ONB-REQ-020..DIVE-ONB-REQ-026` | `Proposed` | Product-owner confirmations 2026-09-27; `ADR-DIVE-013` Draft § Fields and presentation | Approved by product owner for Draft review; pending merge |
| `DIVE-ONB-REQ-027..DIVE-ONB-REQ-035` | `Proposed` | Product-owner confirmations 2026-09-27; `ADR-DIVE-013` Draft § Guided experience | Approved by product owner for Draft review; pending merge |
| `DIVE-ONB-REQ-036` | `Proposed` | Product-owner confirmation of the twelve-block acceptance matrix on 2026-09-27 | Approved by product owner for Draft review; pending merge |

### Derivations

- **DIVE-ONB-REQ-001:** the MVP walking skeleton starts with creating a tenant and center, but the current profile does not define a public onboarding contract; a separate controlled flow is therefore required before the product skeleton can start.
- **DIVE-ONB-REQ-002..004:** Clerk authenticates while PostgreSQL owns memberships and authorization; roles in one tenant cannot authorize creation in another tenant, and client-supplied tenant identifiers cannot become authority.

## Goal

Let an explicitly authorized identity or internal platform operator create one operator tenant and its first center without manual database preparation, while preserving tenant isolation, auditable authority, atomicity, and an optional guided UI that does not duplicate the functional flow.

## Scope

### In scope

- Platform-issued bootstrap invitations.
- Self-service bootstrap by the invited future Owner.
- Assisted provisioning by explicitly authorized platform staff for a designated Owner.
- Atomic tenant, first-center, initial membership/invitation, audit, and outbox persistence.
- Owner acceptance, tenant operability, idempotency, non-disclosure, and rate limits.
- Optional Driver.js guidance behind an internal renderer port.
- Spanish and English copy, local visual preferences, accessibility, rollout controls, and expected evidence.

### Out of scope

- Public operator signup.
- Billing, plans, payments, VAT/tax identifiers, invoices, fiscal address, and payment methods.
- Public center contact data, public slug, additional centers, activities, slots, or channel publication.
- Clerk Organization as membership or authorization authority.
- A CMS or external analytics provider for the MVP.
- A new tenant lifecycle status independent of active Owner membership.

## Model and definitions

- **Bootstrap invitation:** platform-issued, pre-tenant capability authorizing one controlled bootstrap.
- **Self bootstrap:** the invited authenticated identity becomes the initial Tenant Owner.
- **Assisted provisioning:** authorized platform staff create the tenant and center for a different designated Owner; staff receive no tenant membership.
- **Provisioned:** tenant, first center, pending Owner membership/invitation, audit, and outbox records were committed.
- **Operational:** at least one Tenant Owner membership is active, so tenant context may be issued under `SPEC-DIVE-IAM-001` and `ADR-DIVE-008`.
- **Guidance state:** non-authoritative browser preference recording whether the guide was dismissed or completed.

## Requirements

- **DIVE-ONB-REQ-001:** Operator and first-center bootstrap MUST require an explicitly authorized path and MUST NOT expose public operator signup.
- **DIVE-ONB-REQ-002:** Clerk MUST authenticate the external identity; PostgreSQL MUST remain authoritative for tenants, memberships, roles, scopes, bootstrap records, and operability.
- **DIVE-ONB-REQ-003:** A valid bootstrap invitation MAY be redeemed by its bound identity regardless of memberships in other tenants; roles in those tenants MUST neither authorize nor block the bootstrap.
- **DIVE-ONB-REQ-004:** Tenant identifiers, center identifiers, roles, and permissions supplied by the browser MUST NOT authorize bootstrap or select another tenant.
- **DIVE-ONB-REQ-005:** Bootstrap invitations MUST be issued and revoked only by explicitly authorized platform staff through a platform capability separate from tenant roles and read-only platform support.
- **DIVE-ONB-REQ-006:** A bootstrap invitation MUST be delivered to a specific email; redemption MUST require an authenticated Clerk identity with that verified email, then permanently bind the redemption to provider `issuer + subject`.
- **DIVE-ONB-REQ-007:** A bootstrap invitation MUST be single-use, revocable, valid for seven days, and invalidated when reissued.
- **DIVE-ONB-REQ-008:** Bootstrap redemption MUST allow at most ten attempts per authenticated identity and Clerk session per minute.
- **DIVE-ONB-REQ-009:** Unknown, malformed, expired, revoked, already-consumed, email-mismatched, and identity-mismatched invitations MUST fail without disclosing which condition occurred.
- **DIVE-ONB-REQ-010:** Self bootstrap MUST create the invited authenticated identity's active Tenant Owner membership; it MUST NOT allow that identity to designate another Owner through the self-service command.
- **DIVE-ONB-REQ-011:** Assisted provisioning MUST use a separate application command, MUST designate the intended Owner, and MUST NOT grant the initiating platform staff a tenant membership.
- **DIVE-ONB-REQ-012:** One PostgreSQL transaction MUST create the tenant, first center, active Owner membership or pending Owner membership/invitation, audit records, and transactional outbox records.
- **DIVE-ONB-REQ-013:** Failure of any write in that transaction MUST roll back every bootstrap write; external invitation delivery MUST occur only after commit through the outbox worker.
- **DIVE-ONB-REQ-014:** An assisted tenant MUST remain non-operational until the designated Owner accepts and an active Tenant Owner membership exists.
- **DIVE-ONB-REQ-015:** Tenant operability MUST be derived from an active Tenant Owner membership; this flow MUST NOT add a duplicate `provisioned` / `active` tenant status.
- **DIVE-ONB-REQ-016:** The server MUST NOT issue tenant context for an assisted tenant before the designated Owner membership is active.
- **DIVE-ONB-REQ-017:** Assisted provisioning completion and US-19 completion MUST be separate milestones: provisioning completes at atomic creation; US-19 completes after Owner acceptance and tenant-context eligibility.
- **DIVE-ONB-REQ-018:** The bootstrap invitation MUST be the idempotency key: retrying the same normalized payload MUST return the same result, while a different payload for the consumed invitation MUST fail as a conflict.
- **DIVE-ONB-REQ-019:** Concurrent redemption attempts MUST use a database uniqueness constraint and transactional serialization so that they cannot create duplicate tenants, centers, memberships, audits, or outbox records.
- **DIVE-ONB-REQ-020:** The initial form MUST require an operator display name and a first-center display name.
- **DIVE-ONB-REQ-021:** Operator and center display names MUST accept Unicode, trim outer whitespace, contain at least one character, allow at most 120 Unicode characters, and MUST NOT be globally unique or act as authorization identifiers.
- **DIVE-ONB-REQ-022:** The first center's IANA time zone MUST be required; the browser MAY suggest it, but the user MUST confirm it before submission.
- **DIVE-ONB-REQ-023:** The interface language MUST support `es` and `en`, MAY be suggested from browser or profile, MUST remain editable, and MUST be stored as an identity/user preference rather than tenant or center authority.
- **DIVE-ONB-REQ-024:** The form MUST require an explicit self-Owner or assisted-provisioning choice.
- **DIVE-ONB-REQ-025:** Assisted provisioning MUST require the designated Owner email and the verification behavior in `DIVE-ONB-REQ-006`; self bootstrap MUST NOT request a second Owner email.
- **DIVE-ONB-REQ-026:** The bootstrap form MUST NOT collect billing, plan, payment, tax, fiscal-address, public-contact, custom-domain, or additional-center data.
- **DIVE-ONB-REQ-027:** The functional bootstrap flow MUST work without Driver.js; guidance MUST remain optional, dismissible, manually restartable, and unable to complete or authorize a domain operation.
- **DIVE-ONB-REQ-028:** Driver.js MUST be isolated behind an internal guidance-renderer interface; product flows, forms, navigation decisions, server mutations, progress authority, and completion rules MUST NOT import or depend on Driver.js APIs.
- **DIVE-ONB-REQ-029:** Initial guidance state MAY use `localStorage` only for versioned, identity-scoped `dismissed` or `completed` preferences; it MUST NOT store tokens, tenant context, authorization state, form contents, or functional progress.
- **DIVE-ONB-REQ-030:** Dismissing or completing a guide MUST suppress automatic replay on that browser; a new guide version MUST NOT replay automatically; `Help → Repeat guide` MUST allow manual replay.
- **DIVE-ONB-REQ-031:** Guide copy MUST ship in versioned `es` / `en` catalogs behind an internal content interface so that a future CMS can replace the source without changing product flows or renderer contracts.
- **DIVE-ONB-REQ-032:** The MVP MUST expose a typed analytics port for `started`, `dismissed`, `completed`, and `restarted`; its initial implementation MUST be no-op and MUST NOT send data to an external provider.
- **DIVE-ONB-REQ-033:** The guided experience MUST satisfy WCAG 2.2 AA before pilot, including keyboard access, focus placement and restoration, Escape behavior, assistive-technology semantics, contrast, reduced motion, mobile layouts, and non-blocking behavior when a target is absent.
- **DIVE-ONB-REQ-034:** Provisioning and visual guidance MUST have independent rollout controls so either capability can be disabled without disabling the other or existing dashboard access.
- **DIVE-ONB-REQ-035:** US-19 MUST end at the new tenant dashboard with the first center selected; activity creation belongs to a subsequent flow and MUST NOT be added to this story.
- **DIVE-ONB-REQ-036:** Automated and manual evidence MUST cover all acceptance scenarios listed below before this SPEC can move beyond Draft.

## States and invariants

```text
bootstrap invitation: issued → consumed
                     ↘ revoked
                     ↘ expired

assisted milestone: invitation valid → provisioned → Owner accepted → operational
self milestone:     invitation valid → operational
```

Invariants:

- One bootstrap invitation produces at most one tenant result.
- A provisioned assisted tenant without an active Owner is not operational.
- Platform staff performing assisted provisioning do not become tenant members.
- Guide state never substitutes domain state.
- A tenant context is never issued from browser-provided tenant selection.

## Edge cases and acceptance scenarios

The mandatory acceptance matrix is:

1. Self bootstrap creates tenant, active Owner, first center, audit, and outbox atomically.
2. Assisted provisioning creates a non-operational tenant, first center, and pending Owner invitation.
3. Owner acceptance activates membership, enables tenant context, and lands at the new tenant dashboard.
4. Any write failure rolls back every bootstrap artifact and sends no pre-commit email.
5. Same-payload retry returns the same result; changed payload conflicts; concurrent tabs create no duplicates.
6. Unknown, expired, revoked, consumed, email-mismatched, and identity-mismatched invitations fail without disclosure and are rate-limited.
7. Cross-tenant access is denied and prior memberships neither authorize nor block valid bootstrap.
8. The functional flow completes with Driver.js disabled or replaced.
9. Guide auto-show, dismissal, completion, manual replay, and `localStorage` identity/version separation behave as specified.
10. `es` / `en`, confirmed time zone, mobile behavior, and WCAG 2.2 AA are validated.
11. Provisioning and guidance rollout controls operate independently.
12. Tokens, tenant context, form contents, and unnecessary personal data do not appear in browser persistence, logs, audit, outbox payloads, or analytics.

## API, events, and data

Conceptual application commands:

- `IssueTenantBootstrapInvitation`
- `RevokeTenantBootstrapInvitation`
- `CompleteOwnTenantBootstrap`
- `ProvisionTenantForOwner`

Owner invitation acceptance and reissue MUST reuse the existing IAM invitation commands rather than introduce onboarding-specific alternatives. HTTP paths and physical table/index names remain implementation details for a later contract/implementation PR and MUST preserve the requirements above.

Minimum persisted concepts:

- bootstrap invitation identifier and secret hash;
- intended email and expiry/revocation/consumption timestamps;
- bound `issuer + subject` after successful redemption;
- normalized request fingerprint and resulting tenant/center/membership references for idempotent replay;
- existing tenant, center, membership/invitation, audit, and outbox data.

Minimum outbox intents are tenant provisioned / Owner invitation delivery and tenant operational after Owner acceptance, but exact event names and payload schemas remain implementation-contract work. The raw invitation secret, Clerk token, and tenant-context handle MUST NOT enter event payloads.

## Security, privacy, isolation, and operations

- Bootstrap is authenticated and pre-tenant; it does not weaken RLS or use a migration role as an application role.
- The platform management capability is separate from tenant roles and read-only support.
- Email is used only for delivery and initial verified matching; stable identity binding remains `issuer + subject`.
- Every issue, reissue, revoke, consume, provision, invite, and activate action is audited with safe identifiers.
- Logs, traces, analytics, and audit redact raw tokens, invitation secrets, Clerk bearer values, and tenant-context handles.
- `MT-REQ-*` isolation evidence remains separate from `DIVE-ONB-*` product evidence.

## Performance and observability

No latency, bundle, or throughput budget is introduced. Implementation evidence must record the bootstrap transaction/query shape, the outbox handoff, and whether Driver.js is loaded only when guidance is enabled. Performance is not measured in this documentation PR.

## Errors, concurrency, and idempotency

- Invitation failures use one non-disclosing error contract.
- Payload mismatch after consumption is a conflict.
- Transaction failure exposes no partial success.
- Database uniqueness and transaction serialization are authoritative for concurrent consumption.
- Browser state and Driver.js callbacks are never idempotency authority.

## Migration, rollout, and rollback

- Roll out provisioning and guidance behind independent controls, limited initially to explicitly invited pilot identities and authorized internal staff.
- Rolling back guidance disables the renderer without disabling the functional form.
- Rolling back provisioning disables new bootstrap invitations/redemptions without removing existing tenant access.
- Database migrations and HTTP contracts require a later implementation PR with a reversible migration or explicit rollback procedure.

## Tests and expected evidence

- Domain/API tests for authorization, verified-email binding, atomicity, rollback, idempotency, concurrency, non-disclosure, rate limit, and cross-tenant isolation.
- Component tests for renderer/content/analytics ports, guide state, target absence, and accessibility behavior.
- Minimal Playwright coverage in `apps/web` for self bootstrap, assisted acceptance, guide dismissal/replay, and Driver.js-disabled completion.
- Manual WCAG 2.2 AA validation before pilot.
- No implementation or execution evidence is claimed by this Draft documentation PR.

## Open questions

No product question remains open within this Draft's reviewed scope. Implementation-specific HTTP paths, physical names, and event schemas require a later contract/implementation PR and MUST NOT change this behavior silently.

## Traceability

- Decision: `specs/architecture/adrs/ADR-DIVE-013.md`
- Identity and membership: `specs/iam/SPEC-DIVE-IAM-001.md`
- Tenant context: `specs/architecture/adrs/ADR-DIVE-008.md`
- Frontend state boundary: `specs/architecture/adrs/ADR-DIVE-009.md`
- Transactional outbox: `specs/architecture/adrs/ADR-DIVE-002.md`
- Map: `specs/traceability/TRACE-DIVE-MVP-001.md`
