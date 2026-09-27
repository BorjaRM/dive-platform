# SPEC-DIVE-ONBOARDING-001 — Controlled self bootstrap and guided first-center onboarding

- **Status:** Draft
- **Version:** 0.2
- **Last reviewed:** 2026-09-27
- **Approved by:** Borja (product owner) for Draft review
- **Approval reference:** PR #36 product-owner revision record
- **Owner:** Product / Security / Frontend Architecture
- **IDs:** `DIVE-ONB-REQ-001` … `DIVE-ONB-REQ-036`

## Normative authority

This SPEC governs invited self-service creation of an operator tenant, its first center, the initial active Tenant Owner membership, and the optional guided experience in `apps/web`.

`SPEC-DIVE-IAM-001` remains authoritative for identities, memberships, tenant roles, permissions, tenant context, and ordinary tenant invitations. `ADR-DIVE-002` remains authoritative for the transactional outbox. `ADR-DIVE-013` owns the architecture choices introduced by this flow.

The product owner narrowed US-19 to self bootstrap only. Assisted provisioning by platform staff is outside this story. This artifact remains Draft and does not authorize implementation.

## Requirement provenance

| Requirement IDs | Provenance | Exact source | Decision status |
|---|---|---|---|
| `DIVE-ONB-REQ-001`, `003`, `005..020`, `022..028`, `031..035` | `Proposed` | PR #36 product-owner revision record; `ADR-DIVE-013` Draft | Approved for Draft review; pending merge |
| `DIVE-ONB-REQ-002` | `Derived` | `SPEC-DIVE-IAM-001` `DIVE-IAM-REQ-001..006`; PR #36 product-owner revision record | Approved for Draft review; pending merge |
| `DIVE-ONB-REQ-004` | `Derived` | `SPEC-DIVE-IAM-001` `DIVE-IAM-REQ-002..006`; `ADR-DIVE-008` § Authorization path | Approved for Draft review; pending merge |
| `DIVE-ONB-REQ-021` | `Proposed` | PR #32 SDD Gatekeeper remediation: NFC normalization + Unicode code-point counting | Proposed closure; pending product-owner confirmation |
| `DIVE-ONB-REQ-029..030` | `Proposed` | PR #32 SDD Gatekeeper remediation: stable storage key + version metadata | Proposed closure; pending product-owner confirmation |
| `DIVE-ONB-REQ-036` | `Derived` | `specs/foundation/sdd-specs-traceability.md` § Spec lifecycle / Definition of Ready / Definition of Done | Lifecycle rule documented; scenario completeness pending review |

### Derivations

- **DIVE-ONB-REQ-002:** Clerk authenticates while PostgreSQL owns memberships and authorization; bootstrap cannot move tenant authority into Clerk.
- **DIVE-ONB-REQ-004:** existing multi-tenant authorization rules prohibit browser-provided tenant, center, role, or permission values from becoming authority.
- **DIVE-ONB-REQ-036:** Ready to start requires verifiable scenarios and closed critical decisions; executed evidence is required later for Review/Accepted and pilot gates.

## Goal

Let an explicitly invited future Owner create its own operator tenant and first center without manual database preparation or public signup, while preserving isolation, auditable authority, atomicity, and optional replaceable guidance.

## Scope

### In scope

- Platform-issued bootstrap invitations managed through a dedicated pre-tenant capability.
- Self-service bootstrap by the invited future Owner.
- Atomic tenant, first-center, active Owner membership, invitation consumption, audit, and outbox persistence.
- Idempotency, non-disclosure, rate limits, and concurrency protection.
- Optional Driver.js guidance behind an internal renderer port.
- Spanish and English copy, local visual preferences, accessibility, rollout controls, and expected evidence.

### Out of scope

- Public operator signup.
- Assisted provisioning: platform staff do not create tenant, center, or Owner membership for a customer.
- Billing, plans, payments, VAT/tax identifiers, invoices, fiscal address, and payment methods.
- Public center contact data, additional centers, activities, slots, or channel publication.
- Clerk Organization as membership or authorization authority.
- A CMS or external analytics provider for the MVP.
- A new tenant lifecycle status independent of active Owner membership.

## Model and definitions

- **Bootstrap invitation:** platform-issued, pre-tenant capability authorizing one invited identity to complete its own bootstrap.
- **Self bootstrap:** the invited authenticated identity confirms the data and becomes the initial active Tenant Owner.
- **Operational:** an active Tenant Owner membership exists and the approved center-entry prerequisites allow tenant context to be issued.
- **Guidance state:** non-authoritative browser preference recording whether the guide was dismissed or completed.

## Requirements

- **DIVE-ONB-REQ-001:** Operator and first-center bootstrap MUST require an explicitly authorized path and MUST NOT expose public operator signup.
- **DIVE-ONB-REQ-002:** Clerk MUST authenticate the external identity; PostgreSQL MUST remain authoritative for tenants, memberships, roles, scopes, bootstrap records, and operability.
- **DIVE-ONB-REQ-003:** A valid bootstrap invitation MAY be redeemed by its bound identity regardless of memberships in other tenants; roles in those tenants MUST neither authorize nor block the bootstrap.
- **DIVE-ONB-REQ-004:** Tenant identifiers, center identifiers, roles, and permissions supplied by the browser MUST NOT authorize bootstrap or select another tenant.
- **DIVE-ONB-REQ-005:** Bootstrap invitations MUST be issued, reissued, and revoked only by explicitly authorized platform staff through a pre-tenant capability separate from tenant roles and read-only platform support.
- **DIVE-ONB-REQ-006:** A bootstrap invitation MUST be delivered to a specific email; redemption MUST require an authenticated Clerk identity with that verified email, then permanently bind the redemption to provider `issuer + subject`.
- **DIVE-ONB-REQ-007:** A bootstrap invitation MUST be single-use, revocable, valid for seven days, and invalidated when reissued.
- **DIVE-ONB-REQ-008:** Bootstrap redemption MUST allow at most ten attempts per authenticated identity and Clerk session per minute.
- **DIVE-ONB-REQ-009:** Unknown, malformed, expired, revoked, already-consumed, email-mismatched, and identity-mismatched invitations MUST fail without disclosing which condition occurred.
- **DIVE-ONB-REQ-010:** Self bootstrap MUST create the invited authenticated identity's active Tenant Owner membership and MUST NOT allow that identity to designate another Owner.
- **DIVE-ONB-REQ-011:** Platform staff MUST NOT use US-19 to create the tenant or center, designate or activate an Owner, confirm customer data, or receive a tenant membership; assisted provisioning requires a separate approved story and contract.
- **DIVE-ONB-REQ-012:** One PostgreSQL transaction MUST create the tenant, first center, active Owner membership, audit records, transactional outbox records, and invitation consumption/result association.
- **DIVE-ONB-REQ-013:** Failure of any write in that transaction MUST roll back every bootstrap write; external effects MUST occur only after commit through the outbox worker.
- **DIVE-ONB-REQ-014:** The self-bootstrap result MUST NOT be considered operational unless its Tenant Owner membership is active and the approved center-entry prerequisites are satisfied.
- **DIVE-ONB-REQ-015:** Tenant operability MUST be derived from active Owner membership and center-entry readiness; this flow MUST NOT add a duplicate `provisioned` / `active` tenant status.
- **DIVE-ONB-REQ-016:** The server MUST NOT issue tenant context before the invited identity's Owner membership is active and the approved `centerKey`/host mapping is ready.
- **DIVE-ONB-REQ-017:** US-19 completion MUST mean that the invited Owner completed self bootstrap, can receive tenant context, and can enter the first-center application; invitation issuance alone is not completion.
- **DIVE-ONB-REQ-018:** The bootstrap invitation MUST be the idempotency key: retrying the same normalized payload MUST return the same result, while a different payload for the consumed invitation MUST fail as a conflict.
- **DIVE-ONB-REQ-019:** Concurrent redemption attempts MUST use a database uniqueness constraint and transactional serialization so they cannot create duplicate tenants, centers, memberships, audits, or outbox records.
- **DIVE-ONB-REQ-020:** The initial form MUST require an operator display name and a first-center display name.
- **DIVE-ONB-REQ-021:** Operator and center display names MUST normalize to Unicode NFC, trim outer whitespace, contain at least one Unicode code point, allow at most 120 Unicode code points, and MUST NOT be globally unique or act as authorization identifiers. This closure remains Proposed pending product-owner confirmation.
- **DIVE-ONB-REQ-022:** The first center's IANA time zone MUST be required; the browser MAY suggest it, but the user MUST confirm it before submission.
- **DIVE-ONB-REQ-023:** The interface language MUST support `es` and `en`, MAY be suggested from browser or profile, MUST remain editable, and MUST be stored as an identity/user preference rather than tenant or center authority.
- **DIVE-ONB-REQ-024:** The form MUST implement self-Owner bootstrap only and MUST NOT offer an assisted-provisioning mode.
- **DIVE-ONB-REQ-025:** Self bootstrap MUST NOT request or accept a second Owner email; the authenticated invited identity is the initial Owner.
- **DIVE-ONB-REQ-026:** The bootstrap form MUST NOT collect billing, plan, payment, tax, fiscal-address, public-contact, custom-domain, or additional-center data.
- **DIVE-ONB-REQ-027:** The functional bootstrap flow MUST work without Driver.js; guidance MUST remain optional, dismissible, manually restartable, and unable to complete or authorize a domain operation.
- **DIVE-ONB-REQ-028:** Driver.js MUST be isolated behind an internal guidance-renderer interface; product flows, forms, navigation decisions, server mutations, progress authority, and completion rules MUST NOT import or depend on Driver.js APIs.
- **DIVE-ONB-REQ-029:** Initial guidance state MAY use `localStorage` only under a stable identity-and-guide-scoped key whose value contains a storage `schemaVersion`, `status` (`dismissed` or `completed`), and `lastSeenGuideVersion`; it MUST NOT store tokens, tenant context, authorization state, form contents, or functional progress. This closure remains Proposed pending product-owner confirmation.
- **DIVE-ONB-REQ-030:** Dismissing or completing a guide MUST suppress automatic replay on that browser regardless of `lastSeenGuideVersion`; a new guide version MUST update metadata only when the user manually replays it and MUST NOT create a new auto-show key; `Help → Repeat guide` MUST allow manual replay. This closure remains Proposed pending product-owner confirmation.
- **DIVE-ONB-REQ-031:** Guide copy MUST ship in versioned `es` / `en` catalogs behind an internal content interface so a future CMS can replace the source without changing product flows or renderer contracts.
- **DIVE-ONB-REQ-032:** The MVP MUST expose a typed analytics port for `started`, `dismissed`, `completed`, and `restarted`; its initial implementation MUST be no-op and MUST NOT send data to an external provider.
- **DIVE-ONB-REQ-033:** The guided experience MUST satisfy WCAG 2.2 AA before pilot, including keyboard access, focus placement and restoration, Escape behavior, assistive-technology semantics, contrast, reduced motion, mobile layouts, and non-blocking behavior when a target is absent.
- **DIVE-ONB-REQ-034:** Self-bootstrap provisioning and visual guidance MUST have independent rollout controls so either capability can be disabled without disabling the other or existing dashboard access.
- **DIVE-ONB-REQ-035:** US-19 MUST end at the new tenant dashboard with the first center selected only after approved `centerKey` allocation and host/origin readiness; activity creation belongs to a subsequent flow.
- **DIVE-ONB-REQ-036:** Ready-to-start review MUST confirm that all acceptance scenarios are unambiguous and testable and that the open `centerKey`/host-entry decision is closed; executed evidence MUST cover every applicable scenario before Review, Accepted, or pilot gates claim conformance.

## States and invariants

```text
bootstrap invitation: issued → consumed
                     ↘ revoked
                     ↘ expired

self bootstrap: invitation valid → transaction committed with active Owner
              → center entry ready → operational
```

Invariants:

- One bootstrap invitation produces at most one tenant result.
- The invited authenticated identity is the initial Owner.
- Platform staff do not create customer tenants or become members through US-19.
- Guide state never substitutes domain state.
- Tenant context is never issued from browser-provided tenant selection.
- Final dashboard entry waits for approved `centerKey` allocation and host/origin readiness.

## Edge cases and acceptance scenarios

The mandatory acceptance matrix is:

1. Only a valid platform invitation permits self bootstrap; no public signup or assisted-provisioning path exists.
2. Clerk authentication, verified-email matching, and permanent `issuer + subject` binding identify the invited Owner.
3. Tenant, first center, active Owner membership, invitation consumption, audit, and outbox commit atomically.
4. Any write failure rolls back every bootstrap artifact and sends no pre-commit external effect.
5. Same-payload retry returns the same result; changed payload conflicts; concurrent tabs create no duplicates.
6. Unknown, expired, revoked, consumed, email-mismatched, and identity-mismatched invitations fail without disclosure and are rate-limited.
7. Cross-tenant access is denied and prior memberships neither authorize nor block valid bootstrap.
8. The functional flow completes with Driver.js disabled or replaced.
9. Guide auto-show, dismissal, completion, manual replay, and browser-state separation behave as specified.
10. `es` / `en`, confirmed time zone, mobile behavior, and WCAG 2.2 AA are validated.
11. Self-bootstrap provisioning and guidance rollout controls operate independently.
12. Tokens, tenant context, form contents, and unnecessary personal data do not appear in browser persistence, logs, audit, outbox payloads, or analytics.
13. Completion requires active Owner membership and successful entry to the first-center application through the approved `centerKey`/host contract; activity creation is not included.

## API, events, and data

Conceptual application commands:

- `IssueTenantBootstrapInvitation`
- `ReissueTenantBootstrapInvitation`
- `RevokeTenantBootstrapInvitation`
- `CompleteOwnTenantBootstrap`

No assisted-provisioning command belongs to US-19. HTTP paths and physical table/index names remain implementation details for a later contract/implementation PR and MUST preserve the requirements above.

Minimum persisted concepts:

- bootstrap invitation identifier and secret hash;
- intended email and expiry/revocation/consumption timestamps;
- bound `issuer + subject` after successful redemption;
- normalized request fingerprint and resulting tenant/center/membership references;
- existing tenant, center, active Owner membership, audit, and outbox data.

The semantic outbox intent is self bootstrap committed for the invited Owner. Exact event names, versions, and payload schemas remain implementation-contract work. Raw invitation secrets, Clerk tokens, and tenant-context handles MUST NOT enter event payloads.

## Security, privacy, isolation, and operations

- Bootstrap is authenticated and pre-tenant; it does not weaken RLS or use a migration role as an application role.
- Invitation-management capability is separate from tenant roles and read-only platform support.
- Email is used only for delivery and initial verified matching; stable identity binding remains `issuer + subject`.
- Issue, reissue, revoke, consume, create, and activate actions are audited with safe identifiers.
- Logs, traces, analytics, audit, and outbox redact raw tokens, invitation secrets, Clerk bearer values, and tenant-context handles.
- `MT-REQ-*` isolation evidence remains separate from `DIVE-ONB-*` product evidence.

## Performance and observability

No latency, bundle, or throughput budget is introduced. Implementation evidence must record the bootstrap transaction/query shape, outbox handoff, and whether Driver.js is loaded only when guidance is enabled.

## Errors, concurrency, and idempotency

- Invitation failures use one non-disclosing error contract.
- Payload mismatch after consumption is a conflict.
- Transaction failure exposes no partial success.
- Database uniqueness and transaction serialization are authoritative for concurrent consumption.
- Browser state and Driver.js callbacks are never idempotency authority.

## Migration, rollout, and rollback

- Roll out self bootstrap and guidance behind independent controls, initially limited to explicitly invited identities.
- Rolling back guidance disables the renderer without disabling the functional form.
- Rolling back provisioning disables new invitation issue/redemption without removing existing tenant access.
- Database migrations, HTTP contracts, and center-entry orchestration require a later implementation PR with reversible migration or explicit rollback.

## Tests and expected evidence

- Domain/API tests for invitation authority, verified-email binding, atomicity, rollback, idempotency, concurrency, non-disclosure, rate limit, and cross-tenant isolation.
- Negative tests proving there is no assisted-provisioning path and invitation managers receive no tenant membership.
- Component tests for renderer/content/analytics ports, guide state, target absence, and accessibility behavior.
- Minimal Playwright coverage for invited-Owner self bootstrap, first-center entry, guide dismissal/replay, and Driver.js-disabled completion.
- Manual WCAG 2.2 AA validation before pilot.
- No implementation or execution evidence is claimed by this Draft documentation PR.

## Open questions

- Confirm NFC normalization and Unicode-code-point counting.
- Confirm the stable-key `localStorage` representation and replay semantics.
- Decide `centerKey` allocation and the host/origin preparation required before dashboard entry.
- Define implementation-specific HTTP paths, physical names, audit actions, event schemas, invitation retention, and operational ownership.

## Traceability

- Decision: `specs/architecture/adrs/ADR-DIVE-013.md`
- Identity and membership: `specs/iam/SPEC-DIVE-IAM-001.md`
- Tenant context and center entry: `specs/architecture/adrs/ADR-DIVE-008.md`
- Frontend state boundary: `specs/architecture/adrs/ADR-DIVE-009.md`
- Transactional outbox: `specs/architecture/adrs/ADR-DIVE-002.md`
- Map: `specs/traceability/TRACE-DIVE-MVP-001.md`
