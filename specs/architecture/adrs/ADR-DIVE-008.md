# ADR-DIVE-008 — Internal tenant-scoped dashboard context

- **Status:** Ready to start
- **Version:** 0.3
- **Date:** 2026-09-27
- **Decision date:** 2026-09-27
- **Deciders:** Product / Security / Architecture
- **Affected IDs:** `DIVE-IAM-REQ-001..006`, `016`, `022`, `024`, `028..031`; `MT-REQ-002`, `006`, `009`

## Provenance

The path and credential decisions were introduced as `Proposed` on 2026-09-27. Product owner (Borja) explicitly promoted this ADR to Ready to start on 2026-09-27. It is now implementation authority for dashboard tenant context. Remaining open questions stay outside the approved decision and must not be filled with silent defaults.

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

## Context

The current IAM/API vertical authenticates a Clerk session token and receives `tenantId` in dashboard route paths. The service then resolves the identity–tenant membership and establishes authorized transaction-local tenant context.

The product direction is to remove tenant identifiers from dashboard API paths while keeping Clerk limited to identity authentication and PostgreSQL authoritative for product authorization. The solution must preserve multi-tenant isolation, multi-center scopes, revocation, non-disclosing failures, and identities that belong to several operators.

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

Conceptual stored fields (physical schema remains an implementation detail):

- handle hash;
- internal identity;
- tenant id;
- Clerk `sid`;
- issued-at;
- revoked-at, when revoked.

### Lifetime, renewal, and revocation

- The handle has no independent product TTL. It remains usable only while the Clerk session is valid, the row is not revoked, and the membership remains active.
- There is no sliding renewal. A revoked, unknown, or session-mismatched handle requires a new `POST /v1/me/tenant-contexts`.
- Selecting another operator issues another handle. It does not rewrite the previous handle unless the client revokes it.
- Membership disable, role/scope change, and authorization decisions are read from PostgreSQL on the request, as required by ADR-DIVE-007. Disable takes effect on the next request even if the handle row still exists.
- Clerk logout, session expiry, or adapter failure to confirm an active session deny the request. Existing adapter session checks remain the authorization gate; a later webhook that also revokes handle rows is defense in depth and is not required by this ADR.
- Explicit `DELETE /v1/me/tenant-contexts` revokes the presented handle.
- Cleanup of revoked or session-orphan rows is operational and must not invent a retention period here.
- Logs, traces, and audit must not record the raw handle, `Authorization` value, or `X-Tenant-Context` value. A safe internal tenant id may appear in audit after trusted resolution.

### Operator selection

- With no active tenant membership, no dashboard tenant context is issued.
- With exactly one active tenant membership, `POST /v1/me/tenant-contexts` without `operatorRef` may select it automatically.
- With more than one active tenant membership, the user selects from `GET /v1/me/operators`. `operatorRef` is an opaque untrusted selector and is revalidated before issuance.
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

{ "operatorRef": "opref_…" }
```

`operatorRef` is omitted only when automatic selection is allowed (exactly one active membership). Success returns `{ "tenantContext": "ctx_…" }` once. The value is a selector, not an access token.

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

Exact JSON field names may be chosen in the implementation PR if they preserve this contract. The path rule and header-based context must not change.

### Simultaneous contexts

- Several independent handles may exist for the same identity and Clerk session.
- Each browser tab or API client presents the handle it holds. Two tabs may operate in two tenants without a process-wide “active tenant”.
- A numeric cap on live handles is not defined here.

### Multi-center organizations

- A context credential is tenant-scoped, not center-scoped.
- An operator with several centers still uses one tenant context.
- Each center-scoped operation validates that the center belongs to the selected tenant and is within the membership’s current authorized center scopes.
- Center identifiers remain resource selectors and never authorize access by themselves.
- Tenant-wide roles may operate across centers only as already allowed by `SPEC-DIVE-IAM-001`.

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
- **Unbounded issuance.** A valid session can create many handle rows. That is a resource-exhaustion and cleanup concern, not a tenant-escape by itself. A rate limit or live-handle cap is not defined here.
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
- multiple memberships require an explicit valid selection;
- fabricated, unrelated, inactive, and cross-identity selections issue no context;
- a context for tenant A cannot read or mutate tenant B;
- a center outside the current membership scope is denied;
- membership disable, Clerk logout, and session expiry prevent further authorized calls within the existing requirements;
- context credentials cannot be replayed by another identity or another Clerk session;
- missing Clerk session or missing/revoked handle fails closed;
- public widget and hosted-page flows remain independent of dashboard credentials;
- pooled connections retain no tenant context after commit, rollback, or failure;
- logs/audit do not persist raw bearer or context secrets.

Tests must link the relevant `DIVE-IAM-REQ-*` and existing `MT-SC-*` rows without merging product and multitenancy evidence.

## Remaining open questions

These do not reopen the closed path or credential-shape decision:

1. Browser persistence of the handle (in-memory, `sessionStorage`, or another client store).
2. Issuance rate limit or cap on live handles per identity/session.
3. Whether verified `session.revoked` webhooks should also mark handle rows revoked, in addition to request-time Clerk session checks.
4. Physical persistence schema, hash algorithm, and cleanup job.
5. Dashboard API CORS origin allowlist.
6. Exact JSON field names in the implementation PR, provided they preserve this contract.

## Alternatives considered

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

Ready to start authorizes reversible implementation with synthetic data for `DIVE-IAM-REQ-029..031`. Do not invent values for the remaining open questions. Runtime routes change only in the implementation PR, with the tests listed above.
