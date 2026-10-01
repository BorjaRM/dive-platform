# ADR-DIVE-008 — Internal tenant-scoped dashboard context

- **Status:** Ready to start
- **Version:** 0.16
- **Date:** 2026-09-27
- **Decision date:** 2026-09-29
- **Deciders:** Product / Security / Architecture
- **Affected IDs:** `DIVE-IAM-REQ-001..006`, `016`, `022..025`, `028..032`; `MT-REQ-002`, `006`, `009`

## Provenance

The path and credential decisions were introduced as `Proposed` on 2026-09-27. Product owner (the product owner) explicitly promoted this ADR to Ready to start on 2026-09-27 and accepted the implementation closures below on the same date. Product owner approval on 2026-09-29 also closes the center-entry lifecycle decision below. It is now implementation authority for dashboard tenant context. The implementation must not add defaults beyond this decision.

| Decision | Provenance | Exact source | Status |
|---|---|---|---|
| Clerk authenticates identity; PostgreSQL owns memberships, roles, permissions, and center scopes | `Documented` | `SPEC-DIVE-IAM-001` `DIVE-IAM-REQ-001..006`; ADR-DIVE-001 | Existing normative constraint |
| One identity may belong to several tenants; the operator is the tenant and center/base is operational scope | `Documented` | `DIVE-IAM-REQ-002`; ADR-DIVE-001 | Existing normative constraint |
| Revocation must prevent further authorized calls and ordinary revocation takes effect within five minutes | `Documented` | `DIVE-IAM-REQ-016`, `DIVE-IAM-REQ-022` | Existing normative constraint |
| Do not cache application authorization decisions; re-resolve membership, roles and scopes per authorized use case; authenticate each dashboard request through the expiry-based JWT boundary, without session/user-status lookups | `Documented` | [ADR-DIVE-007](ADR-DIVE-007.md#revocation-and-session-boundary); [IAM JWT clarification](../../iam/SPEC-DIVE-IAM-001.md#dashboard-jwt-validity-boundary), product-owner authorization 2026-10-01 | JWT policy supersedes per-request provider-status validation; local authorization unchanged, implementation/provider verification pending |
| Client-supplied tenant IDs are never authoritative | `Documented` | `DIVE-IAM-REQ-006` | Existing normative constraint |
| Replace tenant identifiers in dashboard API paths with an internal tenant-scoped context credential | `Proposed` | Product direction requested by the product owner on 2026-09-27; constrained by `DIVE-IAM-REQ-006` | Approved by product owner 2026-09-27; Ready to start |
| Dashboard product and context endpoints MUST NOT include `/tenants/:tenantId` in their paths | `Proposed` | Same product direction; closes the path-contract question | Approved by product owner 2026-09-27; Ready to start |
| Automatically select the tenant when exactly one active membership is available | `Proposed` | Product discussion on 2026-09-27 | Approved by product owner 2026-09-27; Ready to start |
| Keep roles, permissions, and center scopes out of the context credential and resolve current authorization from PostgreSQL | `Derived` | `DIVE-IAM-REQ-003`, `004`, `016`, `022`; multitenancy baseline §5; ADR-DIVE-007 | Approved by product owner 2026-09-27; Ready to start |
| Opaque server-stored handle, `X-Tenant-Context` header, Clerk-session lifetime, multiple simultaneous contexts, atomic route replacement, and the `/v1/me/*` context API below | `Proposed` | Product confirmation by the product owner on 2026-09-27 to apply the recommended closures | Approved by product owner 2026-09-27; Ready to start |
| Store the handle as a 32-byte random secret shown once, with only its SHA-256 hash persisted; bind it to an internal HMAC-SHA-256 hash of the Clerk `sid` | `Proposed` | Product acceptance of the implementation proposal by the product owner on 2026-09-27 | Approved by product owner 2026-09-27; Ready to start |
| Keep the raw Clerk `sid` backend-internal; do not return it, log it, trace it, or include it in the context credential | `Proposed` | Product acceptance of the implementation proposal by the product owner on 2026-09-27 | Approved by product owner 2026-09-27; Ready to start |
| Use `sessionStorage` for browser context persistence; do not use `localStorage` | `Proposed` | Product acceptance of the implementation proposal by the product owner on 2026-09-27 | Approved by product owner 2026-09-27; Ready to start |
| Limit issuance to 10 requests per identity and Clerk `sid` per minute and 20 live handles per identity and session; do not revoke handles automatically to enforce the cap | `Proposed` | Product acceptance of the implementation proposal by the product owner on 2026-09-27 | Approved by product owner 2026-09-27; Ready to start |
| Mark handles revoked for idempotently processed `session.revoked`, `session.ended`, and `session.removed` events; JWT validity and current local context/authorization checks govern request admission | `Documented` | Original handle-event decision approved by product owner 2026-09-27; JWT policy update authorized 2026-10-01 in [IAM](../../iam/SPEC-DIVE-IAM-001.md#dashboard-jwt-validity-boundary) | Handle-event behavior preserved; per-request provider-status validation superseded, no status promotion |
| Delete revoked handles after 30 days; do not expire active handles through an independent product TTL | `Proposed` | Product acceptance of the implementation proposal by the product owner on 2026-09-27 | Approved by product owner 2026-09-27; Ready to start |
| Configure dashboard CORS with exact origins, without wildcard origins or cookie credentials, and allow `Authorization`, `X-Tenant-Context`, and `Content-Type` | `Proposed` | Product acceptance of the implementation proposal by the product owner on 2026-09-27; center-origin source refined by the approved 2026-09-29 decision below | Approved by product owner; Ready to start |
| Use `operators`, `operatorRef`, `displayName`, and `tenantContext` in the context API response shapes; operator references use the opaque `op_...` form | `Proposed` | Product acceptance of the implementation proposal by the product owner on 2026-09-27 | Approved by product owner 2026-09-27; Ready to start |
| A center application establishes the organization context from its trusted center entry configuration without showing an intermediate operator or center selector | `Proposed` | Product confirmation by the product owner on 2026-09-27; constrained by `DIVE-IAM-REQ-002`, `003`, `006`, `024`, `029..032` | Approved by product owner 2026-09-27; Ready to start |
| Separate the database login used by provider webhooks from the shared application login | `Proposed` | Security hardening discussion with the product owner on 2026-09-27 | Future consideration; not approved and not part of the current runtime contract |

## Context

**Documented (decision-time context):** the original IAM/API vertical received `tenantId` in route paths. The replacement's current coverage is mapped in TRACE-DIVE-MVP-001; this paragraph is historical rationale, not the current HTTP contract.

The product direction is to remove tenant identifiers from dashboard API paths while keeping Clerk limited to identity authentication and PostgreSQL authoritative for product authorization. The solution must preserve multi-tenant isolation, multi-center scopes, revocation, non-disclosing failures, and identities that belong to several operators.

The product owner approved direct entry into a center application: platform subdomain → login if needed → return to the application limited to that center, with no intermediate operator or center selection screen. One stable slug identifies the entry: it is named `centerKey` in DNS and sent as `centerRef` to the bootstrap API. `POST /v1/me/tenant-contexts` with `operatorRef` remains the contract for non-center-application operator selection.

This decision applies to authenticated dashboard traffic. It does not change public widget, hosted-page, or booking-specific capability authorization defined by ADR-DIVE-005 and `SPEC-DIVE-BOOKING-001`.

## Decision

### Responsibility split

- Clerk continues to authenticate the external session and produce the provider-neutral identity assertion.
- PostgreSQL continues to own internal identity, tenant memberships, membership state, roles, permissions, and authorized centers.
- After authenticating the Clerk session, the backend may issue an internal tenant-scoped context credential only after validating an active membership for the same identity and tenant.
- The context credential selects a tenant; it is not sufficient authorization by itself.
- A context credential is bound to the authenticated identity and the Clerk session identifier (`sid`) and cannot be replayed with another identity or another session.
- Protected dashboard requests authenticate the Clerk session **and** resolve tenant context from the internal credential. Neither value authorizes the other.

### Path contract — no `/tenants/:tenantId`

After the replacement is implemented, dashboard HTTP paths MUST NOT include `/tenants/:tenantId` or any other tenant identifier segment.

This applies to:

- product routes (centers, memberships, calendar, invitations once exposed, and later dashboard resources);
- operator-list and tenant-context issuance/revocation routes;
- path parameters, and equivalently tenant selectors must not be accepted from query string or request body as authorization or tenant-context input on those product routes.

Forbidden examples:

```text
GET   /v1/tenants/:tenantId/centers/:centerId
PATCH /v1/tenants/:tenantId/memberships/:membershipId/disable
GET   /v1/tenants/:tenantId/centers
POST  /v1/tenants/:tenantId/contexts
```

Required dashboard shapes:

```text
GET    /v1/me/operators
POST   /v1/me/tenant-contexts
POST   /v1/me/center-entry-contexts
DELETE /v1/me/tenant-contexts
GET    /v1/centers
GET    /v1/centers/:centerId
PATCH  /v1/memberships/:membershipId/disable
```

`:centerId` and `:membershipId` remain resource selectors. They never select the tenant and never authorize access by themselves. The server must ignore a client-supplied `tenantId` on product routes if one is sent in headers other than the context credential, query, or body.

Public widget and hosted-page routes stay outside this dashboard contract and continue to resolve tenant/center from published channel configuration, not from a path tenant segment chosen by the public client.

### Credential representation and transport

- The credential is an opaque server-side handle. The server stores only a hash of the secret. The secret is shown once at issuance.
- The handle is not a signed application JWT and must not carry authoritative roles, permissions, center scopes, membership state, or resource state.
- Transport is the request header `X-Tenant-Context` together with `Authorization: Bearer <clerk-session-token>`.
- Cookies are not used for this credential, so a browser has no single implicit active tenant and a custom header is not sent automatically on cross-site form requests.
- Dashboard CORS authorizes only exact origins, with no wildcard origins or cookie credentials, and allows `Authorization`, `X-Tenant-Context`, and `Content-Type`.

Conceptual stored fields (physical table and index names remain implementation details):

- handle hash;
- internal identity;
- tenant id;
- HMAC-SHA-256 hash of Clerk `sid`;
- issued-at;
- revoked-at, when revoked.

**Documented:** the handle secret is returned once at authorized issuance and may then be stored by the browser in sessionStorage. Raw Clerk `sid` remains backend-internal and is never returned. Neither value enters logs, traces or audit. Source: the approved issuance and browser-persistence decisions above.

### Lifetime, renewal, and revocation

**Documented -- Historical approvals:** the 2026-09-27 handle lifecycle remains selected. **Documented -- Current authentication policy:** the product-owner contract-update authorization on 2026-10-01 applies the [IAM JWT validity boundary](../../iam/SPEC-DIVE-IAM-001.md#dashboard-jwt-validity-boundary) below without introducing a handle TTL or removing local revocation. This is contract authority, not implementation or provider evidence.

- **Documented:** the handle has no independent product TTL. It remains usable only with a valid unexpired Clerk JWT for the same identity/session, an unrevoked row and current active membership. Provider-status lookup is not a prerequisite.
- There is no sliding renewal. A revoked, unknown, or session-mismatched handle requires a new `POST /v1/me/tenant-contexts`.
- Selecting another operator issues another handle. It does not rewrite the previous handle unless the client revokes it.
- The server limits issuance to 10 requests per identity and Clerk `sid` per minute and 20 live handles per identity and session. Reaching the live-handle cap does not revoke an existing handle automatically.
- Membership disable, role/scope change, and authorization decisions are read from PostgreSQL on the request, as required by ADR-DIVE-007. Disable takes effect on the next request even if the handle row still exists.
- **Documented:** invalid or expired JWTs deny the request without waiting for webhook delivery. External logout, session revocation, user blocking or deletion alone does not invalidate an already issued unexpired JWT at request time; local context revocation may deny earlier. Preserve browser logout and explicit context revocation, without claiming immediate global token invalidation.
- **Documented:** idempotently processed `session.revoked`, `session.ended`, and `session.removed` events mark handles bound to that session as revoked. JWT verification authenticates identity/session claims; current local context and authorization checks still decide access. Webhooks never grant access and are not the sole guarantee of the five-minute session-invalidation bound.
- Session webhook processing receives the provider session identifier internally, hashes it with the same HMAC-SHA-256 procedure, and never persists or emits the raw identifier.
- Explicit `DELETE /v1/me/tenant-contexts` revokes the presented handle.
- Revoked handles are deleted after 30 days. Active handles have no independent product TTL.
- Logs, traces, and audit must not record the raw handle, `Authorization` value, or `X-Tenant-Context` value. A safe internal tenant id may appear in audit after trusted resolution.

Browser clients persist the handle in `sessionStorage`, never `localStorage`, and remove it after logout or explicit revocation.

### Center-application entry

**Documented:** center-entry mappings, lifecycle, exact CORS, authentication hosts and environment namespaces are owned by [ADR-DIVE-017](ADR-DIVE-017.md), extracted without changing their original approvals. The issued handle remains governed here.

### Operator selection

- With no active tenant membership, no dashboard tenant context is issued.
- With exactly one active tenant membership, `POST /v1/me/tenant-contexts` without `operatorRef` may select it automatically.
- With more than one active tenant membership, the user selects from `GET /v1/me/operators`. `operatorRef` is an opaque untrusted selector and is revalidated before issuance.
- Operator references use the opaque `op_...` form and never expose or directly encode a tenant UUID.
- Missing, inactive, unrelated, malformed, or cross-identity selections fail with the existing non-disclosing authorization behavior.

### Context API (dashboard, authenticated)

```http
GET /v1/me/operators
Authorization: Bearer <clerk-session-token>
```

Returns only operators for which the authenticated identity has an active membership, using opaque `operatorRef` values and display names. It does not return other identities’ tenants.

```http
POST /v1/me/tenant-contexts
Authorization: Bearer <clerk-session-token>

{ "operatorRef": "op_…" }
```

`operatorRef` is omitted only when automatic selection is allowed (exactly one active membership). Success returns `{ "tenantContext": "ctx_…" }` once. The value is a selector, not an access token.

The operator list response is `{ "operators": [{ "operatorRef": "op_…", "displayName": "…" }] }`. `DELETE /v1/me/tenant-contexts` returns `204` on success.

```http
DELETE /v1/me/tenant-contexts
Authorization: Bearer <clerk-session-token>
X-Tenant-Context: ctx_…
```

Revokes that handle for the authenticated identity and session.

Protected product requests:

```http
GET /v1/centers
Authorization: Bearer <clerk-session-token>
X-Tenant-Context: ctx_…
```

The field names above are part of this contract. The path rule and header-based context must not change.

### Simultaneous contexts

- Several independent handles may exist for the same identity and Clerk session.
- Each browser tab or API client presents the handle it holds. Two tabs may operate in two tenants without a process-wide “active tenant”.
- The server permits at most 20 live handles for one identity and Clerk session; reaching that cap does not revoke an existing handle automatically.

### Multi-center organizations

- A context credential is tenant-scoped, not center-scoped.
- An operator with several centers still uses one tenant context per selected tenant.
- Each center-scoped operation validates that the center belongs to the selected tenant and is within the membership’s current authorized center scopes.
- Center identifiers remain resource selectors and never authorize access by themselves.
- A center application is limited to the center resolved from its host. Permissions on other centers or organizations do not mix data into that application.
- Tenant-wide roles may still be authorized for another center, but they reach it only by opening that center’s application/host, not by aggregating catalog or availability in the current application.
- Existing list endpoints such as `GET /v1/centers` are not part of the center-application catalog journey.

### Authorization path

Every protected dashboard request:

1. authenticates the Clerk session through the identity adapter;
2. resolves the opaque handle to identity + tenant + `sid` and rejects mismatch, unknown, or revoked handles without disclosure;
3. re-resolves current membership status, roles, permissions, center scopes, resource, and resource state from PostgreSQL;
4. establishes transaction-local RLS from that already-authorized tenant id.

This ADR does not authorize an authorization cache, cache TTL, or stale-authorization default.

### Public widget and hosted page

Public channels do not use this dashboard credential:

- published channel configuration resolves tenant, center, allowed offering scope, publication state, and origin policy server-side;
- public users receive no dashboard membership or role;
- booking confirmation-read and cancellation continue to use separate purpose-limited credentials under ADR-DIVE-005.

### Future hardening: separate webhook database role (`Proposed`)

This proposal does not change the current implementation or authorize a new runtime
role. Today, the API's shared `dive_app` pool is used by both dashboard IAM
operations and the verified Clerk webhook controller. A future implementation could
introduce a dedicated `dive_webhook` login and grant it only execution of the
webhook command function, while revoking that execution privilege from `dive_app`.

The expected benefit is reduced privilege concentration: a compromise or accidental
SQL capability in the normal dashboard path would not also provide the database
capability to invoke webhook processing. The function would remain `SECURITY
DEFINER`, owned by `dive_migration`, with its fixed `search_path`; the separate login
would not bypass RLS or receive direct access to `identity_tenants`.

This proposal is stronger when webhook processing runs in a separate process or
worker. If both pools remain in the same API process, process compromise could still
expose both credentials. Adoption would require a separate connection URL and pool,
role bootstrap and grants, secret rotation, integration harness support, and tests
proving that `dive_app` can no longer execute the webhook command.

## Performance notes

The current API already resolves membership and authorization context for each exposed dashboard request. Keeping request-time validation therefore preserves the current security path rather than adding a new authorization round trip to those operations.

The operator-list and context-issuance calls add work when a dashboard context is established or changed, not for widget traffic. Before changing request-time validation, implementation evidence must measure the actual query path, indexes, API latency, and connection-pool impact. No numeric latency budget or cache TTL is introduced here.

## Security analysis

The design does not remove Clerk session theft as the primary dashboard credential risk. It also does not make the opaque handle a substitute access token.

### Mitigated if implemented as specified

- **Documented:** a handle without a valid unexpired Clerk JWT for the bound identity/session is unusable; request-time provider-status confirmation is not required under the 2026-10-01 policy.
- A handle bound to identity A cannot be replayed with identity B.
- A handle for tenant A cannot authorize tenant B.
- Stale roles, centers, or membership state inside the handle cannot occur because those claims are not stored in the handle.
- Membership disable is enforced on the next request without waiting for handle expiry.
- Removing `/tenants/:tenantId` from paths reduces untrusted tenant input and accidental leakage of tenant ids in URLs, history, and Referer.
- A custom header avoids cookie CSRF for tenant selection.
- Public widget traffic cannot present this dashboard handle as a public capability.

### Residual risks that remain

- **Documented -- Stolen Clerk session token:** an attacker with a valid Bearer token may list operators and mint a new handle while current local authorization permits it. Protecting or revoking one handle does not invalidate that JWT. The selected policy permits residual access until token expiry after external revocation or blocking; verified provider renewal cessation and local authorization/application-scope checks remain essential. This policy does not claim immediate token-theft recovery through logout.
- **Dashboard XSS.** Script in the dashboard origin can read JS-held Clerk tokens and the handle. HttpOnly cookies for the handle would not fix XSS of the Clerk Bearer token. Treat XSS as a full dashboard compromise.
- **Handle leakage in logs and traces.** Proxies, APM, and exception reports often capture headers. Raw `X-Tenant-Context` and `Authorization` values must be redacted. A leaked handle is still insufficient without the session, but leakage plus session theft extends attacker window until revoke.
- **Issuance pressure.** A valid session can create handle rows. The approved limit of 10 issuances per minute and 20 live handles per identity and session bounds that pressure, but a forgotten live handle can still occupy a slot until revocation. This remains a resource-exhaustion and cleanup concern, not a tenant-escape by itself.
- **CORS misconfiguration.** If the API reflects arbitrary `Origin` and allows `Authorization` plus `X-Tenant-Context`, a browser on another origin could use a stolen or ambient session. Dashboard CORS must remain an explicit allowlist; this ADR does not define the origin list.
- **Implementation footgun: accepting `tenantId` anyway.** If product routes still read tenant from path, query, or body, the untrusted-field invariant is broken. Tests must fail closed when `/tenants/:tenantId` is requested after replacement.
- **Implementation footgun: missing `sid` or identity bind.** A handle usable with any later session of the same user, or with another user, is a defect. Negative tests for identity/session mismatch are mandatory.
- **Non-disclosure bugs.** Distinct errors or timing for “unknown operatorRef” versus “exists but not yours” would violate `DIVE-IAM-REQ-024`.

None of these residual items is accepted as a reason to put `tenantId` back in the path.

## Compatibility and rollout

Replace the current tenant-path dashboard routes atomically in the implementation PR. Temporary dual contracts are not selected: the walking-skeleton web app is not a production dashboard client.

**Documented:** this was the decision-time migration rule. Current replacement and old-path rejection tests are mapped in TRACE-DIVE-MVP-001; tenant-path shapes are not the current dashboard contract. This documentation change does not change runtime behavior.

If a real external client appears before cut-over, reopen compatibility rather than silently keeping both path styles.

## Expected validation

Implementation must demonstrate:

- dashboard product and context routes do not include `/tenants/:tenantId`;
- requests to the old tenant-path shapes are not honored after replacement;
- client-supplied `tenantId` in query or body is ignored and does not select tenant context;
- zero memberships issues no tenant context;
- one active membership can be selected automatically;
- multiple memberships require an explicit valid `operatorRef` on `POST /v1/me/tenant-contexts`;
- fabricated, unrelated, inactive, and cross-identity selections issue no context;
- `POST /v1/me/center-entry-contexts` issues a handle without `operatorRef` when `Origin` yields a trusted `centerKey`, body `centerRef` equals that key, and the identity has current access to that center;
- missing, unknown, mismatched, or unauthorized `Origin`/`centerRef` is non-disclosing and issues no handle;
- a caller without `Origin` cannot use `POST /v1/me/center-entry-contexts`;
- reserved `centerKey` values are rejected as center subdomains;
- CORS allowlist entries for issued center hosts are exact origins, not wildcards;
- a missing or mismatched body `centerRef`, or any extra center selector in query/path, is rejected and issues no handle;
- a context for tenant A cannot read or mutate tenant B;
- a center outside the current membership scope is denied;
- a center application with access to center A cannot list or mutate center B through catalog or availability routes;
- only Tenant Owner and Tenant Admin can disable or enable a center entry;
- disabling a center entry blocks exact CORS and center-entry bootstrap, while re-enabling restores the same immutable `centerKey`;
- repeating the requested center-entry state succeeds idempotently with `changed: false` and an audit record of the no-op;
- disabling a center entry does not revoke an existing tenant-scoped handle or define a center-wide operational shutdown;
- a center-origin resolver failure grants no CORS header and fails unavailable;
- a disabled entry cannot be deleted, renamed, reassigned, or reused by runtime operations;
- center-entry lifecycle allow/deny decisions include the actor, purpose, transition, result, and correlation in tenant-scoped audit;
- membership disable, Clerk logout, and session expiry prevent further authorized calls within the existing requirements;
- context credentials cannot be replayed by another identity or another Clerk session;
- missing Clerk session or missing/revoked handle fails closed;
- public widget and hosted-page flows remain independent of dashboard credentials;
- pooled connections retain no tenant context after commit, rollback, or failure;
- logs/audit do not persist raw bearer or context secrets.

Tests must link the relevant `DIVE-IAM-REQ-*` and existing `MT-SC-*` rows without merging product and multitenancy evidence.

## Remaining open questions

These questions do not reopen the approved reserved-key, CORS-generation, authentication-host, environment-namespace, or no-`Origin` decisions:

1. Whether forgotten active handles need an approved maximum-age or idle TTL, and whether continuity of existing tabs or availability for new tabs has priority at the 20-handle cap.
2. The operational cleanup contract: scheduler ownership, cadence, database credential, batching, retry, alerting, and deletion metrics for revoked handles older than 30 days.
3. Future custom-domain verification, DNS/TLS provisioning, host administration, and mapping to the canonical `centerKey`. Out of this increment: custom domains, `BrandConfiguration`, branded login, and cross-domain session continuity.
4. The exact `purposeCode` catalog, optional-note limits, permitted content, and retention/review policy for center-entry lifecycle purposes.
5. The operational tooling, approval workflow, and incident response for the already-defined owner/admin lifecycle of a non-reserved `centerKey`.

**Documented:** ADR-DIVE-014 records approved page pagination, catalog DTO and physical naming. Cursor pagination is deferred, not a prerequisite. Editing and timezone-projection proposals belong to SPEC-DIVE-BOOKING-CATALOG-001.

## Alternatives considered

### Host-only bootstrap without `centerRef`

Not selected. Requiring the same slug in the platform subdomain (`centerKey`) and bootstrap body (`centerRef`) makes the intended center explicit at both browser and API boundaries while trusted server configuration and authorization remain authoritative.

### Custom center domain in the MVP

Not selected. It adds verification, DNS/TLS, origin registration, redirect, and session-continuity work before the canonical platform-subdomain flow is proven. A future verified alias may reuse the same internal resolution and authorization model.

### Path selector

Not selected. `/c/<key>` or a center UUID in the entry path would duplicate the canonical subdomain and increase the chance that a browser-controlled identifier is mistaken for authorization.

### Active Clerk Organization

Not selected. It would duplicate or synchronize organization membership with the PostgreSQL membership and invitation model and increase dependence on the identity provider. Clerk remains the identity adapter.

### Tenant identifier in every dashboard route

Historical implementation, not the current route contract. Rejected for the replacement contract because it is not required when an equivalent server-authorized context exists, and it treats a client path segment as the tenant selector. Current coverage is recorded in TRACE-DIVE-MVP-001.

### Infer tenant from each resource

Rejected as the general mechanism because list/create operations have no existing resource, resolution can complicate RLS establishment, and lookup behavior can create cross-tenant disclosure risk.

### Signed internal JWT context

**Documented:** not selected. Local handle revocation and current membership checks remain server-side; an additional signed context would still need local revocation state or invite treating claims as authorization. The expiry-based Clerk JWT policy does not replace the opaque tenant handle.

### Cookie-stored tenant context

Not selected. It implies one active tenant per browser profile, couples dashboard APIs to cookie CSRF defenses, and is a poorer fit for non-browser clients.

## Implementation authority

Ready to start authorizes the unchanged tenant-context decisions with synthetic data. DIVE-IAM-REQ-029..032 are owned by SPEC-DIVE-IAM-DASHBOARD-001; center-entry decisions by ADR-DIVE-017. Do not invent remaining TTL, cleanup or operational policies. ADR-DIVE-014's approved catalog decisions are not reopened here.
