# ADR-DIVE-014 — Center catalog lists, response DTO, and persistence naming

- **Status:** Draft
- **Version:** 0.2
- **Date:** 2026-09-27
- **Deciders:** Product / Architecture / Data / Security
- **Affected IDs:** `DIVE-BOOK-REQ-001..006`, `009..011`, `017..020`, `029`, `049..057`; `DIVE-IAM-REQ-024`; ADR-DIVE-001; ADR-DIVE-008

## Provenance

| Decision | Provenance | Exact source | Approval / status |
|---|---|---|---|
| Dashboard catalog is scoped to one authorized center; path identifiers are selectors, never authorization | `Documented` | `SPEC-DIVE-BOOKING-001` `DIVE-BOOK-REQ-001..006`, `050`; ADR-DIVE-008 | Existing normative constraint |
| Activity and slot request fields, lifecycle, HTTP status/error contract, filters, and stable ordering | `Documented` | `SPEC-DIVE-BOOKING-001` `DIVE-BOOK-REQ-009..011`, `017..020`, `029`, `049..057` | Existing normative constraint |
| Activities are unpaginated; slots require a date range and return at most 50 results; cursor pagination is deferred | `Proposed` | Product-owner confirmation by Borja for PR #35 on 2026-09-27 | Approved for incorporation into `SPEC-DIVE-BOOKING-001` v1.2; ADR remains Draft |
| Minimal activity/slot representations | `Proposed` | Product-owner confirmation by Borja for PR #35 on 2026-09-27 | Approved for incorporation into the booking contract; ADR remains Draft |
| `booking_app.activities` / `booking_app.slots`, physical columns, constraints, and catalog indexes | `Proposed` | Existing `iam_app` PostgreSQL/Drizzle conventions; product-owner confirmation by Borja for PR #35 on 2026-09-27 | Approved for incorporation into the booking contract; ADR remains Draft |

## Context

US-08 needs a small center catalog. A typical center is expected to manage approximately 15–20 activities, so cursor infrastructure for the activity list would add signing, rotation, validation, and client state without a demonstrated volume need. Slots can grow over time, but the center dashboard queries them for a bounded working period.

This ADR closes the walking-skeleton contract with the simplest bounded behavior. It does not change catalog lifecycle, permissions, routes, capacity semantics, public availability, booking creation, or onboarding.

## Decision

### Activity list

`GET /v1/centers/:centerId/activities` returns all activities of the authorized center without pagination. It may be filtered by `status` and is ordered by `created_at DESC`, then `id DESC`.

The response is:

```json
{
  "items": []
}
```

No `cursor`, `nextCursor`, `limit`, tenant selector, or multi-center selector is accepted or returned.

### Slot list

`GET /v1/centers/:centerId/activities/:activityId/slots` requires a date range. It may also be filtered by `status`, is ordered by `starts_at ASC`, then `id ASC`, and returns at most 50 matching slots.

The response is:

```json
{
  "items": []
}
```

If the requested range matches more than 50 slots, the server returns the existing `422 validation_error`; the client narrows the range. The response is never silently truncated.

There is no catalog cursor in the walking skeleton. A future cursor requires demonstrated need and a separately approved contract change. Tenant, center, activity, permissions, and filters are revalidated on every request regardless of future pagination choices.

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

- The activity endpoint matches the expected catalog size without cursor infrastructure.
- Slot queries are bounded by business input and an explicit result limit without silent truncation.
- The first implementation does not need cursor signing, secret rotation, cursor versioning, or client continuation state.
- Composite relations enforce tenant and center consistency below the application layer.
- DTOs remain minimal and exclude authorization context and derived remaining capacity.

### Costs and risks

- A center with an unexpectedly large activity catalog receives the full activity collection.
- A broad slot range may require one or more narrower requests.
- Cursor pagination, if later needed, requires a new approved contract rather than an implementation-only change.
- JSONB localization requires application validation and database checks selected by the implementation.
- Status-leading indexes may not fit every future query distribution; observed plans may justify later indexes.

## Alternatives considered

### Signed keyset cursor for both lists

Rejected for the walking skeleton. Expected activity volume does not justify signing, rotation, versioning, and client continuation complexity. The slot endpoint already has a natural date-range boundary.

### Cursor only for slots

Deferred. The required date range plus 50-result maximum is simpler for the first vertical. Reconsider only with demonstrated volume or usability evidence.

### Offset pagination

Rejected. It adds pagination state without a current need and drifts under concurrent changes.

### Silent truncation at 50 slots

Rejected because callers could mistake an incomplete range for the complete result.

### Separate localized-text rows

Not selected for the first vertical. The approved languages are bounded to `es` and `en`; JSONB keeps the catalog slice reversible without another relation.

### Global UUID foreign keys without tenant and center columns

Rejected because they would not make cross-tenant and cross-center relationships structurally impossible.

## Validation and expected evidence

This documentation PR provides no implementation evidence.

An implementation PR must link `DIVE-BOOK-REQ-049..057` and include:

- activity-list contract tests proving no pagination and center/status scoping;
- slot-list tests for required date range, stable ordering, status filter, 50-result boundary, and non-truncating `422` behavior;
- activity and slot response contract tests, including omitted optional fields;
- migration tests for keys, foreign keys, positive checks, status checks, and index names;
- center-scope and cross-tenant negative tests;
- PostgreSQL query-plan evidence only if additional indexes are proposed;
- honest `Validation`, rollback, and known-gap sections.

`SPIKE-DIVE-001` remains required before declaring concurrent capacity behavior Done. It does not block creating the catalog tables and endpoints defined by US-08.

## Open questions

No US-08 catalog-contract decision remains open for the walking skeleton.

Cursor pagination is deferred. If demonstrated volume later requires it, its scope, cursor format, validation, and compatibility become a new proposed contract change.

## Implementation authority

`SPEC-DIVE-BOOKING-001` v1.2 is the normative implementation authority after merge. This ADR remains Draft as a decision record and is not independently promoted by this PR.
