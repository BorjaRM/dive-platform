# SPEC-DIVE-IAM-DASHBOARD-001 - Dashboard context and center entry

- **Status:** Ready to start
- **Version:** 0.3
- **Last reviewed:** 2026-09-30
- **Owner:** Product / Security
- **Approval reference:** Requirements and original approvals extracted from SPEC-DIVE-IAM-001 at commit `86e9d97`; documentation split requested 2026-09-30. The product owner explicitly confirmed on 2026-09-30 that the current center-application restriction is Documented, applies despite same-organization permissions, and preserves future permission-checked multi-center administration. Open implementation contracts are retained; no artifact status promotion or implementation conformance is inferred.

## Normative authority

**Documented:** owns the requirements declared below, originally extracted verbatim from [SPEC-DIVE-IAM-001](SPEC-DIVE-IAM-001.md), and the explicitly confirmed application-scope clarification below. Original classifications, sources and approvals remain identifiable; the current clarification has its own dated product confirmation and does not inherit historical implementation coverage. This file does not authorize unrelated contracts or infer conformance from implementation existence.

## Requirement provenance

| Requirement IDs | Provenance | Exact source | Decision status |
|---|---|---|---|
| `DIVE-IAM-REQ-029..DIVE-IAM-REQ-031` | `Proposed` | `ADR-DIVE-008`; product confirmation 2026-09-27 | Approved by product owner 2026-09-27 for MVP validation; Ready to start |
| `DIVE-IAM-REQ-032` | `Documented` | Original contract introduced as `Proposed`: `ADR-DIVE-008` v0.13, product confirmations 2026-09-27 and 2026-09-29. Current application-scope clarification: explicit product-owner chat confirmation on 2026-09-30, quoted in the application-scope and future-development sections below | Original approvals preserved. Current restriction and future direction explicitly confirmed as Documented; implementation questions remain open, existing artifact status unchanged, no universal conformance claimed |

## Requirements

- **DIVE-IAM-REQ-029:** Dashboard HTTP paths MUST NOT include `/tenants/:tenantId` or another tenant-identifier segment. Product routes MUST NOT take tenant context from query string or body. `:centerId` and `:membershipId` remain resource selectors and never select the tenant.

- **DIVE-IAM-REQ-030:** After Clerk authentication, dashboard tenant context is an opaque server-stored handle presented in `X-Tenant-Context`, bound to the authenticated identity and Clerk `sid`. The handle selects a tenant and is not sufficient authorization. Roles, permissions, center scopes, and membership state are read from PostgreSQL on the request.

- **DIVE-IAM-REQ-031:** The server lists only the identity’s active operator memberships as opaque `operatorRef` values. Zero active memberships issue no handle. Exactly one active membership may be selected automatically. Several require an explicit `operatorRef` from that list on `POST /v1/me/tenant-contexts`. Invalid, inactive, unrelated, or cross-identity selections fail without disclosure. Several handles may exist for one Clerk session. The handle is tenant-scoped, not center-scoped.

- **DIVE-IAM-REQ-032:** A center application may issue the same tenant-scoped handle without `operatorRef` through `POST /v1/me/center-entry-contexts`. Its canonical MVP URL is `https://<centerKey>.app.<domain>` and its JSON body is `{ "centerRef": "<centerKey>" }`; `centerRef` and `centerKey` MUST carry the same value and are one untrusted selector expressed at the API and DNS boundaries, not two identifiers. The server derives `centerKey` from the exact request `Origin`, requires equality with `centerRef`, resolves trusted configuration to tenant + center, authenticates Clerk, and validates active membership, the stable `center.read` permission, and current center scope. Unknown, malformed, mismatched, inactive, cross-tenant, or unauthorized selection fails without disclosure. Success returns the tenant-scoped handle and internal `centerId`; subsequent product paths use `centerId`, not `centerRef`. The endpoint MUST NOT list other operators or centers. Center-application catalog and availability operations remain limited to that center even when the identity has other authorized centers. A trusted mapping has `active` or `disabled` state; only active mappings authorize CORS and center bootstrap. Tenant Owner and Tenant Admin may change that state with `center_entry.manage` through `PATCH /v1/centers/:centerId/entry-status`, with a non-empty purpose and tenant-scoped audit. Repeating the current state succeeds idempotently with `changed: false`. Disabling affects new CORS authorization and bootstrap only; it does not revoke tenant-scoped handles or define center-wide shutdown. Disabled mappings remain reserved tombstones and their `centerKey` cannot be deleted, renamed, reassigned, or reused in the environment. Custom center domains are outside the MVP.

## Authorization capability and application scope

**Documented -- Authorization capability:** [IAM](SPEC-DIVE-IAM-001.md), `DIVE-IAM-REQ-030..031` and [ADR-DIVE-008](../architecture/adrs/ADR-DIVE-008.md) own identity, active membership, roles, permissions and authorized center scopes. An identity can have permission over several centers of an organization. The handle selects the tenant, remains tenant-scoped, and is neither a grant of access nor an exclusive-center credential. Every request still checks its applicable authorization and resource boundaries.

**Documented -- Application scope, clarifying `DIVE-IAM-REQ-032`:** exact source, product-owner chat confirmation on 2026-09-30: "actualmente un centro no debe obtener informacion de otro aunque sea de la misma organizacion y tenga permisos". This confirms the previously requested transversal application of the recommendation as a current product restriction, not a future proposal. It applies to every operation on center-owned data made through the MVP center application, not only catalog and availability. Application scope is an additional restriction on what that surface can expose or modify; it does not expand the identity's authorization capability.

- The center application MUST limit reads and writes to its trusted resolved center, even for an identity authorized for other centers in the same organization. The UI MUST NOT offer another center's data or a multi-center view from that application.
- The backend MUST enforce that restriction for details, lists, searches, aggregates and mutations, including resources whose center is resolved indirectly. Filtering or hiding data only in the UI is insufficient. Other centers' records, identifiers and aggregate contributions MUST NOT be returned through the center application.
- `GET /v1/centers` MUST NOT enumerate other centers when used by the center application; `GET /v1/centers/:centerId` and other resource operations MUST NOT use broader membership permissions to bypass application scope. A resource selector is not evidence of its trusted tenant or center ownership. Denials remain non-disclosing.
- Authentication, session lifecycle and genuinely organization-global operations retain their own approved contracts; this is not a blanket center filter for every HTTP request. An operation returning center-owned data is not organization-global merely because the caller is an administrator.
- The API MUST retain the per-request permission, membership, tenant-isolation and resource checks as well as the application-scope check. Neither dimension substitutes for the other. The policy belongs at a shared application/API authorization boundary, with resource ownership resolved by the owning feature, rather than being duplicated as catalog-specific rules or placed only in presentation code.

**Documented -- Future developments:** exact source, the same product-owner confirmation on 2026-09-30: "a futuro si se contempla (ej: admin consultas multicentro, siempre que tenga permiso claro)", together with the earlier explicit instruction to respect both dimensions in future development. Existing and new center-facing features MUST preserve authorization capability and application scope. The tenant and handle boundaries remain as defined by `DIVE-IAM-REQ-030..031` and [ADR-DIVE-017](../architecture/adrs/ADR-DIVE-017.md). A future administrative application may define an explicitly approved multi-center scope within the tenant and the caller's current permissions. This preserves architectural capability, not an enabled MVP feature: it does not turn centers into tenants, narrow the tenant handle permanently to one center, or activate an aggregate administration surface in the MVP. New application scopes or exceptions require their own approved contract; a broad role alone does not select such a scope.

**Derived, Draft -- Verification obligation:** from the confirmed policy above, [IAM](SPEC-DIVE-IAM-001.md) `DIVE-IAM-REQ-028` and the [existing test/evidence workflow](../../docs/sdd/how-we-work.md#proportional-documentation-and-evidence), verifying authorization capability does not by itself verify application scope. Changes to center-facing features should identify their checks for each dimension separately and supply executable proof for the affected public boundaries. This reporting form is derived, not quoted as an explicit product instruction. Existing catalog checks are not proof that all center-facing endpoints implement the current application-scope restriction.

### Illustrative example

**Derived, Draft:** an administrator has current permission over Puerto and Bahia in the same organization. From Puerto's application, only Puerto's permitted data is accessible; a center list, direct Bahia resource request or aggregate MUST NOT expose Bahia's data. Navigating to Bahia's own application allows access there only after its own entry and current authorization checks. The identity's multi-center capability and the tenant-scoped handle model remain intact. A future, separately approved administrative surface could consult both centers; no such surface is enabled by this decision.

### Implementation questions and current limits

**Documented:** the existing [catalog scope owner](../../apps/api/src/catalog/catalog-access.service.ts) implements an Origin/resource comparison for catalog, while [IAM center reads](../../apps/api/src/iam/centers/centers.service.ts) still use the tenant handle and authorized center scopes without that application restriction. The catalog comparison exempts configured general origins and absent `Origin`. This documentation does not change those implementations or claim universal conformance.

**Proposed, Draft -- Open implementation questions:**

**Documented:** these questions remain recorded here for implementation and future-development planning. They concern how to enforce the confirmed restriction and integrate other clients, not whether the current center application may obtain another center's data. No question below postpones or creates an exception to the confirmed product policy; implementation and proof remain incomplete.

- How will the API reliably determine application scope? `Origin` is an untrusted selector, and its absence or forgery outside the browser cannot be treated as proof of a general or multi-center application. The current guard is a browser-channel restriction, not an exclusive-center credential. A stronger credential/session association is not selected by this document.
- Which existing routes are genuinely organization-global, and how will each center-data route enforce scope, including list endpoints without `centerId` and indirect resource ownership? Their explicit contracts must prevent accidental exemptions without inventing restrictions for authentication or organization administration.
- What explicit scope contract will govern configured non-center origins and approved scripts/server-to-server clients? Existing tenant-context issuance remains as documented in ADR-DIVE-008/017; this clarification does not silently revoke it or authorize a new administrative surface.

**Documented:** these unresolved implementation contracts remain gates. Future implementation must not infer a scope from a client-selected mode, change handle lifetime, add roles or permissions, or claim application-wide security from CORS or the existing catalog tests alone. No new TTL, center shutdown state or Clerk satellite configuration is authorized.

## Dashboard API (`ADR-DIVE-008`)

Ready to start. ADR-DIVE-008 owns the dashboard credential and operator-selection contract; ADR-DIVE-017 owns the extracted, previously approved center-entry contract. Historical approval versions in provenance are unchanged.

```text
GET    /v1/me/operators
POST   /v1/me/tenant-contexts
POST   /v1/me/center-entry-contexts
DELETE /v1/me/tenant-contexts
GET    /v1/centers
GET    /v1/centers/:centerId
PATCH  /v1/memberships/:membershipId/disable
PATCH  /v1/centers/:centerId/entry-status
```

Protected product requests send `Authorization: Bearer <clerk-session-token>` and `X-Tenant-Context`. They MUST NOT use `/tenants/:tenantId`.

## Dependencies and verification

**Documented:** ADR-DIVE-008 owns credential representation, lifetime and operator selection. Center-entry architecture is extracted to ADR-DIVE-017. Roles and per-request authorization remain in SPEC-DIVE-IAM-001. Retain identity/session mismatch, revocation, exact-origin, host/body mismatch, active/disabled mapping, lifecycle audit and cross-center negative tests. Operational purpose/retention/tooling questions remain open; no custom domains or new TTL are authorized.
