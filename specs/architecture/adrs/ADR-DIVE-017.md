# ADR-DIVE-017 - Center-entry mappings, origins, and application hosts

- **Status:** Ready to start
- **Version:** 0.1
- **Date:** 2026-09-30
- **Deciders:** Product / Security / Architecture
- **Approval reference:** Unchanged decisions extracted from ADR-DIVE-008 v0.14 at commit `86e9d97`; original explicit approvals 2026-09-27 and 2026-09-29 retained. Structural division requested 2026-09-30; no new promotion.

## Provenance

| Decision | Provenance | Exact source | Status |
|---|---|---|---|
| Center-application entry uses the platform subdomain `https://<centerKey>.app.<domain>`; dedicated `POST /v1/me/center-entry-contexts` receives `{ "centerRef": "<centerKey>" }`; both fields carry the same selector value and are checked against trusted configuration before success returns `{ "tenantContext": "…", "center": { "centerId": "…" } }` once | `Proposed` | Product owner accepted the clarified single-slug recommendation on 2026-09-27; constrained by `DIVE-IAM-REQ-006`, `024`, `029..032` and existing exact-origin CORS | Approved by product owner 2026-09-27; Ready to start |
| Unauthenticated center-application visitors are sent to login with the center URL preserved; authenticated identities without access see a generic unavailable-center page and receive a non-disclosing API denial | `Proposed` | Product confirmation by the product owner on 2026-09-27 | Approved by product owner 2026-09-27; Ready to start |
| Custom center domains, white-label brand ownership, branded login, and cross-domain session continuity stay out of this increment; authentication, branding, center resolution, and authorization stay decoupled | `Proposed` | Product owner accepted platform subdomains as the MVP center-entry form on 2026-09-27 | Approved by product owner 2026-09-27; custom domains remain future scope |
| MVP reserved `centerKey` set is `www`, `app`, `api`, `admin`, `mail`, `staging`, `preview`, `static`, `assets`; additional labels require a later approved change | `Proposed` | Product confirmation by the product owner on 2026-09-27 | Approved by product owner 2026-09-27; Ready to start |
| Exact CORS authorization covers issued `centerKey` hosts plus the environment authentication-host origin; wildcard CORS remains forbidden | `Proposed` | Product confirmation by the product owner on 2026-09-27; runtime lookup and non-center configuration refined by the approved 2026-09-29 decision below | Approved by product owner; Ready to start |
| Clerk authentication uses one authentication host per environment; after login the user returns to the center-application subdomain. Center subdomains are not registered as N Clerk applications | `Proposed` | Product confirmation by the product owner on 2026-09-27 | Approved by product owner 2026-09-27; Ready to start |
| The same `centerKey` is reused across environments; each environment has its own `<domain>` and therefore a distinct host namespace | `Proposed` | Product confirmation by the product owner on 2026-09-27 | Approved by product owner 2026-09-27; Ready to start |
| `POST /v1/me/center-entry-contexts` requires a browser `Origin` in the MVP. Clients without `Origin` are not authorized to call it | `Proposed` | Product confirmation by the product owner on 2026-09-27 | Approved by product owner 2026-09-27; Ready to start |
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

**Documented:** direct center entry needs a trusted host mapping and exact origins, while authentication and tenant authorization remain separate. ADR-DIVE-008 owns tenant-scoped handles/operator selection; SPEC-DIVE-IAM-DASHBOARD-001 owns center-entry requirements. Custom domains remain outside the MVP.

## Decision

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

## Expected validation

**Documented:** preserve ADR-DIVE-008's existing center-entry validation scenarios: exact Origin/body agreement, denied no-Origin/unknown/inactive/cross-tenant entry, center.read plus current scope, immutable reserved keys, exact database-resolved CORS, fail-closed resolver errors, Owner/Admin-only lifecycle, repeated-state audit, no handle revocation on entry disable, absolute post-bootstrap handoff and environment readiness. No new deployment claim is made.

## Remaining open questions

Exact environment FQDNs and deployed readiness probes; future custom-domain provisioning; lifecycle purpose catalog, note/content limits and retention; administration tooling and incident response. These questions do not reopen the already approved platform-host and mapping decisions.
