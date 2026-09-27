# ADR-DIVE-009 — Frontend state management

- **Status:** Draft
- **Version:** 0.3
- **Date:** 2026-09-27
- **Decision date:** 2026-09-27
- **Deciders:** Product / Frontend Architecture
- **Affected surfaces:** `apps/web` dashboard, hosted public booking page, and iframe widget; integration boundary with `apps/api`

Revision record: version 0.2 was approved for implementation on 2026-09-27. This semantic refinement was requested by the product owner on 2026-09-27 after reviewing the NestJS/React state strategy. It returns the ADR to Draft until the revised decisions receive explicit approval.

## Provenance

| Decision | Provenance | Exact source | Approval / status |
|---|---|---|---|
| Next.js is the web framework for the dashboard, hosted booking page, and iframe widget | `Documented` | `ADR-DIVE-002` § Decision | Existing normative constraint |
| Keep browser state at the closest owning component or route and add shared state only for multiple independent consumers | `Documented` | `.github/agents/frontend-web-widget-engineer.agent.md` § Implementation design | Existing project rule |
| Clerk owns identity; PostgreSQL remains authoritative for memberships and authorization | `Documented` | `ADR-DIVE-008` § Responsibility split | Existing normative constraint |
| Persist the tenant-context handle in `sessionStorage`, never `localStorage`, and send it through `X-Tenant-Context` | `Documented` | `ADR-DIVE-008` § Credential representation and transport / Lifetime, renewal, and revocation | Existing normative constraint |
| Do not cache application authorization decisions in the MVP | `Documented` | `ADR-DIVE-008` § Authorization path | Existing normative constraint |
| Use TanStack Query for interactive client-side server state, URL state for navigation, and local React state for component-owned UI | `Documented` | `ADR-DIVE-009` v0.2 § Decision | Previously approved baseline; retained |
| Do not introduce a general-purpose global store by default; assess Zustand only for demonstrated cross-route browser-owned state | `Documented` | `ADR-DIVE-009` v0.2 § Shared client store | Previously approved baseline; retained |
| Evaluate URL ownership before Context or Zustand, and include local state explicitly in the decision sequence | `Proposed` | Borja's documentation-update request following the NestJS/React strategy review on 2026-09-27 | Draft pending explicit approval |
| Prefer server-owned loading when browser cache lifecycle is unnecessary; use TanStack Query only for interactive remote data | `Proposed` | Same review and request | Draft pending explicit approval |
| Keep forms in React Hook Form with Zod for client validation, without making client validation or persistence authoritative | `Proposed` | Same review and request | Draft pending explicit approval |
| Keep authorization, invariants, concurrency, idempotency, and final validation authoritative in NestJS/domain/PostgreSQL | `Derived` | `ADR-DIVE-008` § Authorization path; `.github/agents/frontend-web-widget-engineer.agent.md` § Implementation design; `specs/foundation/sdd-specs-traceability.md` § Definition of Ready | Draft pending explicit approval |
| Do not define global retry, freshness, persistence, or optimistic-update defaults in this ADR | `Proposed` | Same review and request | Draft pending explicit approval |

## Context

`apps/web` uses Next.js and React and already has an approved boundary separating server-owned data, interactive remote state, navigation state, and local UI state. The reviewed strategy adds React Hook Form, Zod, Context, and Zustand examples, but its original tree contains ambiguities:

- filters appear both as Context state and URL state;
- component-local `useState` / `useReducer` is absent from the tree;
- “data comes from an API” selects TanStack Query even when server-owned loading is sufficient;
- “complex business flow” can be misread as permission to move domain authority into Zustand;
- automatic retries and form persistence are described too broadly;
- a fixed update-frequency threshold is used to decide whether Context is appropriate.

The dashboard contains authenticated tenant-scoped data. Hosted booking and widget surfaces are public and use server-resolved channel context. Client state must not become a second domain model or an authorization, capacity, or transaction authority.

## Proposed decision

### Decision sequence

Use the narrowest owner and evaluate state in this order:

1. If the value represents shareable navigation and is safe to expose, use route segments or `searchParams`.
2. If the value is remote and server-owned, load it in Next.js server-owned code when no browser cache lifecycle is required; use TanStack Query when client interaction requires mutation, invalidation, polling, pagination, refetching, or equivalent cache behavior.
3. If the value is form interaction, use React Hook Form with Zod for client-side parsing and user feedback.
4. If one component or route owns the value, use local `useState` or `useReducer`.
5. If multiple independent consumers need stable browser-owned UI configuration, evaluate React Context.
6. If a demonstrated cross-route workflow needs browser-owned draft state that is neither URL state nor remote state, evaluate Zustand through a focused follow-up decision.
7. If none fits, review the ownership boundary instead of introducing a generic global store.

### State ownership

| State category | Owner |
|---|---|
| Server-rendered data without a required browser cache lifecycle | Next.js server-owned code / Server Components |
| Interactive remote reads, mutations, invalidation, and refetching | TanStack Query |
| Shareable filters, selected dates, pagination, sorting, and active tabs | Route segments and validated `searchParams` |
| Form inputs, dirty state, client parsing, and submit coordination | React Hook Form with Zod |
| Component or route UI state, modals, and short local workflows | React `useState` / `useReducer` at the closest owner |
| Stable shared UI dependencies or configuration | React Context with a deliberately bounded provider |
| Demonstrated cross-route browser-owned drafts | No baseline store; Zustand may be evaluated in a follow-up decision |
| Authenticated identity/session | Clerk integration; do not copy it into an application store |
| Dashboard tenant context | Existing `ADR-DIVE-008` contract (`sessionStorage` + `X-Tenant-Context`) |
| Domain truth, authorization, invariants, concurrency, idempotency, and committed state | NestJS/domain/PostgreSQL |

### URL state

- URL state is evaluated before Context or Zustand for navigable values.
- URL values are parsed and validated at the route boundary.
- Secrets, raw identity/session material, the raw tenant-context handle, and sensitive personal data must not be placed in URLs.
- Context may distribute a parsed URL value but must not become a second writable source of truth for it.

### Server state and TanStack Query

- TanStack Query caches product data, not authorization decisions. Every request follows the request-time authorization path in `ADR-DIVE-008`.
- Query keys must include the non-secret scope required to prevent cache collisions, while never containing raw Clerk tokens or the raw `X-Tenant-Context` handle.
- A tenant-context change, explicit revocation, or logout must prevent reuse of cached data from the previous dashboard context.
- Public hosted-page/widget caches remain isolated from authenticated dashboard caches. The browser does not provide authoritative tenant, center, or activity identifiers for public channel resolution.
- Capacity-sensitive booking results remain server-authoritative. An optimistic client value is never confirmation.
- Retry and freshness behavior is selected per endpoint and failure class. This ADR introduces no numeric retry count or freshness duration.
- A mutation is not automatically retried unless its server contract makes that retry safe, including any required idempotency semantics.

### Forms and validation

- React Hook Form owns ephemeral browser form interaction; Zod provides client-side parsing and feedback.
- Client validation does not replace authoritative NestJS/domain validation, authorization, current-state checks, concurrency control, or persistence constraints.
- Form persistence across navigation is a product- and data-sensitivity decision. This ADR selects no global persistence mechanism or reset policy.
- Sensitive form data is not persisted to URL, `localStorage`, or a global store without an approved decision covering lifetime, privacy, cleanup, and recovery behavior.
- Shared schemas or generated API types may be evaluated separately; this ADR does not select a code-sharing mechanism.

### Context and shared client stores

- Context is selected by ownership and consumer boundaries, not by a fixed updates-per-second threshold.
- Providers should remain narrow enough that unrelated consumers do not subscribe to frequently changing values.
- Zustand, if later approved, stores only browser-owned draft or coordination state. It must not store API data as a second cache, authorization decisions, committed reservation state, capacity truth, Clerk tokens, or the raw tenant-context handle.
- A complex transaction is not by itself justification for Zustand. Backend transactions and invariants remain authoritative.
- A workflow with explicit transitions may use a reducer or separately approved state-machine approach; Zustand alone does not define workflow semantics.

## Consequences

- Server data, navigation, form interaction, local UI state, shared UI dependencies, and cross-route drafts have distinct owners.
- URLs remain reloadable and shareable without exposing secrets or sensitive data.
- Client caches and stores cannot become authorization, capacity, or transaction authority.
- React Hook Form and Zod are documented as the preferred form boundary but are added as dependencies only by an approved implementation PR that needs them.
- No default retry count, cache TTL, freshness duration, form persistence policy, pagination value, or optimistic-update policy is introduced.
- ADR-DIVE-009 returns to Draft because this revision changes semantic decisions beyond the approved v0.2 baseline.

## Expected validation after approval

The first implementation affected by this revision should demonstrate, as applicable:

- back/forward, reload, and link behavior for URL-owned state;
- server-owned loading where no interactive browser cache lifecycle is needed;
- an interactive server-state read or mutation with explicit invalidation/refetch behavior;
- no secret or sensitive value in URLs, query keys, logs, or persisted client state;
- cache isolation on tenant-context change, logout, and revocation;
- authoritative NestJS validation after client-side form validation;
- safe mutation retry behavior or explicit absence of automatic retry;
- independence between dashboard and public hosted/widget surfaces;
- manual validation while an applicable product web e2e harness is absent.

## Alternatives considered

### One global client store for all application data

Not selected. It duplicates remote state, increases invalidation complexity, and risks mixing tenant-scoped data with browser UI state.

### TanStack Query for every API read

Not selected. Server-owned loading remains preferable when the browser does not require an interactive cache lifecycle.

### React Context for filters or remote data

Not selected. Shareable filters belong to validated URL state; remote data belongs to server-owned loading or TanStack Query. Context remains suitable for bounded shared UI dependencies.

### Zustand for every multi-step or transactional flow

Not selected. Local reducers or form state may be sufficient, and committed business transitions remain server-authoritative.

### A fixed Context update-frequency threshold

Not selected. Provider scope, consumer breadth, value identity, and render cost determine suitability; this ADR introduces no numeric threshold.

## Open questions

1. Which approved form slice first justifies adding React Hook Form and Zod to `apps/web`?
2. Should frontend API types be generated from an approved contract or shared through another boundary?
3. Does any future browser-owned cross-route workflow demonstrate the need for Zustand and an explicit persistence policy?
4. What retry and freshness policy is justified for each endpoint and failure class?

## Implementation authority

This revision is Draft. The previously approved v0.2 boundary remains the current `main` decision until this revision is explicitly approved and merged. This PR does not authorize new dependencies, persistence mechanisms, retry defaults, or a production pilot.
