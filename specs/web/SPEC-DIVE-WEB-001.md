# SPEC-DIVE-WEB-001 — Center dashboard catalog UI

- **Status:** Draft
- **Version:** 0.1
- **Owner:** Product / Web
- **Last reviewed:** 2026-09-27
- **Approved by:** Pending
- **Approval reference:** Pending
- **IDs:** `DIVE-WEB-REQ-001` … `DIVE-WEB-REQ-012`

## Normative authority

This SPEC proposes the presentation and interaction contract for the authenticated center-dashboard implementation of US-08 in `apps/web` using the repository's current Next.js and React stack.

It does not redefine catalog lifecycle, authorization, API paths, request/response bodies, pagination, errors, persistence, or tenant isolation. Those remain owned by:

- `specs/booking/SPEC-DIVE-BOOKING-001.md`, especially `DIVE-BOOK-REQ-001..006`, `009..011`, `017..020`, `029`, and `049..057`;
- `specs/iam/SPEC-DIVE-IAM-001.md`, especially `DIVE-IAM-REQ-003`, `010..014`, `023..025`, and `029..032`;
- `specs/architecture/adrs/ADR-DIVE-008.md` for center-application entry and browser tenant context;
- `specs/architecture/adrs/ADR-DIVE-014.md` for catalog pagination, DTO, time rendering, and persistence decisions.

If this SPEC conflicts with those sources, the owning source wins and this SPEC returns to Draft for correction.

## Provenance policy

Every candidate requirement below declares provenance and an exact source. `Derived` and `Proposed` items remain non-normative while this SPEC is Draft. No implementation is authorized from this document until the blocking questions are closed and Borja explicitly approves promotion to `Ready to start`.

## Goal

Let an authorized member of one center use the internal dashboard to list, create, publish, and disable activities and to list, schedule, close, and cancel their slots without exposing another center, duplicating backend authorization, or inventing catalog behavior in the browser.

## Scope

### In scope

- Authenticated center application in `apps/web`.
- Activity list, state filter, pagination, create flow, publish action, and disable action.
- Activity-scoped slot list, optional date/state filters, pagination, create flow, close action, and cancel action.
- Loading, empty, success, validation, conflict, forbidden, not-found, and unavailable-center presentation.
- Responsive and keyboard-operable behavior for the catalog management slice.
- Component, integration-boundary, and manual accessibility evidence.

### Out of scope

- Public availability, hosted booking page, and iframe widget.
- Booking creation or management, customer data, payments, operations, certifications, or medical data.
- Editing API contracts, catalog state machines, permissions, DTOs, pagination defaults, or persistence.
- Calendar views that combine bookings and slots (`DIVE-BOOK-REQ-043`).
- A tenant/center selector inside the center application.
- Custom domains, white label, arbitrary themes, or arbitrary center HTML/CSS/JavaScript.
- Last-seat concurrency evidence owned by `SPIKE-DIVE-001`.

## Model and definitions

- **Center application:** the authenticated application entered at `https://<centerKey>.app.<domain>` and bootstrapped according to ADR-DIVE-008.
- **Activity:** the center-scoped catalog offering owned by `SPEC-DIVE-BOOKING-001`.
- **Slot:** the scheduled occurrence whose authoritative capacity and lifecycle are owned by `SPEC-DIVE-BOOKING-001`.
- **Catalog UI:** the activity and slot management surface proposed here. It is not an authorization boundary.
- **Current center:** the `centerId` returned by successful center-entry bootstrap. It is a selector; the server remains authoritative.

## Requirement provenance

| Requirement IDs | Provenance | Exact source | Decision status |
|---|---|---|---|
| `DIVE-WEB-REQ-001..DIVE-WEB-REQ-008` | `Derived` | ADR-DIVE-008 “Center-application entry” and “Credential representation and transport”; `SPEC-DIVE-IAM-001` `DIVE-IAM-REQ-006`, `029..032`; `SPEC-DIVE-BOOKING-001` `DIVE-BOOK-REQ-001..006`, `009..011`, `017..020`, `029`, `049..057`; ADR-DIVE-014 “Pagination contract” and “Response DTO” | Pending explicit approval; Draft |
| `DIVE-WEB-REQ-009` | `Proposed` | US-08 usability objective; `DIVE-BOOK-REQ-054` idempotent command contract | Pending Product approval; Draft |
| `DIVE-WEB-REQ-010` | `Derived` | `DIVE-BOOK-REQ-006`, `054`, `056`; `DIVE-IAM-REQ-024`, `032`; ADR-DIVE-008 “Denial” | Pending explicit approval; Draft |
| `DIVE-WEB-REQ-011` | `Proposed` | `.github/agents/frontend-web-widget-engineer.agent.md` accessibility guidance; no approved dashboard WCAG requirement found | Pending Product/Accessibility approval; Draft |
| `DIVE-WEB-REQ-012` | `Derived` | `docs/sdd/how-we-work.md` “Pull requests”; `.github/agents/frontend-web-widget-engineer.agent.md`; `TRACE-DIVE-MVP-001` current coverage | Pending explicit approval; Draft |

## Requirements

These candidate requirements are non-normative while this SPEC remains Draft.

- **DIVE-WEB-REQ-001:** The catalog UI operates only after successful Clerk authentication and center-entry bootstrap. It uses the returned `centerId` in product paths and the per-tab tenant-context handle from `sessionStorage`; it does not introduce an operator or center selector.
- **DIVE-WEB-REQ-002:** Every catalog request is limited to the current center, sends the Clerk bearer and `X-Tenant-Context`, and never sends `tenantId`, `centerKey`, or `centerRef` as product authorization.
- **DIVE-WEB-REQ-003:** The activity surface lists the current center's activities using the approved page contract, exposes an optional status filter, preserves stable API ordering, and offers only next/previous navigation derived from `hasNext`; it does not invent a total count.
- **DIVE-WEB-REQ-004:** The create-activity form sends only localized `name`, optional localized `description`, and optional positive `defaultCapacity`. It never sends tenant, center, status, remaining seats, or persistence-only fields.
- **DIVE-WEB-REQ-005:** The UI presents `Draft`, `Published`, and `Disabled` using the server state and offers publish or disable only where the approved lifecycle permits. It treats repeated command success as success and does not emulate transitions locally.
- **DIVE-WEB-REQ-006:** An activity detail surface lists only that activity's slots for the current center, supports the approved optional state/date filters and page contract, preserves API order, and does not calculate or display remaining seats from the catalog DTO.
- **DIVE-WEB-REQ-007:** The create-slot form is available only for a `Published` activity and submits only `startsAt`, positive `durationMinutes`, and positive `capacity`. It never sends end time, remaining seats, tenant, center, or status.
- **DIVE-WEB-REQ-008:** Slot instants are presented using the offset returned by the catalog API. The UI does not reinterpret returned instants in the browser's local time zone. Creating a slot from center-local date/time remains blocked until the center IANA time-zone contract is available to the browser.
- **DIVE-WEB-REQ-009:** Loading keeps the current surface identifiable; empty results distinguish “no activities/slots” from an applied filter with no matches; a failed mutation retains user input when safe and exposes a retry without duplicating a successful command.
- **DIVE-WEB-REQ-010:** The UI maps the approved `application/problem+json` outcomes without disclosure: field errors are associated with controls when possible; `409` reports that the state changed or the transition is unavailable; `403` reports insufficient permission; the approved non-disclosing `404` does not reveal another center; authentication/context loss returns to the approved login/bootstrap journey.
- **DIVE-WEB-REQ-011:** Catalog pages and dialogs are keyboard operable, expose programmatic labels and validation relationships, move focus predictably after navigation and dialogs, announce asynchronous results without relying only on color, and remain usable from 320 CSS px without horizontal page scrolling.
- **DIVE-WEB-REQ-012:** Evidence covers user-visible behavior at component and request-boundary level: bootstrap gating, list/filter/page behavior, create forms, lifecycle commands, error mapping, focus/dialog behavior, and center-scope request construction. Until product e2e exists, the PR records reproducible manual validation with synthetic data and does not claim e2e coverage.

### Derivations

- **DIVE-WEB-REQ-001..002:** ADR-DIVE-008 requires direct center entry and per-tab context; therefore the web slice must consume that context rather than introduce a second selection or authorization model.
- **DIVE-WEB-REQ-003..007:** the browser must represent the approved API and state machine without widening fields, states, counts, or selectors.
- **DIVE-WEB-REQ-008:** the API renders slot instants with the center offset, but constructing a new instant from center-local input requires the center's IANA zone to handle daylight-saving transitions correctly.
- **DIVE-WEB-REQ-010:** preserving the server's non-disclosing status contract prevents UI copy from becoming an enumeration oracle.
- **DIVE-WEB-REQ-012:** the repository requires tests and an honest Validation record; lack of product e2e cannot be converted into an e2e claim.

## Proposed interaction design

These decisions are recommended, not normative.

| Proposal ID | Proposal | Rationale | Source / context | Decision owner | Status |
|---|---|---|---|---|---|
| `DIVE-WEB-PROP-001` | Use `/dashboard/catalog` for the activity list, `/dashboard/catalog/activities/new` for creation, and `/dashboard/catalog/activities/:activityId` for activity details and slots. | Keeps the first slice small and maps navigation to the activity aggregate without exposing tenant IDs. | Current Next.js App Router in `apps/web/src/app`; `DIVE-BOOK-REQ-050` | Product / Web | Pending |
| `DIVE-WEB-PROP-002` | On wide screens use a semantic activity table; below the table's usable width use a stacked list preserving the same fields and actions. | Avoids horizontal page scrolling while retaining scanability. | US-08 dashboard use; `DIVE-WEB-REQ-011` proposal | Product / Design | Pending |
| `DIVE-WEB-PROP-003` | Show both `es` and `en` name inputs in one create form, with optional descriptions and default capacity. After `201`, navigate to the activity detail. | Makes the publish prerequisite visible and avoids a hidden locale fallback. | `DIVE-BOOK-REQ-051`, `053` | Product | Pending |
| `DIVE-WEB-PROP-004` | Require confirmation for disable, close, and cancel; require an explicit acknowledgement for slot cancel because it is terminal. Publish may use a lightweight confirmation that states both translations will become public. | Makes irreversible or availability-affecting commands deliberate without changing their API. | Booking lifecycle and `DIVE-BOOK-REQ-054..055` | Product / Design | Pending |
| `DIVE-WEB-PROP-005` | Keep filters and page in URL search parameters; changing a filter returns to page 1. | Supports refresh/back navigation without global client state and matches page pagination. | ADR-DIVE-014; current Next.js stack | Product / Web | Pending |
| `DIVE-WEB-PROP-006` | Use inline field errors for `422`, a page-level status region for list failures, and a dialog-local error for failed confirmed commands; success messages use an accessible status region. | Keeps errors close to their recovery action and supports assistive technology. | `DIVE-BOOK-REQ-056`; `DIVE-WEB-REQ-011` proposal | Product / Accessibility | Pending |

## Open questions

| Question ID | Question | Why it matters | Decision owner | Blocking |
|---|---|---|---|---|
| `DIVE-WEB-Q-001` | What approved HTTP operation edits localized name, description, or default capacity on a Draft activity? | The API permits an incomplete Draft and requires `name.es` + `name.en` to publish, but defines create/publish/disable only. Without edit, an incomplete Draft cannot be completed. | Product / API / Architecture | Yes |
| `DIVE-WEB-Q-002` | Which trusted response exposes the center IANA time zone to `apps/web` when creating a slot from local date/time? | `startsAt` requires an explicit RFC3339 offset; browser local time may differ from the center and daylight-saving transitions require the center zone. Bootstrap currently documents only `centerId`. | Product / API / Architecture | Yes |
| `DIVE-WEB-Q-003` | Which trusted response exposes current catalog capabilities to the UI, or should the first slice render allowed lifecycle actions and rely on non-disclosing server authorization? | The server owns permissions, but the frontend needs an approved way to avoid presenting actions the actor cannot perform. Client role inference is forbidden. | Product / Security / API | Yes |
| `DIVE-WEB-Q-004` | Is the internal dashboard localized in both Spanish and English in this slice, and what selects its locale? | Booking requires `es`/`en` for public flows, but no approved internal-dashboard locale contract was found. | Product | No for API integration; Yes for final copy |
| `DIVE-WEB-Q-005` | Are the proposed routes and responsive table/stacked-list pattern accepted? | They determine navigation, deep links, component tests, and manual acceptance steps. | Product / Design | Yes |

## States and invariants

The UI does not create its own domain states. It renders the activity and slot states returned by `SPEC-DIVE-BOOKING-001` and asks the server to perform approved transitions.

Client cache state, optimistic state, disabled buttons, and navigation state never count as successful domain mutation. After a successful command, the UI revalidates the affected server representation. After an ambiguous network failure, it reloads server state before offering another action.

## Edge cases and acceptance scenarios

1. Given a successful center bootstrap, when the catalog opens, then every request uses only the returned `centerId` plus the authenticated tenant context.
2. Given no activities, when page 1 loads, then the user sees a true empty state and the create action only if the approved capability contract allows it.
3. Given an activity filter with no matches, then the UI distinguishes filtered emptiness from a center with no activities.
4. Given `hasNext = false`, then no next-page action is offered and no total count is inferred.
5. Given an incomplete Draft, then publish remains unavailable or returns the approved `422`; the UI never fabricates missing translations.
6. Given a Published activity, when a valid slot is created, then the UI submits an explicit RFC3339 instant using the approved center-zone contract and refreshes the slot list.
7. Given a resource outside the current center, then the UI displays the same non-disclosing not-found outcome as an unknown resource.
8. Given a repeated publish/disable/close/cancel command that returns `204`, then the UI treats it as success and does not duplicate effects.
9. Given an ambiguous mutation timeout, then the UI reloads the resource before allowing a retry.
10. Given keyboard-only input at 320 CSS px, then all fields, filters, pagination, dialogs, and recovery actions remain operable and perceivable.

Scenarios that depend on `DIVE-WEB-Q-001..003` cannot become acceptance criteria until those questions are approved.

## API, events, and data

No new API, event, or persistence contract is approved here. The frontend consumes the center-entry and catalog interfaces owned by ADR-DIVE-008 and `SPEC-DIVE-BOOKING-001`.

Client-side types must be derived from or checked against the approved DTO. The browser must not add tenant IDs, center-entry selectors, lifecycle states, totals, remaining seats, or permission claims to the contract.

## Security, privacy, isolation, and operations

- Authorization stays server-side and is re-evaluated on each request.
- The UI must not infer permissions from role labels or persist authoritative permission decisions.
- `Authorization` and `X-Tenant-Context` values must not be logged, rendered, placed in URLs, or included in analytics.
- `sessionStorage` remains the approved browser persistence for tenant context; `localStorage` is forbidden for it.
- No real personal data is needed for US-08 validation.
- Error copy must preserve non-disclosure across center and tenant boundaries.

## Performance and observability

No numeric performance budget is introduced. The implementation should preserve page pagination, avoid an unapproved total-count request, and measure observed Next.js route/render/network behavior in the implementation PR rather than claim a target.

Telemetry must not include bearer values, tenant-context handles, or unnecessary identifiers. Analytics naming and provider selection are outside this SPEC.

## Errors, concurrency, and idempotency

The UI consumes the status and `application/problem+json` contract in `DIVE-BOOK-REQ-054..057`. It does not redefine idempotency or concurrency.

Optimistic domain transitions are not proposed for the first slice. Commands wait for the server result, then revalidate. This is a UI recommendation pending approval and does not change the API's idempotent command semantics.

## Migration, rollout, and rollback

Implementation is a reversible `apps/web` vertical behind the existing authenticated center journey. No database migration is created by this SPEC.

Rollback removes the catalog routes/components and navigation entry without changing the already implemented API or persisted catalog data. A later implementation PR must document any temporary feature exposure mechanism; this SPEC does not invent a flag or default rollout percentage.

## Tests and expected evidence

After approval and implementation:

- component tests for list, empty, filtered-empty, pagination, forms, dialogs, focus restoration, and status announcements;
- request-boundary tests proving exact path/header/body construction and absence of tenant/entry selectors;
- tests for `400`, `401`, `403`, non-disclosing `404`, `409`, and field-level `422` presentation;
- tests that no total count or remaining-seat value is inferred;
- tests for ambiguous mutation recovery by server revalidation;
- manual validation at 320 px and a representative desktop viewport with keyboard-only navigation and synthetic data;
- honest PR Validation noting that product Playwright e2e does not yet exist unless it is added and run in the same change.

## Traceability

- Product story: US-08 (Notion index only; non-normative).
- Domain/API authority: `SPEC-DIVE-BOOKING-001` `DIVE-BOOK-REQ-001..006`, `009..011`, `017..020`, `029`, `049..057`.
- IAM authority: `SPEC-DIVE-IAM-001` `DIVE-IAM-REQ-003`, `010..014`, `023..025`, `029..032`.
- Decisions: ADR-DIVE-008 and ADR-DIVE-014.
- Coverage map: `specs/traceability/TRACE-DIVE-MVP-001.md`.
- Intended implementation: `apps/web` after approval and closure of blocking questions.
