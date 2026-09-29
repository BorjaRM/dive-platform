# SPEC-DIVE-ONBOARDING-001 — Controlled self bootstrap and first-center setup

- **Status:** Ready to start
- **Version:** 0.9
- **Last reviewed:** 2026-09-29
- **Approved by:** Product owner for Ready-to-start promotion
- **Approval reference:** Product confirmation 2026-09-29 after executed `SPIKE-DIVE-004`; Ready-to-start status applied 2026-09-29; guided onboarding deferred, backend-owned invitation administration retained, and MFA excluded from the MVP administration contract by product confirmation 2026-09-29
- **Owner:** Product / Security / Frontend Architecture
- **IDs:** `DIVE-ONB-REQ-001` … `DIVE-ONB-REQ-050`

## Normative authority

This SPEC governs invited self-service creation of an operator tenant, its first center, the initial active Tenant Owner membership, and the simple setup form in `apps/web`. Guided onboarding is deferred and is not part of current US-19 implementation authority.

`SPEC-DIVE-IAM-001` remains authoritative for identities, memberships, tenant roles, permissions, tenant context, and ordinary tenant invitations. `DIVE-IAM-REQ-017` and `ADR-DIVE-004` define an ordinary invitation as an invitation inside an existing tenant that creates and activates one pending membership with predetermined roles and center scopes. US-19 instead uses a pre-tenant bootstrap grant that can create the tenant, first center, and initial Owner. Neither record, command, credential, acceptance path, nor idempotency key can be used as the other. `ADR-DIVE-002` remains authoritative for the transactional outbox. `ADR-DIVE-013` owns the architecture choices introduced by this flow.

The product owner narrowed US-19 to self bootstrap only. Assisted provisioning by platform staff is outside this story. This revision replaces the approved application-owned bearer and delivery design with Clerk Application Invitations. `SPIKE-DIVE-004` resolved the blocking provider-behavior questions, and the product owner explicitly approved Ready-to-start promotion on 2026-09-29. This SPEC is Ready to start; implementation remains subject to its documented activation gates.

## Requirement provenance

| Requirement IDs | Provenance | Exact source | Decision status |
|---|---|---|---|
| `DIVE-ONB-REQ-001` | `Proposed` | PR #36 product-owner revision record; `ADR-DIVE-013` Draft | Approved for implementation; Product owner confirmation 2026-09-28 after merged PR #62 |
| `DIVE-ONB-REQ-003` | `Proposed` | PR #36 product-owner revision record; `ADR-DIVE-013` Draft | Approved for implementation; Product owner confirmation 2026-09-28 after merged PR #62 |
| `DIVE-ONB-REQ-005..DIVE-ONB-REQ-020` | `Proposed` | PR #36 product-owner revision record; `ADR-DIVE-013` Draft | Approved for implementation; Product owner confirmation 2026-09-28 after merged PR #62 |
| `DIVE-ONB-REQ-022..DIVE-ONB-REQ-026` | `Proposed` | PR #36 product-owner revision record; `ADR-DIVE-013` Draft | Approved for implementation; Product owner confirmation 2026-09-28 after merged PR #62 |
| `DIVE-ONB-REQ-027..DIVE-ONB-REQ-034` | `Proposed` | Original PR #36 guidance proposal; product confirmation 2026-09-29 deferring guided onboarding | **Approved for deferral:** excluded from current US-19 implementation authority; a future story must decide whether guidance is needed, in which flows, and with which presentation approach |
| `DIVE-ONB-REQ-035` | `Proposed` | Product confirmation 2026-09-28 accepting the dedicated acceptance/setup route boundary; product confirmation 2026-09-29 approving Ready-to-start promotion; `ADR-DIVE-013` v0.7 Ready to start | Approved for Ready-to-start promotion; route implementation pending |
| `DIVE-ONB-REQ-002` | `Derived` | `SPEC-DIVE-IAM-001` `DIVE-IAM-REQ-001..006`; PR #36 product-owner revision record | Approved for implementation; Product owner confirmation 2026-09-28 after merged PR #62 |
| `DIVE-ONB-REQ-004` | `Derived` | `SPEC-DIVE-IAM-001` `DIVE-IAM-REQ-002..006`; `ADR-DIVE-008` § Authorization path | Approved for implementation; Product owner confirmation 2026-09-28 after merged PR #62 |
| `DIVE-ONB-REQ-021` | `Proposed` | PR #32 SDD Gatekeeper remediation; product confirmation 2026-09-28 | Approved for implementation; Product owner confirmation 2026-09-28 after merged PR #62 |
| `DIVE-ONB-REQ-036` | `Derived` | `specs/foundation/sdd-specs-traceability.md` § Spec lifecycle / Definition of Ready / Definition of Done | Approved for implementation; Product owner confirmation 2026-09-28 after merged PR #62 |
| `DIVE-ONB-REQ-037..DIVE-ONB-REQ-038` | `Proposed` | [Clerk application invitations](https://clerk.com/docs/guides/users/inviting); [invite-only access](https://clerk.com/docs/guides/secure/restricting-access); [custom invitation flow](https://clerk.com/docs/guides/development/custom-flows/authentication/application-invitations); [Next.js sign-up component](https://clerk.com/docs/nextjs/reference/components/authentication/sign-up); `specs/spikes/SPIKE-DIVE-004/results.md`; product confirmation 2026-09-29 | Provider behavior demonstrated; approved for Ready-to-start promotion 2026-09-29 |
| `DIVE-ONB-REQ-039..DIVE-ONB-REQ-040` | `Proposed` | Product confirmation 2026-09-28; product confirmation 2026-09-29 retaining the backend-owned administration boundary, excluding Clerk Dashboard as the ordinary production issuance channel, and excluding MFA from the MVP; `ADR-DIVE-013` v0.9 | Approved for implementation; no dedicated administration UI or MFA step-up is required for the current increment |
| `DIVE-ONB-REQ-041` | `Proposed` | [Clerk custom application-invitation flow](https://clerk.com/docs/guides/development/custom-flows/authentication/application-invitations); `specs/spikes/SPIKE-DIVE-004/results.md`; product confirmation 2026-09-29 | Existing-identity flow demonstrated; approved for Ready-to-start promotion 2026-09-29 |
| `DIVE-ONB-REQ-042` | `Proposed` | Product confirmation 2026-09-28; `ADR-DIVE-013` v0.3 Draft | Previously approved; unchanged by option B |
| `DIVE-ONB-REQ-043..DIVE-ONB-REQ-047` | `Proposed` | [Clerk createInvitation](https://clerk.com/docs/reference/backend/invitations/create-invitation); `specs/spikes/SPIKE-DIVE-004/results.md`; `specs/multitenancy/MT-SPIKE-001-specification.md` `MT-COND-WORKER-001`; product confirmation 2026-09-29 | Approved for Ready-to-start promotion; retry/backoff/exhaustion and dead-letter policy remains an activation gate before external worker effects |
| `DIVE-ONB-REQ-048` | `Derived` | `SPEC-DIVE-IAM-001` `DIVE-IAM-REQ-022`, `030..031`; product confirmation 2026-09-28 | Approved for implementation; Product owner confirmation 2026-09-28 after merged PR #62 |
| `DIVE-ONB-REQ-049..DIVE-ONB-REQ-050` | `Proposed` | Product confirmation 2026-09-28; `ADR-DIVE-013` v0.3 Draft | Approved for implementation; Product owner confirmation 2026-09-28 after merged PR #62 |

### Derivations

- **DIVE-ONB-REQ-002:** Clerk authenticates while PostgreSQL owns memberships and authorization; bootstrap cannot move tenant authority into Clerk.
- **DIVE-ONB-REQ-004:** existing multi-tenant authorization rules prohibit browser-provided tenant, center, role, or permission values from becoming authority.
- **DIVE-ONB-REQ-036:** Ready to start requires verifiable scenarios and closed critical decisions; executed evidence is required later for Review/Accepted and pilot gates.
- **DIVE-ONB-REQ-048:** tenant-context handles are selectors, not authorization; current membership state, roles, permissions, and center scope remain server-authoritative on every protected request.

## Goal

Let an explicitly invited future Owner create its own operator tenant and first center without manual database preparation or public signup, while preserving isolation, auditable authority, and atomicity through a simple setup form.

## Scope

### In scope

- Platform-issued bootstrap invitations managed through a dedicated pre-tenant capability.
- Self-service bootstrap by the invited future Owner.
- Atomic tenant, first-center, active Owner membership, invitation consumption, audit, and outbox persistence.
- Idempotency, non-disclosure, rate limits, and concurrency protection.
- A simple `es` / `en` setup form, accessibility, rollout controls, and expected evidence.

### Out of scope

- Public operator signup.
- Assisted provisioning: platform staff do not create tenant, center, or Owner membership for a customer.
- Billing, plans, payments, VAT/tax identifiers, invoices, fiscal address, and payment methods.
- Public center contact data, additional centers, activities, slots, or channel publication.
- Clerk Organization as membership or authorization authority.
- A dedicated graphical administration UI for bootstrap invitations. The approved internal API may initially be operated through controlled platform tooling.
- Clerk Dashboard as the ordinary production issuance channel. It remains diagnostic/provider tooling and does not create PostgreSQL bootstrap authority.
- MFA or another step-up mechanism for bootstrap-invitation administration in the MVP. A later security increment may propose it with its own threat model, recovery behavior, and approval.
- Guided onboarding, product tours, Driver.js or another tour library, guide-specific browser state, guide analytics, and guide content infrastructure. A future story must decide whether guidance is needed and which flows justify it.
- A CMS or external analytics provider for the MVP.
- A new tenant lifecycle status independent of active Owner membership.

## Model and definitions

- **Bootstrap invitation:** platform-issued, pre-tenant capability authorizing one invited identity to create its own tenant, first center, and initial Owner membership. It is represented by `tenant_bootstrap_grants`, not by a tenant membership invitation.
- **Ordinary tenant invitation:** IAM invitation governed by `DIVE-IAM-REQ-017` and `ADR-DIVE-004`; it belongs to an existing tenant, creates one unbound `pending` membership with immutable roles and center scopes, and can only activate that membership.
- **Self bootstrap:** the invited authenticated identity confirms the data and becomes the initial active Tenant Owner.
- **Operational:** an active Tenant Owner membership exists and the approved center-entry prerequisites allow tenant context to be issued.

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
- **DIVE-ONB-REQ-021:** Operator and center display names MUST normalize to Unicode NFC, trim outer whitespace, contain at least one Unicode code point, allow at most 120 Unicode code points, and MUST NOT be globally unique or act as authorization identifiers. This closure was confirmed by the product owner on 2026-09-28.
- **DIVE-ONB-REQ-022:** The first center's IANA time zone MUST be required; the browser MAY suggest it, but the user MUST confirm it before submission.
- **DIVE-ONB-REQ-023:** The interface language MUST support `es` and `en`, MAY be suggested from browser or profile, MUST remain editable, and MUST be stored as an identity/user preference rather than tenant or center authority.
- **DIVE-ONB-REQ-024:** The form MUST implement self-Owner bootstrap only and MUST NOT offer an assisted-provisioning mode.
- **DIVE-ONB-REQ-025:** Self bootstrap MUST NOT request or accept a second Owner email; the authenticated invited identity is the initial Owner.
- **DIVE-ONB-REQ-026:** The bootstrap form MUST NOT collect billing, plan, payment, tax, fiscal-address, public-contact, custom-domain, or additional-center data.
- **DIVE-ONB-REQ-027:** **Deferred.** Guided onboarding is not required for the current simple bootstrap form. A future story must decide whether guidance is needed and which product flows justify it.
- **DIVE-ONB-REQ-028:** **Deferred.** No tour library, including Driver.js, renderer abstraction, or product integration is selected or required for current US-19.
- **DIVE-ONB-REQ-029:** **Deferred.** No guide-specific browser persistence contract is selected or required for current US-19.
- **DIVE-ONB-REQ-030:** **Deferred.** No guide replay, dismissal, completion, or version-update behavior is selected or required for current US-19.
- **DIVE-ONB-REQ-031:** **Deferred.** No guide content catalog, content port, or future CMS boundary is selected or required for current US-19.
- **DIVE-ONB-REQ-032:** **Deferred.** No guide-specific analytics events or analytics port are selected or required for current US-19.
- **DIVE-ONB-REQ-033:** **Deferred.** Guidance-specific accessibility acceptance is deferred with the guidance capability. The simple bootstrap form remains subject to the normal product accessibility requirements.
- **DIVE-ONB-REQ-034:** **Deferred.** No independent guidance rollout control is required for current US-19; bootstrap provisioning retains its own approved rollout control.
- **DIVE-ONB-REQ-035:** The authenticated bootstrap form MUST live at `/bootstrap/setup`, separate from invitation acceptance and `/dashboard`. After successful bootstrap, US-19 MUST navigate to the new tenant dashboard with the first center selected only after approved `centerKey` allocation and host/origin readiness; activity creation belongs to a subsequent flow.
- **DIVE-ONB-REQ-036:** Ready-to-start review MUST confirm that all acceptance scenarios are unambiguous and testable and that the approved `centerKey`/host-entry contract is represented without ambiguity; executed evidence MUST cover every applicable scenario before Review, Accepted, or pilot gates claim conformance.
- **DIVE-ONB-REQ-037:** The Clerk application MUST use invite-only access mode. `/sign-in/[[...sign-in]]` MUST expose ordinary login only and MUST NOT expose public signup, bootstrap-invitation discovery, manual invitation-code entry, or operator creation. `/dashboard` MUST remain a protected post-authentication route: its signed-out boundary MUST redirect to the configured sign-in route and MUST NOT render `<SignUp />` or the bootstrap form. Existing authenticated identities MAY continue to sign in, but authentication alone MUST NOT create or authorize a bootstrap grant.
- **DIVE-ONB-REQ-038:** Identity enrollment for bootstrap MUST use a Clerk Application Invitation and MUST NOT use Clerk Organizations. Clerk MUST own the provider ticket and invitation email. The adapter MUST set `expiresInDays: 7`, `notify: true`, and an exact allowlisted `redirectUrl` to `/bootstrap/accept` on the canonical authentication host. That public route MUST be a ticket-aware Clerk acceptance controller, not a product dashboard or bootstrap form. It MUST support a new invited identity, an existing invited identity that must sign in, an already-authenticated matching identity, and an already-authenticated different identity that must be denied neutrally and offered account switching. It MUST NOT render `<SignUp />` for an already-authenticated session. The provider `__clerk_ticket` MAY appear only in the acceptance-route query, MUST be consumed by the Clerk SDK, and MUST then be removed with history replacement before navigation to `/bootstrap/setup`; the route MUST apply `Referrer-Policy: no-referrer`. The ticket MUST NOT be persisted or copied into setup/dashboard routes, logs, audit, analytics, traces, error reports, referrers, or event payloads. The application MUST NOT issue a second bootstrap bearer. Route selection and Clerk authentication MUST NOT classify the domain operation: `/bootstrap/accept` and the completion command MUST require the corresponding PostgreSQL bootstrap grant and MUST NOT accept an ordinary IAM invitation or pending membership.
- **DIVE-ONB-REQ-039:** Platform invitation administration MUST use PostgreSQL-authoritative capabilities `bootstrap_invitation.read`, `bootstrap_invitation.issue`, `bootstrap_invitation.reissue`, and `bootstrap_invitation.revoke`, independent of tenant memberships and read-only support. Issue, reissue, and revoke MUST require a recorded reason, audit, idempotency, abuse protection, and a rollout control. Tenant roles and read-only support MUST NOT authorize these operations. MFA is not required for the MVP; any later step-up requirement needs a separate approved security change. The current increment does not require a dedicated administration UI; controlled platform tooling MAY invoke the same authenticated application commands.
- **DIVE-ONB-REQ-040:** The internal HTTP contract MUST expose `POST /v1/platform/bootstrap-invitations`, `GET /v1/platform/bootstrap-invitations/:invitationId`, `POST /v1/platform/bootstrap-invitations/:invitationId/reissue`, and `POST /v1/platform/bootstrap-invitations/:invitationId/revoke`. Issue and mutation inputs MUST be limited to the approved destination, reason, and idempotency context; the server MUST own provider expiry, notification, exact redirect, `ignoreExisting` policy, and provider metadata. A caller MUST NOT supply a tenant, center, role, permission, provider ticket, arbitrary redirect, expiry, or Clerk metadata. The read response MUST expose safe operational state only and MUST NOT return a credential or reconstruct an invitation link. Clerk Dashboard invitations MUST NOT create, replace, or authorize a PostgreSQL bootstrap grant and MUST NOT be the ordinary production issuance path.
- **DIVE-ONB-REQ-041:** After Clerk Application Invitation acceptance, the matching invited identity MUST enter the authenticated `/bootstrap/setup` route and complete bootstrap through `POST /v1/me/tenant-bootstrap` with operator display name, center display name, confirmed IANA time zone, and `es` or `en` locale only. The setup route MUST NOT receive or forward `__clerk_ticket`. The server MUST resolve exactly one pending bootstrap grant from the authenticated `issuer + subject` and matching verified normalized email; it MUST query only the bootstrap-grant boundary and MUST NOT consume an ordinary IAM invitation, activate a pre-existing pending membership, or accept tenant/role/center selection from the browser. Zero, multiple, expired, revoked, superseded, provider-mismatched, or wrong-kind records MUST fail without disclosure. Successful completion MUST consume the grant in the bootstrap transaction and navigate to `/dashboard`; subsequent application access MUST use ordinary login.
- **DIVE-ONB-REQ-042:** The server MUST allocate a unique, immutable, non-reserved `centerKey` from a readable normalized candidate plus a stable collision suffix when required. In the bootstrap transaction it MUST persist a trusted `centerKey -> tenantId + centerId` mapping. MVP readiness MUST rely on the approved wildcard platform DNS/TLS boundary; mapping failure MUST roll back every bootstrap write and MUST NOT consume the grant. Custom domains remain out of scope.
- **DIVE-ONB-REQ-043:** Physical persistence MUST use `tenant_bootstrap_grants` for bootstrap authority and `tenant_bootstrap_outbox_events` for pre-tenant provider commands, separate from the ordinary IAM invitation, pending-membership, and tenant-scoped delivery records governed by `ADR-DIVE-004`. A provider invitation reference MUST map to exactly one application record kind and MUST NOT bridge bootstrap and ordinary invitation commands. Grant states MUST be `issued`, `consumed`, `revoked`, `expired`, or `superseded`; provider-delivery state MUST be tracked separately. The grant MUST retain normalized destination email, timestamps, platform issuer and reason, Clerk invitation reference and safe provider status, bound `issuer + subject`, normalized request fingerprint, supersession link, and result references. It MUST NOT persist the Clerk ticket, a second bearer, tenant roles, or center authority in Clerk metadata.
- **DIVE-ONB-REQ-044:** After the grant transaction commits, the worker MUST consume a dedicated pre-tenant outbox command and call Clerk `createInvitation()` with the approved email, seven-day expiry, notification, and exact redirect. It MUST store only the provider invitation reference and safe delivery status, MUST honor provider rate limits and `Retry-After`, and MUST retry without creating duplicate grants or provider invitations. The worker MUST use a restricted pre-tenant capability and MUST NOT use a migration role, create tenant data, authorize bootstrap, or receive tenant membership.
- **DIVE-ONB-REQ-045:** Reissue MUST immediately supersede the previous PostgreSQL grant and enqueue provider revocation followed by creation of a new Clerk Application Invitation. Provider calls are post-commit and cannot make the domain transition atomic; therefore the superseded grant MUST remain unusable even while provider revocation is pending. No interface MUST display, persist, recover, or proxy the Clerk ticket.
- **DIVE-ONB-REQ-046:** Terminal bootstrap grants and their safe Clerk invitation references/statuses MUST be retained for 90 days, after which their operational record MAY be deleted. No provider ticket or email body is retained. Audit retention remains governed by the platform security retention policy and MUST NOT depend on grant deletion.
- **DIVE-ONB-REQ-047:** Audit actions MUST use `tenant_bootstrap_invitation.issued`, `.reissued`, `.revoked`, `.delivery_failed`, `tenant_bootstrap.completed`, and `tenant_bootstrap.denied`. Successful completion MUST emit `tenant.bootstrap.completed.v1` containing only tenant, center, membership, grant, occurrence, and correlation references; it MUST NOT contain email, Clerk invitation tickets, Clerk bearer tokens, user metadata, or tenant-context handles.
- **DIVE-ONB-REQ-048:** Every protected request MUST revalidate the handle binding, active membership, current roles, permissions, and center scope in PostgreSQL. Disabling a membership MUST revoke or invalidate all handles for that membership, MUST prevent handle renewal, and MUST NOT disable other active memberships of the same global identity.
- **DIVE-ONB-REQ-049:** An authenticated identity with no active membership MUST receive no tenant context and MUST see a neutral no-active-access state that reveals no tenant, center, membership, or resource data and offers no operator-creation recovery path.
- **DIVE-ONB-REQ-050:** Invalid Clerk authentication MUST return the generic `401` authentication failure contract; an absent, inactive, unrelated, or insufficient membership/handle MUST return one generic `403` authorization-denied contract. The response MUST NOT disclose whether another tenant, center, membership, invitation, or resource exists.

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
- Final dashboard entry waits for the transactional `centerKey` mapping and wildcard host/origin readiness defined by `DIVE-ONB-REQ-042`.
- Authentication never substitutes for an active membership, and revocation cannot be bypassed with a previously issued handle.

## Edge cases and acceptance scenarios

The mandatory acceptance matrix is:

1. Only a valid platform invitation permits self bootstrap; no public signup or assisted-provisioning path exists.
2. Clerk authentication, verified-email matching, and permanent `issuer + subject` binding identify the invited Owner.
3. Tenant, first center, active Owner membership, invitation consumption, audit, and outbox commit atomically.
4. Any write failure rolls back every bootstrap artifact and sends no pre-commit external effect.
5. Same-payload retry returns the same result; changed payload conflicts; concurrent tabs create no duplicates.
6. Unknown, expired, revoked, consumed, email-mismatched, and identity-mismatched invitations fail without disclosure and are rate-limited.
7. Cross-tenant access is denied and prior memberships neither authorize nor block valid bootstrap.
8. The functional flow uses the simple setup form and includes no guided-tour dependency, guide state, or guide analytics.
9. `DIVE-ONB-REQ-027..034` remain Deferred and cannot be treated as implementation scope without a future approved story.
10. `es` / `en`, confirmed time zone, mobile behavior, and WCAG 2.2 AA are validated.
11. Self-bootstrap provisioning can be rolled out or disabled without introducing a guidance subsystem.
12. Tokens, tenant context, form contents, and unnecessary personal data do not appear in browser persistence, logs, audit, outbox payloads, or analytics.
13. Completion requires active Owner membership and successful entry to the first-center application through the approved `centerKey`/host contract; activity creation is not included.
14. Clerk is configured invite-only; `/sign-in/[[...sign-in]]` contains no public signup or invitation discovery; `/bootstrap/accept` handles new, existing, matching-session, and wrong-session identities without disclosure; `__clerk_ticket` is removed by history replacement before `/bootstrap/setup` and is absent from setup/dashboard URLs, logs, referrers, audit, traces, analytics, errors, and events; `/dashboard` redirects signed-out users to login and never renders `<SignUp />`.
15. Internal issue, read, reissue, and revoke enforce platform capabilities, recorded reason, idempotency, abuse protection, safe state, server-owned provider parameters, and no raw-credential recovery; tenant roles and read-only support are denied.
16. The worker creates the Clerk Application Invitation only after commit, respects provider rate limits and `Retry-After`, records safe provider state, and does not duplicate grants or provider invitations; reissue makes the old grant unusable before asynchronous Clerk revocation completes.
17. A membership disabled after context issuance cannot use or renew its handles, while another active membership for the same identity remains usable.
18. An authenticated identity without an active membership receives the neutral no-access state and no tenant or resource disclosure.
19. A bootstrap grant can create only a new tenant, first center, and initial Owner; an ordinary IAM invitation can activate only its existing tenant’s pending membership. Cross-kind replay, route substitution, provider-reference collision, and credential confusion fail without disclosure and create neither tenant nor membership side effects.
20. A Clerk Dashboard invitation with no matching PostgreSQL bootstrap grant cannot bootstrap a tenant; it fails neutrally and creates no domain effects. Provider-side diagnostic or emergency operations do not replace the authoritative application command or database state.

## API, events, and data

Application commands and HTTP contract:

| Command | HTTP |
|---|---|
| `IssueTenantBootstrapInvitation` | `POST /v1/platform/bootstrap-invitations` |
| read safe operational state | `GET /v1/platform/bootstrap-invitations/:invitationId` |
| `ReissueTenantBootstrapInvitation` | `POST /v1/platform/bootstrap-invitations/:invitationId/reissue` |
| `RevokeTenantBootstrapInvitation` | `POST /v1/platform/bootstrap-invitations/:invitationId/revoke` |
| `CompleteOwnTenantBootstrap` | `POST /v1/me/tenant-bootstrap` after Clerk invitation acceptance; no application bearer |

No assisted-provisioning command belongs to US-19. Platform routes enforce `DIVE-ONB-REQ-039`; the self-bootstrap route enforces Clerk authentication, verified-email matching, and one pending PostgreSQL grant and never accepts browser authority for tenant, center, role, permission, or provider-ticket selection. Ordinary tenant invitation issue/accept/revoke commands remain owned by `SPEC-DIVE-IAM-001` and `ADR-DIVE-004`; they are not aliases of these bootstrap commands and this revision does not change their credential or delivery contract.

Physical persistence and minimum concepts:

- `tenant_bootstrap_grants` owns pre-tenant authority and terminal results and is physically and logically separate from ordinary IAM invitation and pending-membership records;
- `tenant_bootstrap_outbox_events` owns provider create, revoke, and reissue commands before a tenant exists;
- the grant stores normalized intended email, expiry/revocation/consumption timestamps, platform issuer/reason, safe Clerk invitation reference/status, bound `issuer + subject`, normalized request fingerprint, supersession link, and resulting tenant/center/membership references;
- no application bearer, provider ticket, email body, role, center scope, or business authority is stored in Clerk metadata.

The completion event is `tenant.bootstrap.completed.v1` with tenant, center, membership, grant, occurrence, and correlation references only. Provider commands reference the grant and never embed the Clerk ticket. Destination email remains restricted to the provider-command boundary and MUST NOT enter the completion event.

## Security, privacy, isolation, and operations

- Bootstrap is authenticated and pre-tenant; it does not weaken RLS or use a migration role as an application role.
- Invitation-management capabilities are the four stable keys in `DIVE-ONB-REQ-039`, separate from tenant roles and read-only platform support; mutations require a recorded reason and audit. MFA is not an MVP requirement.
- The invitation API is an internal platform administration boundary, not a tenant endpoint. It accepts no caller-selected provider behavior or business authority, applies abuse protection and idempotency, and returns neither the Clerk ticket nor a reconstructed link. The Clerk credential remains confined to the worker adapter.
- Clerk Dashboard is limited to provider diagnostics, development testing, and bounded emergency provider action. It is not the ordinary production issuance channel; a dashboard-created invitation has no bootstrap authority without the independently valid PostgreSQL grant, and provider-side emergency revocation must be accompanied by the authoritative application revocation.
- Email is used only for delivery and initial verified matching; stable identity binding remains `issuer + subject`.
- Issue, reissue, revoke, consume, create, and activate actions are audited with safe identifiers.
- Logs, traces, analytics, audit, error reports, browser cleanup, and event payloads redact `__clerk_ticket`, Clerk bearer values, destination email outside the provider boundary, and tenant-context handles. Redirect URLs are exact allowlisted authentication-host routes; arbitrary redirect destinations are rejected.
- Clerk `publicMetadata`, session claims, Application Invitation metadata, redirect routes, and UI state MUST NOT be used to choose between bootstrap and ordinary invitation authority or to authorize tenant, center, role, membership, or platform capabilities.
- `MT-REQ-*` isolation evidence remains separate from `DIVE-ONB-*` product evidence.

## Performance and observability

No latency, bundle, or throughput budget is introduced. Implementation evidence must record the bootstrap transaction/query shape and outbox handoff. Current US-19 must not add a tour-library bundle.

## Errors, concurrency, and idempotency

- Invitation failures use one non-disclosing error contract.
- Payload mismatch after consumption is a conflict.
- Transaction failure exposes no partial success.
- Database uniqueness and transaction serialization are authoritative for concurrent consumption.
- Browser state and UI callbacks are never idempotency authority.
- Invitation consumption uses row locking plus database uniqueness so concurrent completions have one authoritative result.
- Authentication failure and authorization denial remain separate generic contracts without cross-tenant disclosure.

## Migration, rollout, and rollback

- Roll out self bootstrap behind its approved control, initially limited to Clerk invite-only identities with a matching PostgreSQL grant. Provider invitation issuance uses a separate rollout control from grant persistence and bootstrap completion.
- No guidance rollout or rollback path is required while `DIVE-ONB-REQ-027..034` remain Deferred.
- Rolling back provisioning disables new invitation issue/redemption without removing existing tenant access.
- Database migrations, HTTP contracts, provider adapter, worker, Clerk invite-only configuration, exact redirect allowlist, and center-entry orchestration require a later implementation PR with reversible migration or explicit rollback. The immutable `0000_baseline.sql` MUST NOT be edited; add a new migration.

## Tests and expected evidence

- Domain/API tests for grant authority, verified-email binding, atomicity, rollback, pre-tenant outbox, Owner activation, idempotency, concurrency, non-disclosure, provider failure, cross-tenant isolation, and cross-kind confusion between bootstrap grants and ordinary IAM invitations.
- Negative administration tests for tenant actors, read-only support, replay, abuse limits, arbitrary provider parameters, redirect injection, and Clerk Dashboard invitations without a matching PostgreSQL grant.
- Negative tests proving there is no assisted-provisioning path and invitation managers receive no tenant membership.
- Component tests for the simple setup form, validation, localization, accessibility, and neutral failure states.
- Minimal Playwright coverage for Clerk invite-only signup/sign-in, invited-Owner self bootstrap, and first-center entry without any guided-tour dependency.
- Manual WCAG 2.2 AA validation before pilot.
- **Documented:** `specs/spikes/SPIKE-DIVE-004/results.md` provides Clerk Development evidence for new and existing identities, matching/different sessions, revocation/reissue, exact loopback redirect behavior, invite-only signup restriction, and ticket redaction.
- **Derived:** natural expiration, canonical deployed-host behavior, product-route integration, and deterministic worker handling of provider rate limits remain evidence gates for Review, Accepted, or pilot as applicable; they do not reopen a product decision required to begin reversible implementation. `MT-COND-WORKER-001` must be satisfied before the first external worker effect.

## Open questions

None for current US-19 Ready to start. **Documented:** `specs/spikes/SPIKE-DIVE-004/results.md` closed the provider questions for new and existing identities, active-session classification, invite-only behavior, Future API composition, ticket cleanup, and revoke/reissue. **Proposed and approved:** guided onboarding is Deferred; a future story must decide whether it is needed, which flows justify it, and what presentation approach to use. **Derived:** a real provider `429`, natural expiration, canonical deployed-host behavior, product-route integration, and worker retry/backoff/exhaustion remain implementation or later conformance evidence; `MT-COND-WORKER-001` is implemented and tested with the first real worker and blocks its external effects until its policy and tests are approved.

## Traceability

- Decision: `specs/architecture/adrs/ADR-DIVE-013.md`
- Identity and membership: `specs/iam/SPEC-DIVE-IAM-001.md`
- Tenant context and center entry: `specs/architecture/adrs/ADR-DIVE-008.md`
- Frontend state boundary: `specs/architecture/adrs/ADR-DIVE-009.md`
- Transactional outbox: `specs/architecture/adrs/ADR-DIVE-002.md`
- Map: `specs/traceability/TRACE-DIVE-MVP-001.md`
