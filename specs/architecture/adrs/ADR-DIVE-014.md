# ADR-DIVE-014 — Center catalog lists, response DTO, and persistence naming

- **Status:** Draft
- **Version:** 0.4
- **Date:** 2026-09-27
- **Deciders:** Product / Architecture / Data / Security
- **Affected IDs:** `DIVE-BOOK-REQ-001..006`, `009..011`, `017..020`, `029`, `049..057`; `DIVE-IAM-REQ-024`, `029..032`; ADR-DIVE-001; ADR-DIVE-008; ADR-DIVE-009

## Provenance

| Decision | Provenance | Exact source | Approval / status |
|---|---|---|---|
| Dashboard catalog is scoped to one authorized center; path identifiers are selectors, never authorization | `Documented` | `SPEC-DIVE-BOOKING-001` `DIVE-BOOK-REQ-001..006`, `050`; ADR-DIVE-008 | Existing normative constraint |
| Activity and slot request fields, lifecycle, HTTP status/error contract, filters, and stable ordering | `Documented` | `SPEC-DIVE-BOOKING-001` `DIVE-BOOK-REQ-009..011`, `017..020`, `029`, `049..057` | Existing normative constraint |
| Activities and slots use one-based page pagination; cursor pagination is deferred | `Proposed` | Product-owner confirmation by Borja for PR #35 on 2026-09-27 | Approved for incorporation into `SPEC-DIVE-BOOKING-001` v1.3; ADR remains Draft |
| Minimal activity/slot representations | `Proposed` | Product-owner confirmation by Borja for PR #35 on 2026-09-27 | Approved for incorporation into the booking contract; ADR remains Draft |
| `booking_app.activities` / `booking_app.slots`, physical columns, constraints, and catalog indexes | `Proposed` | Existing `iam_app` PostgreSQL/Drizzle conventions; product-owner confirmation by Borja for PR #35 on 2026-09-27 | Approved for incorporation into the booking contract; ADR remains Draft |
| RFC3339 instants are persisted as `timestamptz`; slot responses render with the center's confirmed IANA time zone; missing or invalid center time zones fail closed | `Proposed` | Product-owner confirmation by Borja for PR #35 on 2026-09-27; `DIVE-BOOK-REQ-049`; `DIVE-ONB-REQ-022` | Approved for incorporation into the booking contract; ADR remains Draft |
| The dashboard client consumes the catalog response DTOs and lifecycle states without creating a second client-side domain model | `Documented` | `SPEC-DIVE-BOOKING-001` `DIVE-BOOK-REQ-009..011`, `017..020`, `049..057`; `ADR-DIVE-009` § State ownership | Existing normative constraint |
| Interactive catalog reads and mutations use TanStack Query; pagination and filters are URL-owned; form drafts and dialogs remain local React state | `Documented` | `ADR-DIVE-009` § State ownership | Existing implementation boundary |
| Catalog query keys may contain center/resource selectors and filters, but never the Clerk token or raw `X-Tenant-Context` handle | `Documented` | `ADR-DIVE-009` § Cache and tenant boundaries; `ADR-DIVE-008` § Credential representation and transport | Existing security constraint |
| The client invalidates or replaces catalog cache after a mutation, center-context change, explicit revocation, or logout; it does not treat cached data as authorization | `Derived` | `ADR-DIVE-009` § Cache and tenant boundaries; `ADR-DIVE-008` § Lifetime, renewal, and revocation | Draft implementation handoff; no status promotion |
| The catalog feature is split into an activities list/form and an activity-scoped slots list/form, with state-valid commands delegated to the existing API boundary | `Proposed` | `SPEC-DIVE-BOOKING-001` `DIVE-BOOK-REQ-049..057`; current `apps/web` dashboard boundary | Draft implementation handoff; explicit review required |

## Context

US-08 needs predictable lists for activities and slots. A typical center is expected to manage approximately 15–20 activities, while slots can grow over time. Simple page pagination gives both endpoints one uniform contract without cursor signing, rotation, versioning, or a special “range too broad” failure.

This ADR closes the walking-skeleton contract with limit/offset pagination. It does not change catalog lifecycle, permissions, routes, capacity semantics, public availability, booking creation, or onboarding.

### Dashboard client implementation handoff

This section is an implementation SDD for the authenticated US-08 client. It records the boundary between the existing dashboard context and the catalog feature; it does not add a new booking capability or replace the SPEC.

#### Scope and ownership

- `[Documented]` The implementation belongs in `apps/web` and uses the Next.js dashboard, the authenticated Clerk session, and the opaque tenant context defined by `ADR-DIVE-008` and `ADR-DIVE-009`.
- `[Documented]` The client implements the center-scoped catalog surface covered by `DIVE-BOOK-REQ-049..057`: activities, activity-scoped slots, and their catalog commands. Public booking, widget, payment, and operational-trip workflows remain outside this slice.
- `[Derived]` The feature should be isolated from the current tenant-context orchestration behind a small catalog API and feature boundary. The feature must receive the server-authorized `centerId` and must not create a second tenant or authorization model.
- `[Proposed]` The first web slice should expose two feature surfaces: an activities list with activity creation and lifecycle actions, and an activity detail surface with slot listing, scheduling, and slot lifecycle actions. The exact route names remain an implementation choice and are not part of this ADR.

#### Data and request flow

- `[Documented]` Catalog reads and commands use the routes and DTOs in `SPEC-DIVE-BOOKING-001` `DIVE-BOOK-REQ-050..057`. Protected requests carry the Clerk bearer token and `X-Tenant-Context`; `centerId`, `activityId`, and `slotId` remain resource selectors only.
- `[Documented]` Client request bodies are limited to the fields permitted by `DIVE-BOOK-REQ-051..052`; the client never sends tenant identifiers, an alternate center, lifecycle status, derived end time, or remaining seats.
- `[Derived]` The catalog API boundary should expose typed operations for activity and slot reads, creates, and status commands, while preserving the server's `application/problem+json` `code` and `detail` alongside the HTTP status.
- `[Derived]` Successful commands should invalidate the affected list query and refetch server state. The first slice should not use optimistic catalog status or capacity values because the server remains authoritative and successful commands return `204`.
- `[Documented]` Pagination and filters are navigation state under `ADR-DIVE-009`; activity and slot form drafts, validation display, and dialogs are local feature state.

#### UI state and lifecycle mapping

- `[Documented]` The UI represents the activity states `Draft`, `Published`, and `Disabled`, and the slot states `Available`, `Full`, `Closed`, and `Cancelled` from `SPEC-DIVE-BOOKING-001`.
- `[Derived]` An activity form must allow the Draft shape accepted by the API, while the publish action must surface the server validation failure when the required localized name is incomplete. The client must not add translation fallback.
- `[Documented]` Slot creation submits an explicit-offset or `Z` RFC3339 instant, positive duration, and positive capacity. End time and remaining sellable seats are display or server-derived values, not request fields.
- `[Proposed]` Each list must have explicit loading, empty, error, and mutation-pending states. `401` is delegated to the dashboard session recovery; `403`, `404`, `409`, and `422` remain feature-level feedback using the problem code without exposing cross-center data.
- `[Proposed]` A stale page after a successful mutation should return to page 1 when the affected list is invalidated. The UI must not promise exact totals because the contract exposes `hasNext`, not a count.

#### Tenant and cache boundary

- `[Documented]` Query keys may include the authorized center/resource selectors, page, page size, status, and date filters, but must never include the Clerk token or raw tenant-context handle (`ADR-DIVE-009`, `ADR-DIVE-008`).
- `[Derived]` The catalog cache must be removed or replaced when the tenant context changes, is explicitly revoked, or the user logs out. The existing dashboard context transition is the owner of that invalidation boundary.
- `[Documented]` The client must not infer access from a center identifier, display name, activity identifier, or cached role. The API remains the authority for center scope and permission checks on every request.

#### Implementation sequence

1. `[Proposed]` Extract or expose the existing authenticated dashboard API/context boundary without changing its `sessionStorage` or header contract.
2. `[Proposed]` Add typed catalog request/response models and adapter tests for headers, allowed bodies, pagination, problem details, `204`, and abort handling.
3. `[Proposed]` Add the activities surface, then the activity-scoped slots surface, with query invalidation after each command.
4. `[Proposed]` Add focused component tests for lifecycle actions, pagination/filter state, validation, non-disclosing errors, and context reset.
5. `[Proposed]` Run manual validation with synthetic tenant/center data before any real-data pilot; link the implementation PR to the API contract tests and this ADR.

#### Non-goals and blockers

- `[Documented]` This handoff does not define activity editing, public availability, booking creation, calendar management, or a client-side permission cache.
- `[Open question]` The current API has no activity-edit command. Product must decide whether Draft completion is intentionally create-only for this increment or whether an edit/update contract is required before the UI supports incomplete Drafts.
- `[Open question]` The current center response does not expose the confirmed IANA time zone, while slot responses are rendered with that zone. Product/API must decide how a center-local scheduling form obtains the zone; the client must not silently use the browser zone as a center default.
- `[Open question]` `DIVE-IAM-REQ-032` and `POST /v1/me/center-entry-contexts` are the approved direct-center bootstrap contract, but the current API/web implementation does not expose that flow. The catalog feature must either depend on that bootstrap slice or explicitly document a temporary synthetic/test entry; it must not infer tenant context from an arbitrary `centerId`.

## Decision

### Pagination contract

Both catalog list endpoints accept:

```text
?page=1&pageSize=20
```

- `page` is a one-based positive integer and defaults to `1`.
- `pageSize` is a positive integer, defaults to `20`, and has a maximum of `50`.
- Invalid values return the existing `422 validation_error`.
- The implementation uses `LIMIT` / `OFFSET` and reads `pageSize + 1` rows to derive `hasNext`; it does not require `COUNT(*)`.

Both endpoints return:

```json
{
  "items": [],
  "page": 1,
  "pageSize": 20,
  "hasNext": false
}
```

`GET /v1/centers/:centerId/activities` may be filtered by `status` and is ordered by `created_at DESC`, then `id DESC`.

`GET /v1/centers/:centerId/activities/:activityId/slots` may be filtered by optional date range and `status` and is ordered by `starts_at ASC`, then `id ASC`. A calendar normally supplies a date range, but the HTTP contract does not require one.

There is no catalog cursor in the walking skeleton. A future cursor requires demonstrated need and a separately approved contract change. Tenant, center, activity, permissions, and filters are revalidated on every request.

Slot input accepts an RFC3339 instant with an explicit offset or `Z`. The instant is persisted in `starts_at` as `timestamptz`; the center's `iam_app.centers.time_zone` is used only to render the response offset. The implementation does not reinterpret a wall-clock value or persist a slot-specific time zone. A missing or invalid center IANA time zone returns `422` rather than silently defaulting.

The accepted limitation is that concurrent inserts or updates can cause an item to repeat or move between offset pages. This does not alter booking capacity, authorization, or state invariants. The dashboard may refresh and restart from page 1.

### Response DTO

Create responses return the same single-resource representation used inside list `items`.

Activity representation:

```json
{
  "id": "uuid",
  "status": "Draft | Published | Disabled",
  "name": { "es": "string", "en": "string" },
  "description": { "es": "string", "en": "string" },
  "defaultCapacity": 8,
  "createdAt": "RFC3339 instant"
}
```

`description` and `defaultCapacity` are omitted when unset. Draft activities may contain incomplete localized `name` / `description` objects as allowed by `DIVE-BOOK-REQ-051` and `053`; no translation fallback is introduced.

Slot representation:

```json
{
  "id": "uuid",
  "activityId": "uuid",
  "status": "Available | Full | Closed | Cancelled",
  "startsAt": "RFC3339 instant",
  "durationMinutes": 60,
  "capacity": 8,
  "createdAt": "RFC3339 instant"
}
```

The DTO never returns `tenantId`, `centerId`, remaining seats, or persistence-only values. Remaining sellable seats stay derived and are not part of this catalog-management DTO.

### PostgreSQL names

Use PostgreSQL schema `booking_app`.

`booking_app.activities` uses:

- `id` uuid;
- `tenant_id` uuid;
- `center_id` uuid;
- `status` text;
- `name` jsonb;
- `description` jsonb nullable;
- `default_capacity` integer nullable;
- `created_at` timestamptz.

`booking_app.slots` uses:

- `id` uuid;
- `tenant_id` uuid;
- `center_id` uuid;
- `activity_id` uuid;
- `status` text;
- `starts_at` timestamptz;
- `duration_minutes` integer;
- `capacity` integer;
- `created_at` timestamptz.

Both tables use a tenant-qualified primary key on `(tenant_id, id)`. Activities additionally expose a unique key on `(tenant_id, center_id, id)`. Slots reference activities through `(tenant_id, center_id, activity_id)` so a cross-tenant or cross-center relation is structurally impossible. Center relations use the existing tenant-qualified center key. Positive numeric constraints apply to non-null `default_capacity`, `duration_minutes`, and `capacity`; status checks admit only the states defined by the booking SPEC.

Use these explicit index names and orders:

```text
activities_center_status_created_id_idx
  (tenant_id, center_id, status, created_at DESC, id DESC)

slots_activity_status_starts_id_idx
  (tenant_id, center_id, activity_id, status, starts_at ASC, id ASC)
```

The migration may add only supporting indexes required by PostgreSQL for the named primary, unique, and foreign-key constraints. Additional query indexes require observed plans or a separately justified change.

RLS and transaction context remain governed by the multitenancy baseline and ADR-DIVE-001. Physical names do not weaken application authorization, center scoping, or non-disclosure.

## Consequences

### Positive

- Activities and slots share one simple HTTP and frontend contract.
- The client can browse any number of slots without a range-overflow error.
- The first implementation does not need cursor signing, secret rotation, cursor versioning, or `COUNT(*)`.
- Composite relations enforce tenant and center consistency below the application layer.
- DTOs remain minimal and exclude authorization context and derived remaining capacity.

### Costs and risks

- Concurrent catalog changes can repeat or move an item between offset pages.
- Very deep pages are less efficient than keyset pagination; that scale is not demonstrated for the MVP.
- Cursor pagination, if later needed, requires a new approved contract rather than an implementation-only change.
- JSONB localization requires application validation and database checks selected by the implementation.
- Status-leading indexes may not fit every future query distribution; observed plans may justify later indexes.

## Alternatives considered

### Signed keyset cursor

Deferred. Current volume and dashboard use do not justify signing, rotation, versioning, and client continuation complexity.

### Date-range-only slot list with a 50-result overflow error

Rejected after Product review. It creates a special failure path and forces clients to subdivide ranges instead of traversing normal pages.

### Unpaginated activity list

Rejected in favor of one uniform list contract. Although the expected catalog is small, page pagination is inexpensive and avoids a special-case response shape.

### Total count

Not selected. Fetching one extra row provides `hasNext` without an additional count query. A future UI that demonstrates a need for exact totals may propose it separately.

### Separate localized-text rows

Not selected for the first vertical. The approved languages are bounded to `es` and `en`; JSONB keeps the catalog slice reversible without another relation.

### Global UUID foreign keys without tenant and center columns

Rejected because they would not make cross-tenant and cross-center relationships structurally impossible.

## Validation and expected evidence

This documentation PR provides no implementation evidence.

An implementation PR must link `DIVE-BOOK-REQ-049..057` and include:

- shared pagination contract tests for defaults, bounds, `hasNext`, and invalid-value `422` behavior;
- activity-list tests for stable ordering and center/status scoping;
- slot-list tests for stable ordering plus optional date-range and status filters;
- activity and slot response contract tests, including omitted optional fields;
- migration tests for keys, foreign keys, positive checks, status checks, and index names;
- center-scope and cross-tenant negative tests;
- PostgreSQL query-plan evidence only if additional indexes are proposed;
- honest `Validation`, rollback, and known-gap sections.

`SPIKE-DIVE-001` remains required before declaring concurrent capacity behavior Done. It does not block creating the catalog tables and endpoints defined by US-08.

## Open questions

No US-08 catalog-contract decision remains open for the walking skeleton.

Cursor pagination is deferred. If demonstrated volume, deep-page cost, or offset drift later requires it, its scope, cursor format, validation, and compatibility become a new proposed contract change.

## Implementation authority

`SPEC-DIVE-BOOKING-001` v1.3 is the normative implementation authority after merge. This ADR remains Draft as a decision record and is not independently promoted by this PR.
