# ADR-DIVE-012 — Domain, host, and origin strategy

- **Status:** Draft
- **Version:** 0.1
- **Date:** 2026-09-27
- **Deciders:** Product / Security / Architecture
- **Affected IDs:** `DIVE-IAM-REQ-006`, `024`, `032`; `DIVE-BOOK-REQ-004`, `040`, `042`; ADR-DIVE-005; ADR-DIVE-008; ADR-DIVE-011

## Provenance

This ADR separates already approved constraints from new architecture proposals. The Notion page that motivated this draft is context only and is not a normative source. Borja requested opening this Draft PR on 2026-09-27; that request does not approve the Proposed decisions or authorize implementation.

| Decision | Provenance | Exact source | Approval / status |
|---|---|---|---|
| Canonical MVP center entry is `https://<centerKey>.app.<domain>`; `centerKey`, `centerRef`, `Host`, and `Origin` are untrusted selectors and server-side membership and center scope remain authoritative | `Documented` | ADR-DIVE-008 v0.10; `SPEC-DIVE-IAM-001` `DIVE-IAM-REQ-006`, `024`, `032` | Ready to start; existing implementation authority |
| Dashboard CORS uses exact generated origins, never wildcard origins; wildcard DNS/TLS does not authorize an origin | `Documented` | ADR-DIVE-008 v0.10, sections “CORS population” and “Center-application entry” | Ready to start; existing implementation authority |
| Environments have distinct `<domain>` namespaces; the same `centerKey` may be reused across environments | `Documented` | ADR-DIVE-008 v0.10, section “Environment namespace” | Ready to start; existing implementation authority |
| Center bootstrap requires a valid browser `Origin`; clients without `Origin` cannot use it in the MVP | `Documented` | ADR-DIVE-008 v0.10, section “Clients without `Origin`”; `DIVE-IAM-REQ-032` | Ready to start; existing implementation authority |
| Custom center domains, branded login, and cross-domain session continuity remain outside the MVP | `Documented` | ADR-DIVE-008 v0.10; `SPEC-DIVE-IAM-001` open questions | Existing scope constraint |
| Hosted public booking uses `/{locale}/book/{channelPublicId}` and resolves tenant, center, and offering scope from published server-side channel configuration | `Documented` | ADR-DIVE-011 v0.3; `DIVE-BOOK-REQ-004`, `040`, `042` | Existing Draft route proposal plus existing channel constraints; this ADR does not promote ADR-DIVE-011 |
| Keep one shared API surface at `api.<domain>` instead of creating an API host per center | `Proposed` | Architecture proposal in this PR, based on the non-normative Notion context requested for review by Borja on 2026-09-27 | Draft; not approved; no implementation authority |
| Serve the first-party hosted booking page from `book.<domain>` while retaining the ADR-DIVE-011 route beneath that host | `Proposed` | Architecture proposal in this PR, based on the non-normative Notion context requested for review by Borja on 2026-09-27 | Draft; not approved; no implementation authority |
| Permit wildcard DNS and TLS coverage for `*.app.<domain>` while requiring unknown, inactive, malformed, and cross-environment hosts to fail closed | `Proposed` | Architecture proposal in this PR, constrained by ADR-DIVE-008 non-disclosure and authorization rules | Draft; not approved; no implementation authority |
| Accept `Host`, `Origin`, and forwarded host/protocol data only behind an explicitly trusted proxy boundary; require the resolved host to map to active trusted configuration | `Proposed` | Security proposal in this PR, constrained by `DIVE-IAM-REQ-024`, `032` and ADR-DIVE-008 | Draft; not approved; no implementation authority |
| Treat future custom domains as verified aliases of the canonical center mapping without changing authorization | `Proposed` | Future architecture proposal in this PR; custom domains are excluded by ADR-DIVE-008 | Draft; outside MVP; no implementation authority |

## Context

ADR-DIVE-008 already owns authenticated dashboard tenant context and center-application bootstrap. It approves the canonical center subdomain, the exact-origin CORS model, one authentication host per environment, separate environment domains, and the MVP requirement for browser `Origin`.

ADR-DIVE-011 owns the proposed hosted availability route and presentation boundary. ADR-DIVE-005 and `SPEC-DIVE-BOOKING-001` own public-channel authorization. This ADR must not duplicate or weaken those contracts.

The remaining architecture gap is the platform-level relationship between the corporate/product host, center applications, the shared API, the hosted booking surface, DNS/TLS coverage, trusted proxy boundaries, and future verified aliases.

## Proposed decision

### Surface map

The proposed logical surfaces are:

| Surface | Proposed pattern | Responsibility |
|---|---|---|
| Product and marketing | `<domain>` and optionally `www.<domain>` | Public product information; never selects a tenant |
| Center application | `<centerKey>.app.<domain>` | Existing authenticated center-entry flow from ADR-DIVE-008 |
| Shared API | `api.<domain>` | Shared HTTP boundary for dashboard and public endpoints |
| Hosted booking | `book.<domain>/{locale}/book/{channelPublicId}` | First-party public page using the ADR-DIVE-011 route proposal |

The exact `<domain>` values, whether `www` exists, and apex/`www` canonicalization remain open. This table does not allocate production names.

### Shared API

One API host serves authorized dashboard calls and public channel endpoints. A center subdomain selects a browser surface but does not create a center-specific API deployment or authorization boundary.

The API continues to resolve authorization from the applicable existing contract:

- dashboard requests: authenticated identity, tenant context, membership, permission, center scope, and resource state;
- center bootstrap: exact origin plus matching `centerRef`, trusted mapping, Clerk authentication, active membership, and current center scope;
- public booking: published server-side channel configuration and the capabilities owned by the booking SPEC and ADRs.

This proposal does not select deployment topology, regional routing, API gateway, CDN, proxy vendor, or runtime provider.

### Hosted booking host

`book.<domain>` is proposed as the first-party host for the hosted public booking page. The route beneath it remains owned by ADR-DIVE-011:

```text
/{locale}/book/{channelPublicId}
```

The hostname does not become a tenant selector. Tenant, center, activity, and channel scope continue to come from published server-side configuration. This ADR does not approve ADR-DIVE-011, freeze a public JSON DTO, or define widget embed behavior.

### DNS and TLS

Wildcard DNS and certificate coverage for `*.app.<domain>` are proposed to make issued center hosts reachable without creating a separate DNS and certificate operation for every center.

Wildcard coverage is only an edge-routing and certificate mechanism:

- it does not register a `centerKey`;
- it does not activate a center mapping;
- it does not authorize an origin;
- it does not grant membership, permission, or center scope;
- it does not permit an unknown host to fall back to another center.

`api.<domain>`, `book.<domain>`, the authentication host, and corporate hosts use explicit records unless a later approved decision states otherwise.

### Host, origin, and proxy trust

The application must distinguish an externally requested host from untrusted forwarded headers. The exact proxy chain and header contract remain open, but the proposed invariant is:

1. accept forwarded host/protocol information only from explicitly trusted infrastructure;
2. normalize and validate the external host for the active environment;
3. resolve it through active trusted configuration;
4. fail closed when it is unknown, inactive, malformed, ambiguous, or belongs to another environment;
5. apply the existing exact-origin and authorization contracts after resolution.

Suffix matching such as “ends with `.app.<domain>`” is insufficient by itself. The host must resolve to an active mapping. The API must never reflect an arbitrary received `Origin` into CORS response headers.

This draft does not select trusted proxy CIDRs, header precedence, normalization rules, cache lifetime, configuration propagation, or invalidation timing.

### Environment isolation

ADR-DIVE-008 already approves separate `<domain>` namespaces per environment and allows deliberate reuse of the same `centerKey`. This ADR adds no competing namespace rule.

Mappings, DNS zones, certificates, origin lists, redirects, logs, and operational credentials must not make a host from one environment resolve as a center in another. Exact production, staging, preview, and local hostnames remain configuration decisions requiring approval.

### Future custom domains

Custom domains remain outside the MVP. A future decision may introduce:

```text
verified hostname → canonical center mapping → tenant + center
```

The alias would remain an untrusted selector. It could not bypass membership, center scope, public-channel configuration, non-disclosure, or booking capabilities.

A later approved ADR must define ownership verification, DNS instructions, certificate lifecycle, activation and revocation states, canonical URL and redirects, Clerk configuration, CORS and CSP, domain-takeover prevention, audit, rollback, and incident response.

## Compatibility assessment

| Area | Result |
|---|---|
| Center bootstrap | Preserves ADR-DIVE-008 and `DIVE-IAM-REQ-032`; no new selector or authorization source |
| Exact-origin CORS | Preserves the generated exact-origin model; explicitly rejects wildcard CORS |
| Environment namespace | Preserves ADR-DIVE-008 reuse of `centerKey` across distinct environment domains |
| Public channel authorization | Preserves `DIVE-BOOK-REQ-004` and ADR-DIVE-005 server-side resolution |
| Hosted availability route | Reuses the ADR-DIVE-011 Draft route without promoting it |
| Custom domains | Remain outside MVP |

## Security consequences

- Wildcard DNS increases the set of hostnames that can reach the edge; unknown and inactive hosts must fail closed.
- Exact CORS reduces accidental browser use but does not replace authentication or authorization.
- A shared API avoids per-center policy drift but concentrates routing and configuration correctness at one boundary.
- `centerKey` is visible in DNS, URLs, logs, and certificates and must not contain secrets or personal data.
- Host-header poisoning, forwarded-header trust, cross-environment mappings, stale configuration, and future domain takeover require explicit threat analysis and validation before implementation.
- Logs and traces continue to redact `Authorization` and `X-Tenant-Context` under ADR-DIVE-008.

No security control in this section is implementation authority while this ADR remains Draft, except where it restates an approved source as Documented.

## Expected validation after approval

If the Proposed decisions are approved, implementation evidence must demonstrate:

- a configured center host resolves only its active center mapping;
- unknown, inactive, malformed, and cross-environment hosts fail closed without disclosure;
- wildcard DNS/TLS does not create wildcard CORS or an active center mapping;
- changing `Host`, `Origin`, or untrusted forwarded headers cannot select another center;
- a center application cannot use the shared API to access another center outside the approved IAM contract;
- the hosted booking host continues to resolve scope from published channel configuration;
- logs do not turn host failures into an enumeration oracle or expose bearer/context credentials.

These are proposed validation targets, not claims of current test coverage.

## Open questions

1. Exact root domains and authentication-host FQDNs for each environment.
2. Whether the product host uses apex, `www`, or a redirect between them.
3. DNS provider, certificate provider, provisioning, renewal, monitoring, and incident ownership.
4. Trusted proxy topology, forwarded-header contract, normalization, and rejection behavior.
5. Source of truth, propagation, and invalidation for active host mappings and generated exact CORS origins.
6. Clerk allowed-origin and redirect configuration at the expected center count.
7. Preview and local-development host conventions.
8. Administrative lifecycle for allocating, correcting, disabling, retiring, and potentially reusing a non-reserved `centerKey`.
9. Whether a future custom-domain feature is justified and which artifact owns its contract.

The following are not open in this ADR: the approved reserved `centerKey` set, reuse of the same `centerKey` across distinct environment domains, exact generated CORS rather than wildcard CORS, one authentication host per environment, and the MVP denial of center bootstrap without `Origin`.

## Implementation authority

This ADR is Draft. All new decisions remain Proposed and non-normative. It does not authorize DNS, TLS, CORS, Clerk, proxy, routing, deployment, schema, or runtime changes. Existing approved behavior continues to be governed by ADR-DIVE-008, `SPEC-DIVE-IAM-001`, `SPEC-DIVE-BOOKING-001`, ADR-DIVE-005, and any separately approved portions of ADR-DIVE-011.
