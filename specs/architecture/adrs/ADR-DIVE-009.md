# ADR-DIVE-009 — Frontend state management

- **Status:** Draft
- **Version:** 0.1
- **Date:** 2026-09-27
- **Deciders:** Product / Frontend Architecture
- **Affected surfaces:** `apps/web` dashboard, hosted public booking page, and iframe widget

## Provenance

| Decision | Provenance | Exact source | Approval / status |
|---|---|---|---|
| Next.js is the web framework for the dashboard, hosted booking page, and iframe widget | `Documented` | `ADR-DIVE-002` § Decision | Existing normative constraint |
| Keep browser state at the closest owning component or route and add shared state only for multiple independent consumers | `Documented` | `.github/agents/frontend-web-widget-engineer.agent.md` § Implementation design | Existing project rule |
| Clerk owns identity; PostgreSQL remains authoritative for memberships and authorization | `Documented` | `ADR-DIVE-008` § Responsibility split | Existing normative constraint |
| Persist the tenant-context handle in `sessionStorage`, never `localStorage`, and send it through `X-Tenant-Context` | `Documented` | `ADR-DIVE-008` § Credential representation and transport / Lifetime, renewal, and revocation | Existing normative constraint |
| Do not cache application authorization decisions in the MVP | `Documented` | `ADR-DIVE-008` § Authorization path | Existing normative constraint |
| Use TanStack Query for interactive client-side server state | `Proposed` | Borja's frontend-state decision request and confirmation on 2026-09-27 | Approved for documentation; remains Draft until merged/accepted |
| Use the URL for shareable/navigation state and local React state for component-owned UI | `Proposed` | Same product confirmation | Approved for documentation; remains Draft until merged/accepted |
| Do not introduce a general-purpose global store by default; assess Zustand only for demonstrated cross-route UI state | `Proposed` | Same product confirmation | Approved for documentation; remains Draft until merged/accepted |

## Context

`apps/web` currently uses Next.js 16 and React 19 and does not include a client-state library. The product needs a state-management boundary that does not duplicate server authority, leak tenant context, or turn a global client store into a second domain model.

The dashboard has authenticated, tenant-scoped data. The hosted booking page and iframe widget are public surfaces with server-resolved channel context. They must not share authorization state with the dashboard.

## Proposed decision

### State ownership

Use the narrowest owner for each category:

| State category | Owner |
|---|---|
| Server-rendered data that does not require browser interaction | Next.js server-owned code / Server Components |
| Interactive remote data, mutations, invalidation, and refetching | TanStack Query |
| Shareable filters, selected dates, pagination, and other navigation state | Route segments and `searchParams` |
| Component or feature UI state, form drafts, modals, and short workflows | React `useState` / `useReducer` at the closest owner |
| Authenticated identity/session | Clerk integration; do not copy it into an application store |
| Dashboard tenant context | Existing `ADR-DIVE-008` contract (`sessionStorage` + `X-Tenant-Context`) |

### Cache and tenant boundaries

- TanStack Query caches product data, not authorization decisions. Every request still follows the request-time authorization path in `ADR-DIVE-008`.
- A tenant-context change, explicit revocation, or logout must prevent reuse of cached data from the previous dashboard context. The implementation must clear or replace the affected Query cache as part of the same client transition.
- Query keys and diagnostics must never contain the raw Clerk token or raw `X-Tenant-Context` handle.
- Public hosted-page/widget caches are isolated from authenticated dashboard caches. Public channel context continues to be resolved server-side under `ADR-DIVE-001`; the browser does not provide authoritative tenant, center, or activity identifiers.
- Capacity-sensitive booking results remain server-authoritative. The client may refresh or invalidate them but must not treat an optimistic capacity value as confirmation.

### Shared client store

A general-purpose client store is not part of the baseline. Introduce one only when multiple independent consumers require shared browser-owned state that is neither server state nor navigation state.

If that need is demonstrated, Zustand is the first candidate to evaluate. Adoption requires a focused follow-up decision describing the concrete state, lifetime, tenant/cache isolation, persistence behavior, and why React state or URL state is insufficient. Redux is not selected by this ADR.

## Consequences

- Server state and browser UI state have separate owners.
- URLs remain reloadable and shareable for navigable state.
- Client caches cannot become authorization authority.
- The dashboard, hosted page, and widget do not share a process-wide store.
- TanStack Query becomes an implementation dependency only in the PR that introduces an interactive remote-data use case; this documentation change does not add the package.

## Expected validation

The first implementation using this ADR should demonstrate:

- a server-state read and mutation with explicit invalidation or refetch behavior;
- reload/back-forward behavior for URL-owned state;
- no raw session or tenant-context secret in query keys, logs, or persisted cache;
- cache isolation when changing tenant context and on logout/revocation;
- independence between dashboard and public hosted/widget surfaces;
- manual validation while an applicable web e2e harness is absent.

No numeric cache TTL, retry count, persistence policy, pagination default, or optimistic-update default is introduced here.

## Alternatives considered

### One global client store for all application data

Not selected. It duplicates remote state, increases invalidation complexity, and risks mixing tenant-scoped data with browser UI state.

### React Context as the remote-data cache

Not selected. Context remains suitable for stable dependency/configuration boundaries but is not the default cache and mutation mechanism.

### Redux as the default store

Not selected for the current scope. No demonstrated browser-owned workflow requires its additional event/reducer infrastructure.

### Zustand as the default store

Deferred until a concrete cross-route browser-owned state need exists. It must not store API data, authorization decisions, Clerk tokens, or the raw tenant-context handle.

## Open questions

1. Which first approved `apps/web` slice will introduce TanStack Query and therefore own its provider placement and hydration pattern?
2. Does any future browser-owned cross-route workflow demonstrate the need for Zustand?
3. What product-specific retry and freshness policies are justified per endpoint? No defaults are selected by this ADR.

## Implementation authority

This ADR is Draft. It documents the approved proposal but does not authorize implementation or dependency installation until Borja explicitly promotes it or it is merged as an accepted source according to the repository lifecycle.
