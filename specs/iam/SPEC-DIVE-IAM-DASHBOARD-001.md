# SPEC-DIVE-IAM-DASHBOARD-001 - Dashboard context and center entry

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
| `DIVE-IAM-REQ-029..DIVE-IAM-REQ-031` | `Proposed` | `ADR-DIVE-008`; product confirmation 2026-09-27 | Approved by product owner 2026-09-27 for MVP validation; Ready to start |
| `DIVE-IAM-REQ-032` | `Proposed` | `ADR-DIVE-008` v0.13; product confirmations 2026-09-27 and 2026-09-29 | Approved by product owner for MVP validation; Ready to start |

## Requirements

- **DIVE-IAM-REQ-029:** Dashboard HTTP paths MUST NOT include `/tenants/:tenantId` or another tenant-identifier segment. Product routes MUST NOT take tenant context from query string or body. `:centerId` and `:membershipId` remain resource selectors and never select the tenant.

- **DIVE-IAM-REQ-030:** After Clerk authentication, dashboard tenant context is an opaque server-stored handle presented in `X-Tenant-Context`, bound to the authenticated identity and Clerk `sid`. The handle selects a tenant and is not sufficient authorization. Roles, permissions, center scopes, and membership state are read from PostgreSQL on the request.

- **DIVE-IAM-REQ-031:** The server lists only the identity’s active operator memberships as opaque `operatorRef` values. Zero active memberships issue no handle. Exactly one active membership may be selected automatically. Several require an explicit `operatorRef` from that list on `POST /v1/me/tenant-contexts`. Invalid, inactive, unrelated, or cross-identity selections fail without disclosure. Several handles may exist for one Clerk session. The handle is tenant-scoped, not center-scoped.

- **DIVE-IAM-REQ-032:** A center application may issue the same tenant-scoped handle without `operatorRef` through `POST /v1/me/center-entry-contexts`. Its canonical MVP URL is `https://<centerKey>.app.<domain>` and its JSON body is `{ "centerRef": "<centerKey>" }`; `centerRef` and `centerKey` MUST carry the same value and are one untrusted selector expressed at the API and DNS boundaries, not two identifiers. The server derives `centerKey` from the exact request `Origin`, requires equality with `centerRef`, resolves trusted configuration to tenant + center, authenticates Clerk, and validates active membership, the stable `center.read` permission, and current center scope. Unknown, malformed, mismatched, inactive, cross-tenant, or unauthorized selection fails without disclosure. Success returns the tenant-scoped handle and internal `centerId`; subsequent product paths use `centerId`, not `centerRef`. The endpoint MUST NOT list other operators or centers. Center-application catalog and availability operations remain limited to that center even when the identity has other authorized centers. A trusted mapping has `active` or `disabled` state; only active mappings authorize CORS and center bootstrap. Tenant Owner and Tenant Admin may change that state with `center_entry.manage` through `PATCH /v1/centers/:centerId/entry-status`, with a non-empty purpose and tenant-scoped audit. Repeating the current state succeeds idempotently with `changed: false`. Disabling affects new CORS authorization and bootstrap only; it does not revoke tenant-scoped handles or define center-wide shutdown. Disabled mappings remain reserved tombstones and their `centerKey` cannot be deleted, renamed, reassigned, or reused in the environment. Custom center domains are outside the MVP.

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
