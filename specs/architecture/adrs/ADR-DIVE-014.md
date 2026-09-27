# ADR-DIVE-014 — Center catalog cursor, response DTO, and persistence naming

- **Status:** Draft
- **Version:** 0.1
- **Date:** 2026-09-27
- **Deciders:** Product / Architecture / Data / Security
- **Affected IDs:** `DIVE-BOOK-REQ-001..006`, `009..011`, `017..020`, `029`, `049..057`; `DIVE-IAM-REQ-024`; ADR-DIVE-001; ADR-DIVE-008

## Provenance

| Decision | Provenance | Exact source | Approval / status |
|---|---|---|---|
| Dashboard catalog is scoped to one authorized center; path identifiers are selectors, never authorization | `Documented` | `SPEC-DIVE-BOOKING-001` `DIVE-BOOK-REQ-001..006`, `050`; ADR-DIVE-008 | Existing normative constraint |
| Activity and slot request fields, lifecycle, HTTP status/error contract, stable ordering, filters, cursor pagination, and maximum page size 50 | `Documented` | `SPEC-DIVE-BOOKING-001` `DIVE-BOOK-REQ-009..011`, `017..020`, `029`, `049..057` | Existing normative constraint |
| Versioned authenticated cursor with no TTL, bound to endpoint and normalized filters | `Proposed` | US-08 closure requested by Borja on 2026-09-27; closes `SPEC-DIVE-BOOKING-001` Open question 1 | Draft; pending explicit approval |
| Minimal activity/slot representations and page envelope | `Proposed` | US-08 closure requested by Borja on 2026-09-27; closes `SPEC-DIVE-BOOKING-001` Open question 2 | Draft; pending explicit approval |
| `booking_app.activities` / `booking_app.slots`, physical columns, constraints, and catalog indexes | `Proposed` | Existing `iam_app` PostgreSQL/Drizzle conventions plus US-08 closure requested by Borja on 2026-09-27; closes `SPEC-DIVE-BOOKING-001` Open question 3 | Draft; pending explicit approval |

## Context

`SPEC-DIVE-BOOKING-001` authorizes the US-08 center-scoped catalog behavior but deliberately leaves three implementation-contract decisions open: cursor encoding and integrity, response DTO fields, and physical activity/slot names. Implementing those decisions without an approved artifact would create silent defaults.

This ADR proposes the minimum closure needed for the first reversible catalog vertical. It does not change catalog lifecycle, permissions, routes, status codes, capacity semantics, public availability, booking creation, or onboarding.

## Proposed decision

### Cursor contract

Catalog lists use forward-only keyset cursors.

The wire value is an opaque two-part base64url value:

```text
base64url(canonical-json-payload).base64url(hmac-sha256(payload))
```

The payload contains only:

- `v`: cursor schema version, initially `1`;
- `resource`: `activities` or `slots`;
- `position`: the last emitted stable ordering tuple;
- `filters`: a digest of the normalized filters that produced the page.

Activity position is `createdAt` plus `id`, both descending. Slot position is `startsAt` plus `id`, both ascending. The server signs and verifies the payload with an application secret; the cursor is authenticated, not encrypted, and therefore contains no tenant identifier, personal data, authorization claim, or secret.

A cursor is valid only for the same endpoint resource, authorized center, activity scope when applicable, and normalized filters. Authorization and center scope are re-evaluated on every request and never come from the cursor. A malformed, tampered, unsupported-version, or mismatched cursor returns the existing `422` semantic validation response without revealing another scope.

Catalog cursors have no time-based expiry. Key rotation may invalidate outstanding cursors; clients restart from the first page. This cursor is a continuation position, not a snapshot guarantee: concurrent inserts or state changes may alter later pages, while the stable keyset order prevents offset drift.

### Response DTO

List responses use:

```json
{
  "items": [],
  "nextCursor": null
}
```

`nextCursor` is a string only when another page exists; otherwise it is `null`. Create responses return the same single-resource representation used inside `items`.

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

`description` and `defaultCapacity` are omitted when unset. Draft activities may contain incomplete localized `name` / `description` objects as already allowed by `DIVE-BOOK-REQ-051` and `053`; this ADR adds no translation fallback.

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

The DTO never returns `tenantId`, `centerId`, remaining seats, internal index values, or cursor payload fields. Remaining sellable seats stay derived and are not part of this catalog-management DTO.

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

Both tables use a tenant-qualified primary key on `(tenant_id, id)`. Activities additionally expose a unique key on `(tenant_id, center_id, id)`. Slots reference activities through `(tenant_id, center_id, activity_id)` so a cross-tenant or cross-center relation is structurally impossible. Center relations use the existing tenant-qualified center key. Positive numeric constraints apply to non-null `default_capacity`, `duration_minutes`, and `capacity`; status checks admit only the states already defined by the booking SPEC.

Use these explicit index names and orders:

```text
activities_center_status_created_id_idx
  (tenant_id, center_id, status, created_at DESC, id DESC)

slots_activity_status_starts_id_idx
  (tenant_id, center_id, activity_id, status, starts_at ASC, id ASC)
```

The implementation migration may add only the supporting indexes required by PostgreSQL for the named primary, unique, and foreign-key constraints. Additional query indexes require observed plans or a separately justified change; they are not silently added by this ADR.

RLS and transaction context remain governed by the multitenancy baseline and ADR-DIVE-001. This ADR selects physical names but does not weaken application authorization, center scoping, or non-disclosure.

## Consequences

### Positive

- The first catalog implementation no longer needs to invent wire fields, cursor integrity, or persistence names.
- Keyset pagination matches the approved stable order and avoids offset-based page drift.
- Composite relations enforce tenant and center consistency below the application layer.
- DTOs remain minimal and exclude authorization context and derived remaining capacity.

### Costs and risks

- Cursor signing requires secret management and makes key rotation observable as cursor invalidation.
- No cursor TTL means the server must retain support for a cursor version until it intentionally removes that version.
- JSONB localization requires validation in the application and database checks chosen by the implementation.
- Status-leading indexes may not fit every future query distribution; observed plans may justify later indexes.

## Alternatives considered

### Unsigned base64 JSON cursor

Rejected because clients could tamper with continuation positions and filter binding. Even though the cursor does not authorize access, authentication gives stable validation semantics and avoids accepting fabricated state.

### Offset pagination

Rejected because it does not match the approved cursor contract and drifts under concurrent catalog changes.

### Cursor encryption

Not selected. The payload contains no secret, personal data, or authority. Integrity is required; confidentiality is not.

### Separate localized-text rows

Not selected for the first vertical. The approved languages are bounded to `es` and `en`; JSONB keeps the catalog slice reversible without introducing another relation. A later localization expansion requires a contract and migration decision.

### Global UUID foreign keys without tenant and center columns

Rejected because they would not make cross-tenant and cross-center relationships structurally impossible.

## Validation and expected evidence

This Draft ADR changes documentation only and provides no implementation evidence.

An implementation PR must link `DIVE-BOOK-REQ-049..057` and include:

- cursor round-trip, tamper, version, filter-binding, scope-revalidation, and key-rotation behavior tests;
- activity and slot response contract tests, including omitted optional fields;
- migration tests for keys, foreign keys, positive checks, status checks, and index names;
- center-scope and cross-tenant negative tests;
- PostgreSQL query-plan evidence only if additional indexes are proposed;
- honest `Validation`, rollback, and known-gap sections.

`SPIKE-DIVE-001` remains required before declaring concurrent capacity behavior Done. It does not block creating the catalog tables and endpoints defined by US-08.

## Open questions

1. Who owns the catalog cursor signing secret and its rotation runbook before production traffic?
2. How long will a previous cursor version remain accepted after a later version ships?

Neither question blocks a synthetic-data Draft implementation. Both must be closed before a real-data pilot if cursor rotation is enabled.

## Implementation authority

None while Draft. This ADR records `Proposed` decisions and does not authorize schema migrations, runtime routes, or changes to `SPEC-DIVE-BOOKING-001`. Explicit approval is required before promoting the ADR or incorporating these closures into the Ready-to-start SPEC.
