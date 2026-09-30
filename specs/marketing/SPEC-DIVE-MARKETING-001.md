# SPEC-DIVE-MARKETING-001 — Public product landing

- **Status:** Ready to start
- **Version:** 0.1
- **Last reviewed:** 2026-09-29
- **Approved by:** Product owner
- **Approval reference:** explicit product confirmation on 2026-09-29: keep the MVP landing in `apps/web`; expose only a request-access/contact CTA; omit login and prices; defer pricing presentation; accept the remaining MVP closures recorded below
- **Owner:** Product / Frontend Architecture
- **IDs:** `DIVE-MKT-REQ-001` … `DIVE-MKT-REQ-012`

## Normative authority

This SPEC governs the public product landing for the dive-center SaaS. It does not govern the authenticated center application, bootstrap, ordinary invitations, hosted booking, or the booking widget.

`ADR-DIVE-008` remains authoritative for canonical authentication and center hosts. `ADR-DIVE-012` owns the wider host/origin strategy and remains Draft for its unrelated shared-API, booking-host, proxy, wildcard-DNS, and custom-domain proposals. Product approval on 2026-09-29 authorizes only the landing decisions identified here and in ADR-DIVE-012 v0.4.

## Requirement provenance

| Requirement IDs | Provenance | Exact source | Decision status |
|---|---|---|---|
| `DIVE-MKT-REQ-001` | `Proposed` | Product confirmation 2026-09-29 | Approved for Ready-to-start implementation |
| `DIVE-MKT-REQ-004..DIVE-MKT-REQ-012` | `Proposed` | Product confirmation 2026-09-29 | Approved for Ready-to-start implementation |
| `DIVE-MKT-REQ-002` | `Derived` | `ADR-DIVE-008` v0.14 single Next.js deployment boundary; Product confirmation 2026-09-29 | Derivation explicitly approved 2026-09-29 |
| `DIVE-MKT-REQ-003` | `Derived` | `ADR-DIVE-008` v0.14 fail-closed host resolution; Product confirmation 2026-09-29 | Derivation explicitly approved 2026-09-29 |

### Derivations

- **DIVE-MKT-REQ-002:** reusing the approved single Next.js deployment for another explicitly approved host preserves one web deployment while route/layout separation prevents surface coupling.
- **DIVE-MKT-REQ-003:** an approved public product host does not weaken the existing rule that unknown or cross-environment hosts fail closed and never become authorization sources.

## Context

The root route in `apps/web` still contains the default Next.js starter page. The MVP needs a public product surface that explains the SaaS and provides a controlled contact path without turning marketing into authentication, tenant selection, or public signup.

## Goals

- Explain the product to a prospective dive-center operator.
- Offer one clear request-access/contact action.
- Preserve strict separation from authentication, tenant bootstrap, center entry, and booking.
- Reuse the existing Next.js application and deployment for the MVP without making host routing an authorization source.

## Non-goals

- Public signup or tenant creation.
- A login CTA on the landing.
- Prices, checkout, billing, or purchasing.
- A lead form, CRM, CMS, blog, experimentation, or marketing automation.
- Marketing analytics, non-essential cookies, or behavioral tracking.
- Tenant-specific marketing pages, custom center domains, hosted booking, or the widget.
- English localization in the initial increment.

Displaying prices may be considered in a future product decision. This SPEC does not define price models, visibility rules, billing promises, or a future implementation date.

## Requirements

### Surface and host

- **DIVE-MKT-REQ-001:** Canonical public product host. The environment's apex product domain is the canonical landing host. `www` redirects permanently to that canonical host. Exact environment values are required deployment configuration and have no code default.
- **DIVE-MKT-REQ-002:** Existing web application. The MVP landing is implemented in `apps/web` and served by the existing Next.js build/deployment, with a logical routing and layout boundary from authentication and center surfaces.
- **DIVE-MKT-REQ-003:** Exact host routing. Only the configured public product host may serve the landing. Unknown, inactive, malformed, center-like, or cross-environment hosts fail closed and never fall back to the landing. Host presentation does not authorize any product resource.

### Public behavior

- **DIVE-MKT-REQ-004:** Public and tenant-neutral. A visitor can read the landing without Clerk authentication. Rendering it does not resolve a tenant, center, membership, role, permission, invitation, bootstrap grant, or booking channel.
- **DIVE-MKT-REQ-005:** Single conversion action. The landing exposes one primary action expressed as request access or contact. It does not show a login CTA, public signup, manual invitation entry, bootstrap entry, or center-creation action.
- **DIVE-MKT-REQ-006:** Contact by email only. The initial action uses an explicitly configured email destination. It does not submit a product-owned lead form, persist lead data, create a Clerk identity, issue an invitation, or create a tenant, center, or membership. The application must not accept an arbitrary visitor-controlled destination.
- **DIVE-MKT-REQ-007:** Initial language. The initial landing content is Spanish. Adding English or another locale requires a later scoped decision and does not inherit booking-locale behavior automatically.
- **DIVE-MKT-REQ-008:** No prices in the initial landing. The landing does not display prices, discounts, plan comparisons, billing claims, checkout links, or price placeholders. Future price presentation remains a separate product decision.
- **DIVE-MKT-REQ-009:** No marketing tracking. The initial landing loads no marketing analytics, experimentation, behavioral tracking, or non-essential cookies. Operational security logs governed by existing platform rules are not marketing tracking.

### Presentation and discoverability

- **DIVE-MKT-REQ-010:** Minimum content. The landing identifies the product as software for dive-center management, communicates its core value without making unsupported guarantees, and presents the approved contact action. Exact copy and visual composition remain implementation choices within these constraints.
- **DIVE-MKT-REQ-011:** Responsive and keyboard-usable. The initial page is usable at mobile and desktop widths, preserves visible keyboard focus, uses semantic navigation and headings, and keeps the contact action operable by keyboard. No numeric performance or accessibility conformance claim is introduced by this requirement.
- **DIVE-MKT-REQ-012:** Basic indexing metadata. Production supplies an accurate title, description, canonical URL, and social-sharing metadata. Non-production and preview environments must not be indexed. Sitemap and robots behavior must reflect the configured environment and must not expose authenticated, bootstrap, or center-only routes as public landing content.

## Invariants

1. The landing is presentation, never an authentication or authorization boundary.
2. No landing action creates or activates identity, tenant, center, membership, invitation, bootstrap grant, or booking data.
3. No host, path, query parameter, referrer, or CTA input selects a tenant or center.
4. Unknown hosts do not receive a generic landing fallback.
5. Deferred prices and tracking cannot be introduced as implementation details of this increment.

## Acceptance scenarios

1. **Given** the configured production product host, **when** an unauthenticated visitor opens `/`, **then** the Spanish landing renders without tenant or Clerk context and exposes the approved contact action.
2. **Given** the configured `www` host, **when** a visitor opens it, **then** the response redirects permanently to the canonical apex product URL.
3. **Given** an unknown, center-like, malformed, or cross-environment host, **when** `/` is requested, **then** the request fails closed without serving the landing or disclosing tenant data.
4. **Given** the landing, **when** its interactive elements are inspected, **then** there is no login, signup, invitation, bootstrap, center-creation, price, checkout, or lead-form action.
5. **Given** the contact action, **when** it is activated, **then** it addresses only the configured email destination and produces no product-side persistence or authorization effect.
6. **Given** a preview or non-production deployment, **when** crawlers inspect its metadata, **then** indexing is disabled.
7. **Given** keyboard-only navigation at representative mobile and desktop layouts, **when** the visitor reaches the contact action, **then** focus remains visible and the action is operable.

## Data, API, events, and persistence

The initial increment adds no product API, database table, event, outbox message, audit action, invitation command, or tenant-scoped persistence. The contact email destination and canonical hosts are trusted deployment configuration, not visitor inputs.

## Security and privacy

- The landing must not initialize a tenant context or treat host routing as authorization.
- It must not expose Clerk invitation or bootstrap entry points.
- It collects no lead data inside the product and loads no marketing tracker or non-essential cookie.
- Public metadata and copy must not contain secrets, personal data, internal hostnames, preview URLs, or claims unsupported by normative product behavior.

## Performance and operations

No numeric performance budget is selected. The implementation should remain compatible with the existing Next.js deployment and must expose configuration failures rather than silently choosing product hosts or contact destinations.

## Rollout and rollback

Roll out first with synthetic/public copy and the configured contact destination. Rollback restores the previous root presentation without changing authentication, center routing, tenant data, or backend contracts. Deployment activation requires validated DNS/TLS, canonical redirect, environment indexing behavior, and contact destination.

## Expected verification

- Route/host tests for canonical product, `www`, unknown, center-like, and cross-environment hosts.
- Page/component tests for the single contact action and absence of prohibited actions/content.
- Metadata tests for canonical, production indexing, and non-production `noindex`.
- Accessibility-focused tests plus manual keyboard and responsive inspection.
- Verification that rendering performs no tenant, bootstrap, booking, or Clerk-authorizing call.

## Open questions

None block the initial increment. Prices, additional locales, forms/CRM, analytics, CMS, and experiments remain future product decisions rather than implicit follow-ups.