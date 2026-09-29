# ADR-DIVE-008 — Internal tenant-scoped dashboard context

- **Status:** Ready to start
- **Version:** 0.14
- **Date:** 2026-09-27
- **Decision date:** 2026-09-29
- **Deciders:** Product / Security / Architecture
- **Affected IDs:** `DIVE-IAM-REQ-001..006`, `016`, `022..025`, `028..032`; `MT-REQ-002`, `006`, `009`

## Provenance

The path and credential decisions were introduced as `Proposed` on 2026-09-27. Product owner (Borja) explicitly promoted this ADR to Ready to start on 2026-09-27 and accepted the implementation closures below on the same date. Product owner approval on 2026-09-29 also closes the center-entry lifecycle decision below. It is now implementation authority for dashboard tenant context. The implementation must not add defaults beyond this decision.

| Decision | Provenance | Exact source | Status |
|---|---|---|---|
| Clerk authenticates identity; PostgreSQL owns memberships, roles, permissions, and center scopes | `Documented` | `SPEC-DIVE-IAM-001` `DIVE-IAM-REQ-001..006`; ADR-DIVE-001 | Existing normative constraint |
| One identity may belong to several tenants; the operator is the tenant and center/base is operational scope | `Documented` | `DIVE-IAM-REQ-002`; ADR-DIVE-001 | Existing normative constraint |
| Revocation must prevent further authorized calls and ordinary revocation takes effect within five minutes | `Documented` | `DIVE-IAM-REQ-016`, `DIVE-IAM-REQ-022` | Existing normative constraint |
| Do not cache application authorization decisions in the MVP; re-resolve membership, roles, and scopes per authorized use case; validate the provider session on every dashboard request | `Documented` | ADR-DIVE-007 revocation and session boundary | Existing normative constraint |
| Client-supplied tenant IDs are never authoritative | `Documented` | `DIVE-IAM-REQ-006` | Existing normative constraint |
| Replace tenant identifiers in dashboard API paths with an internal tenant-scoped context credential | `Proposed` | Product direction requested by Borja on 2026-09-27; constrained by `DIVE-IAM-REQ-006` | Approved by product owner 2026-09-27; Ready to start |
| Dashboard product and context endpoints MUST NOT include `/tenants/:tenantId` in their paths | `Proposed` | Same product direction; closes the path-contract question | Approved by product owner 2026-09-27; Ready to start |
| Automatically select the tenant when exactly one active membership is available | `Proposed` | Product discussion on 2026-09-27 | Approved by product owner 2026-09-27; Ready to start |
| Keep roles, permissions, and center scopes out of the context credential and resolve current authorization from PostgreSQL | `Derived` | `DIVE-IAM-REQ-003`, `004`, `016`, `022`; multitenancy baseline §5; ADR-DIVE-007 | Approved by product owner 2026-09-27; Ready to start |
| Opaque server-stored handle, `X-Tenant-Context` header, Clerk-session lifetime, multiple simultaneous contexts, atomic route replacement, and the `/v1/me/*` context API below | `Proposed` | Product confirmation by Borja on 2026-09-27 to apply the recommended closures | Approved by product owner 2026-09-27; Ready to start |
| Store the handle as a 32-byte random secret shown once, with only its SHA-256 hash persisted; bind it to an internal HMAC-SHA-256 hash of the Clerk `sid` | `Proposed` | Product acceptance of the implementation proposal by Borja on 2026-09-27 | Approved by product owner 2026-09-27; Ready to start |
| Keep the raw Clerk `sid` backend-internal; do not return it, log it, trace it, or include it in the context credential | `Proposed` | Product acceptance of the implementation proposal by Borja on 2026-09-27 | Approved by product owner 2026-09-27; Ready to start |
| Use `sessionStorage` for browser context persistence; do not use `localStorage` | `Proposed` | Product acceptance of the implementation proposal by Borja on 2026-09-27 | Approved by product owner 2026-09-27; Ready to start |
| Limit issuance to 10 requests per identity and Clerk `sid` per minute and 20 live handles per identity and session; do not revoke handles automatically to enforce the cap | `Proposed` | Product acceptance of the implementation proposal by Borja on 2026-09-27 | Approved by product owner 2026-09-27; Ready to start |
| Mark handles revoked for idempotently processed `session.revoked`, `session.ended`, and `session.removed` events; request-time Clerk validation remains authoritative | `Proposed` | Product acceptance of the implementation proposal by Borja on 2026-09-27 | Approved by product owner 2026-09-27; Ready to start |
| Delete revoked handles after 30 days; do not expire active handles through an independent product TTL | `Proposed` | Product acceptance of the implementation proposal by Borja on 2026-09-27 | Approved by product owner 2026-09-27; Ready to start |
| Configure dashboard CORS with exact origins, without wildcard origins or cookie credentials, and allow `Authorization`, `X-Tenant-Context`, and `Content-Type` | `Proposed` | Product acceptance of the implementation proposal by Borja on 2026-09-27; center-origin source refined by the approved 2026-09-29 decision below | Approved by product owner; Ready to start |
| Use `operators`, `operatorRef`, `displayName`, and `tenantContext` in the context API response shapes; operator references use the opaque `op_...` form | `Proposed` | Product acceptance of the implementation proposal by Borja on 2026-09-27 | Approved by product owner 2026-09-27; Ready to start |
| A center application establishes the organization context from its trusted center entry configuration without showing an intermediate operator or center selector | `Proposed` | Product confirmation by Borja on 2026-09-27; constrained by `DIVE-IAM-REQ-002`, `003`, `006`, `024`, `029..032` | Approved by product owner 2026-09-27; Ready to start |
| Center-application entry uses the platform subdomain `https://<centerKey>.app.<domain>`; dedicated `POST /v1/me/center-entry-contexts` receives `{ "centerRef": "<centerKey>" }`; both fields carry the same selector value and are checked against trusted configuration before success returns `{ "tenantContext": "…", "center": { "centerId": "…" } }` once | `Proposed` | Product owner accepted the clarified single-slug recommendation on 2026-09-27; constrained by `DIVE-IAM-REQ-006`, `024`, `029..032` and existing exact-origin CORS | Approved by product owner 2026-09-27; Ready to start |
| Unauthenticated center-application visitors are sent to login with the center URL preserved; authenticated identities without access see a generic unavailable-center page and receive a non-disclosing API denial | `Proposed` | Product confirmation by Borja on 2026-09-27 | Approved by product owner 2026-09-27; Ready to start |
| Custom center domains, white-label brand ownership, branded login, and cross-domain session continuity stay out of this increment; authentication, branding, center resolution, and authorization stay decoupled | `Proposed` | Product owner accepted platform subdomains as the MVP center-entry form on 2026-09-27 | Approved by product owner 2026-09-27; custom domains remain future scope |
| Separate the database login used by provider webhooks from the shared application login | `Proposed` | Security hardening discussion with Borja on 2026-09-27 | Future consideration; not approved and not part of the current runtime contract |
| MVP reserved `centerKey` set is `www`, `app`, `api`, `admin`, `mail`, `staging`, `preview`, `static`, `assets`; additional labels require a later approved change | `Proposed` | Product confirmation by Borja on 2026-09-27 | Approved by product owner 2026-09-27; Ready to start |
| Exact CORS authorization covers issued `centerKey` hosts plus the environment authentication-host origin; wildcard CORS remains forbidden | `Proposed` | Product confirmation by Borja on 2026-09-27; runtime lookup and non-center configuration refined by the approved 2026-09-29 decision below | Approved by product owner; Ready to start |
| Clerk authentication uses one authentication host per environment; after login the user returns to the center-application subdomain. Center subdomains are not registered as N Clerk applications | `Proposed` | Product confirmation by Borja on 2026-09-27 | Approved by product owner 2026-09-27; Ready to start |
| The same `centerKey` is reused across environments; each environment has its own `<domain>` and therefore a distinct host namespace | `Proposed` | Product confirmation by Borja on 2026-09-27 | Approved by product owner 2026-09-27; Ready to start |
| `POST /v1/me/center-entry-contexts` requires a browser `Origin` in the MVP. Clients without `Origin` are not authorized to call it | `Proposed` | Product confirmation by Borja on 2026-09-27 | Approved by product owner 2026-09-27; Ready to start |
| Require `center.read` plus current center scope when issuing a center-entry context; successful setup redirects by absolute URL to the first center's `/dashboard`, where the center-entry endpoint issues the handle | `Proposed` | Product direction to close issue #73 residual decisions on 2026-09-29; constrained by `DIVE-IAM-REQ-003`, `006`, `023`, `032` and `DIVE-ONB-REQ-035`, `042` | Approved by product owner 2026-09-29; Ready to start |
| Use active PostgreSQL `centerKey` mappings as the source of truth for exact center origins; retain configured exact origins only for non-center surfaces and never reflect or suffix-allow an arbitrary `Origin` | `Proposed` | Product direction to close issue #73 residual decisions on 2026-09-29; resolves the runtime-allocation gap in the approved generated-CORS decision | Approved by product owner 2026-09-29; Ready to start |
| Require `CENTER_APP_BASE_DOMAIN` and `AUTHENTICATION_ORIGIN` per deployed environment, with no code default; exact FQDN values are deployment inputs and readiness gates rather than product defaults | `Proposed` | Product direction to close issue #73 residual decisions on 2026-09-29; constrained by the approved environment namespace and authentication-host decisions | Approved by product owner 2026-09-29; Ready to start |
| Serve the authentication host and all canonical center hosts from one Next.js application build and deployment, routing presentation by validated host without making the host an authorization source | `Proposed` | Product direction to close issue #73 residual decisions on 2026-09-29; constrained by `DIVE-IAM-REQ-006`, `024`, `032` and the approved one-authentication-host model | Approved by product owner 2026-09-29; Ready to start |
| A center-entry mapping has exactly `active` or `disabled` state; a newly created mapping is `active`, only `active` mappings authorize CORS and center bootstrap, and state changes are reversible without changing `centerKey` | `Proposed` | Product approval to apply the center-entry lifecycle recommendation on 2026-09-29; constrained by `DIVE-IAM-REQ-003`, `022`, `023`, `024`, `025`, `032` | Approved by product owner 2026-09-29; Ready to start |
| `center_entry.manage` is granted only to Tenant Owner and Tenant Admin; disable/enable is a tenant-context operation, executed transactionally, and records actor, center, key, transition, purpose, result, and correlation in IAM audit | `Proposed` | Product approval to apply the center-entry lifecycle recommendation on 2026-09-29; constrained by `DIVE-IAM-REQ-003`, `010`, `023`, `025` | Approved by product owner 2026-09-29; Ready to start |
| A disabled mapping is a permanent tombstone for the MVP: runtime cannot delete, rename, reassign, or reuse its `centerKey`; reactivation is allowed only for the same tenant and center | `Proposed` | Product approval to apply the center-entry lifecycle recommendation on 2026-09-29; constrained by the immutable-key decision and cross-tenant non-disclosure | Approved by product owner 2026-09-29; Ready to start |
| Repeating the current center-entry state is an idempotent success with `changed: false`; every success audits the previous state, requested state, and whether persistence changed | `Proposed` | Product approval on 2026-09-29 to apply the recommended lifecycle corrections | Approved by product owner 2026-09-29; Ready to start |
| Disabling a center entry blocks new exact-origin CORS authorization and center bootstrap only; it does not revoke tenant-scoped handles or define an operational center shutdown state | `Proposed` | Product approval on 2026-09-29 to apply the recommended lifecycle corrections; constrained by the tenant-scoped handle decision | Approved by product owner 2026-09-29; Ready to start |
| Center-origin resolution uses a direct indexed database lookup without cache or TTL; resolver failure grants no CORS header, is operationally logged, and fails unavailable | `Proposed` | Product approval on 2026-09-29 to apply the recommended lifecycle corrections | Approved by product owner 2026-09-29; Ready to start |

## Context

The current IAM/API vertical authenticates a Clerk session token and receives `tenantId` in dashboard route paths. The service then resolves the identity–tenant membership and establishes authorized transaction-local tenant context.

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

The raw handle secret and raw Clerk `sid` exist only in trusted backend memory while needed for issuance or validation. They are never returned in API responses or written to logs, traces, or audit records.

### Lifetime, renewal, and revocation

- The handle has no independent product TTL. It remains usable only while the Clerk session is valid, the row is not revoked, and the membership remains active.
- There is no sliding renewal. A revoked, unknown, or session-mismatched handle requires a new `POST /v1/me/tenant-contexts`.
- Selecting another operator issues another handle. It does not rewrite the previous handle unless the client revokes it.
- The server limits issuance to 10 requests per identity and Clerk `sid` per minute and 20 live handles per identity and session. Reaching the live-handle cap does not revoke an existing handle automatically.
- Membership disable, role/scope change, and authorization decisions are read from PostgreSQL on the request, as required by ADR-DIVE-007. Disable takes effect on the next request even if the handle row still exists.
- Clerk logout, session expiry, or adapter failure to confirm an active session deny the request. Existing adapter session checks remain the authorization gate; a later webhook that also revokes handle rows is defense in depth and is not required by this ADR.
- Idempotently processed `session.revoked`, `session.ended`, and `session.removed` events mark handles bound to that session as revoked. Request-time Clerk validation remains authoritative.
- Session webhook processing receives the provider session identifier internally, hashes it with the same HMAC-SHA-256 procedure, and never persists or emits the raw identifier.
- Explicit `DELETE /v1/me/tenant-contexts` revokes the presented handle.
- Revoked handles are deleted after 30 days. Active handles have no independent product TTL.
- Logs, traces, and audit must not record the raw handle, `Authorization` value, or `X-Tenant-Context` value. A safe internal tenant id may appear in audit after trusted resolution.

Browser clients persist the handle in `sessionStorage`, never `localStorage`, and remove it after logout or explicit revocation.

### Center-application entry

The center application, not a user-facing selector, establishes the organization context for direct-center entry. The journey is:

```text
https://<centerKey>.app.<domain>
  → login if unauthenticated, preserving that URL
  → return to the same center application
  → bootstrap with { "centerRef": "<centerKey>" }
```

There is no intermediate operator or center selection screen. Changing center means navigating to that center's platform subdomain. Logout ends the identity session; it is not the mechanism for changing center.

#### Selector names and purpose

| Value | Purpose | Authority |
|---|---|---|
| `centerKey` | Readable DNS label in `https://<centerKey>.app.<domain>`; gives the center application a stable entry URL. | Selector only; never authorizes. |
| `centerRef` | Request-body field of `POST /v1/me/center-entry-contexts`; carries exactly the same string as `centerKey`. | Selector only; never authorizes. It is not a second identifier. |
| `centerId` | Internal resource UUID returned after successful bootstrap and used in center-scoped product paths. | Resource selector only; never authorizes. |
| `tenantContext` | Opaque tenant-scoped handle returned after successful authentication and authorization. | Selects tenant context but is insufficient authorization by itself. |

`centerKey` is unique per environment and immutable for the MVP. It is not the editable center name and is not a tenant or center UUID. The client MUST send the same value as `centerRef`; it MUST NOT combine two independent center identifiers. A newly created mapping is `active`. A mapping is then either `active` or `disabled`; `disabled` is a reversible tombstone that remains reserved for the same tenant and center. Runtime operations MUST NOT delete, rename, reassign, or reuse the key.

The trusted bootstrap comparison uses both surfaces:

1. derive `centerKey` from the exact request `Origin` matching `https://<centerKey>.app.<domain>`;
2. read `centerRef` from the JSON body;
3. require `centerRef === centerKey`;
4. resolve that key through trusted configuration to tenant + center;
5. authenticate Clerk and validate active membership plus current center scope.

Host, `Origin`, `centerKey`, and `centerRef` are untrusted selectors. None grants access. A mismatch, unknown key, inactive mapping, cross-tenant mapping, or unauthorized center fails without disclosure.

```http
POST /v1/me/center-entry-contexts
Authorization: Bearer <clerk-session-token>
Origin: https://<centerKey>.app.<domain>
Content-Type: application/json

{ "centerRef": "<centerKey>" }
```

Success returns once:

```json
{ "tenantContext": "ctx_…", "center": { "centerId": "…" } }
```

`tenantContext` is the same tenant-scoped handle issued by `POST /v1/me/tenant-contexts`. `centerId` is used in product paths after bootstrap. `centerRef` is not reused as the product resource identifier. The handle remains tenant-scoped; center-application product operations are center-scoped in their paths and must not aggregate other centers.

Issuance requires the active membership to have current scope for the resolved center and the existing stable `center.read` permission. This check does not make the handle center-scoped: every later request still revalidates its own permission, center scope, resource, and state.

The endpoint MUST NOT accept `operatorRef`, `tenantId`, a separate `centerKey`, or another tenant/center selector in body, query, or path. It MUST NOT return other operators or centers. `GET /v1/me/operators` is not part of the center-application journey.

#### Center-entry lifecycle

Tenant Owner and Tenant Admin may change a mapped center entry through:

```http
PATCH /v1/centers/<centerId>/entry-status
Authorization: Bearer <clerk-session-token>
X-Tenant-Context: <tenant-context>
Content-Type: application/json

{ "status": "disabled", "purpose": "temporary center closure" }
```

The request MUST contain exactly one supported state and a non-empty administrative purpose. The endpoint MUST resolve the tenant from the server-issued context, MUST NOT accept `centerKey` or `tenantId`, and MUST fail without disclosure for a missing, unrelated, inactive, or cross-tenant center. The database command validates its complete input before establishing tenant context, rechecks the active administrator membership, and writes the state transition and audit record in one transaction. Audit actions are `center_entry.disable` and `center_entry.enable`; denied attempts record the applicable denial reason. Repeating the current state is an idempotent `200` response with that state and `changed: false`; the audit record includes previous state, requested state, and `changed`. A disabled mapping is excluded from exact CORS authorization and center-entry context issuance immediately on the next request.

Disabling the mapping does not revoke an existing tenant-scoped handle and does not disable other operations for the center. A future operational shutdown state requires separate approved authorization and state semantics.

Denial:

- missing or invalid Clerk session: `401`; the application preserves the center URL and sends the user to login;
- missing or malformed `Origin`, missing or malformed `centerRef`, `centerRef`/`centerKey` mismatch, or an unknown, inactive, cross-tenant, or unauthorized mapping: one non-disclosing failure; the application shows a generic unavailable-center page with only back, logout, and support actions;
- the page MUST NOT list other centers, operators, or memberships.

`POST /v1/me/tenant-contexts` is unchanged: multiple active memberships still require `operatorRef`. Center applications MUST use `POST /v1/me/center-entry-contexts` instead of inferring tenant from `centerId` or matching display names.

#### Consequences

Advantages:

- one stable human-readable slug is used consistently in DNS and API bootstrap;
- direct entry removes the operator/center selection screen;
- tenant and center UUIDs stay out of the entry URL and bootstrap request;
- wildcard DNS/TLS can cover platform subdomains while authorization remains server-side;
- host/body agreement detects accidental or manipulated cross-center bootstrap requests;
- future verified custom domains can map to the same internal center without changing authorization or product paths.

Disadvantages and costs:

- `centerKey` requires a unique per-environment namespace and a reserved-word policy;
- MVP immutability makes allocation and correction operationally important;
- every center application is a distinct browser origin, so CORS and Clerk redirect/origin configuration must scale without wildcard authorization;
- staff with access to several centers changes host to change center;
- development, preview, DNS, and TLS need explicit environment conventions;
- the API uses a second field name (`centerRef`) for the same value, so the equality rule must be tested and documented to avoid treating it as another ID.

Custom center domains are not part of this MVP decision. A later ADR may add verified host aliases that resolve to the same center; it must not weaken authentication, center-scope validation, or non-disclosure.

The approved reserved `centerKey` set is:

```text
www, app, api, admin, mail, staging, preview, static, assets
```

A reserved label MUST NOT be issued as a center subdomain. Adding or removing a reserved label requires a later approved change; implementation must not enlarge the set silently.

#### CORS population

Dashboard CORS remains exact, with no wildcard origins and no cookie credentials. Active PostgreSQL `centerKey -> tenantId + centerId` mappings are the source of truth for center origins. For a request origin matching the configured `https://<centerKey>.<CENTER_APP_BASE_DOMAIN>` shape, the API resolves the complete normalized origin to an active mapping in the current environment before returning an allow-origin header. Unknown, inactive, malformed, reserved, or cross-environment origins receive no CORS authorization.

`DASHBOARD_CORS_ORIGINS` contains only additional exact non-center origins needed by that environment. `AUTHENTICATION_ORIGIN` supplies the one exact authentication-host origin. Neither setting accepts `*`, a regular expression, a suffix, or a center-origin template. The implementation MUST NOT reflect an arbitrary received `Origin`.

Wildcard DNS/TLS for `*.app.<domain>` does not authorize wildcard CORS. Creating or activating the trusted mapping makes its one derived center origin eligible without a deployment or manual allowlist edit; disabling the mapping makes that origin ineligible. Resolution uses a direct indexed database lookup and does not introduce an authorization cache, TTL, or stale-origin interval. If the resolver fails, the API MUST NOT emit `Access-Control-Allow-Origin`, MUST record an operational error, and MUST fail the request as unavailable rather than reflect the received origin.

#### Authentication host

Each environment has one authentication host, distinct from center-application subdomains. `AUTHENTICATION_ORIGIN` is its exact HTTPS origin. Unauthenticated visitors of `https://<centerKey>.app.<domain>` are sent to that host and, after a successful Clerk session, return to the same center URL. Center subdomains are not each registered as a separate Clerk application.

One Next.js application build and deployment serves that authentication host and the canonical `*.app.<domain>` center hosts. Request-host routing may select the authentication or center presentation, but it MUST first validate the host against `AUTHENTICATION_ORIGIN` or the configured center-domain shape and active mapping. Unknown hosts fail closed and MUST NOT render another center or the authentication surface. This deployment choice does not make `Host` authoritative and does not create a Clerk application per center.

#### Environment namespace

The same `centerKey` may be reused in production, staging, and preview. `CENTER_APP_BASE_DOMAIN` is the exact lower-case DNS suffix `app.<domain>` for one environment, without scheme, port, path, wildcard, or trailing dot. Each deployed environment MUST provide its own value and `AUTHENTICATION_ORIGIN`; there is no code default or fallback to another environment. Production, staging, and preview do not share a host namespace.

The concrete owned FQDNs are deployment inputs, not product defaults. Readiness requires DNS/TLS coverage, Clerk redirect/origin configuration, the two environment values, and an end-to-end probe for the environment being activated. Missing values fail startup or deployment validation; implementation MUST NOT invent production, staging, preview, or local domains.

#### Post-bootstrap handoff

After `POST /v1/me/tenant-bootstrap` commits and returns the allocated `centerKey`, the setup client navigates by absolute URL to `https://<centerKey>.<CENTER_APP_BASE_DOMAIN>/dashboard`. It MUST NOT first navigate to the authentication-host `/dashboard`, put `centerKey`, `centerId`, tenant id, or a handle in the path, query, or fragment, or issue a tenant handle before reaching the center origin.

On the center host, `/dashboard` derives `centerKey` from the current origin and calls `POST /v1/me/center-entry-contexts` with the matching `centerRef`. Only after that call succeeds may it persist the returned handle in that origin's `sessionStorage` and request the returned `centerId`. Failure renders the approved generic unavailable-center state.

#### Clients without `Origin`

`POST /v1/me/center-entry-contexts` is a browser bootstrap. A missing, empty, or non-center `Origin` fails without disclosure and issues no handle. curl, native apps, and server-to-server callers are not authorized to use this endpoint in the MVP. Tests may send a synthetic `Origin` header; that is evidence, not a product client. Scripts that need a tenant handle continue to use `POST /v1/me/tenant-contexts` where that contract applies.

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

- A handle without a matching live Clerk session is unusable.
- A handle bound to identity A cannot be replayed with identity B.
- A handle for tenant A cannot authorize tenant B.
- Stale roles, centers, or membership state inside the handle cannot occur because those claims are not stored in the handle.
- Membership disable is enforced on the next request without waiting for handle expiry.
- Removing `/tenants/:tenantId` from paths reduces untrusted tenant input and accidental leakage of tenant ids in URLs, history, and Referer.
- A custom header avoids cookie CSRF for tenant selection.
- Public widget traffic cannot present this dashboard handle as a public capability.

### Residual risks that remain

- **Stolen Clerk session token.** An attacker who has the Bearer token can call `GET /v1/me/operators` and mint a new handle. Protecting the handle does not compensate for session theft. Session validation, logout, and short-lived Clerk session tokens remain the main control.
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

Until that implementation PR, existing `/v1/tenants/:tenantId/...` routes remain the runtime contract. This documentation change does not itself change runtime behavior.

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

Catalog list cursor encoding, extra catalog response DTO fields, and physical activity/slot table names are pending decision in `SPEC-DIVE-BOOKING-001`. They are not authorized by this ADR.

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

Current implementation. Rejected for the replacement contract because it is not required when an equivalent server-authorized context exists, and it treats a client path segment as the tenant selector.

### Infer tenant from each resource

Rejected as the general mechanism because list/create operations have no existing resource, resolution can complicate RLS establishment, and lookup behavior can create cross-tenant disclosure risk.

### Signed internal JWT context

Not selected. Immediate logout/disable already requires server-side session and membership checks; a signed token would still need revocation state or would invite treating claims as authorization.

### Cookie-stored tenant context

Not selected. It implies one active tenant per browser profile, couples dashboard APIs to cookie CSRF defenses, and is a poorer fit for non-browser clients.

## Implementation authority

Ready to start authorizes reversible implementation with synthetic data for `DIVE-IAM-REQ-029..032`. Do not invent values for the remaining open questions, including catalog cursor encoding, extra catalog DTO fields, and physical activity/slot names owned by `SPEC-DIVE-BOOKING-001`. Runtime routes change only in the implementation PR, with the tests listed above.
