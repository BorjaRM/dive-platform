# ADR-DIVE-014 — Center catalog lists, response DTO, and persistence naming

- **Status:** Ready to start
- **Version:** 0.11
- **Date:** 2026-09-27
- **Deciders:** Product / Architecture / Data / Security
- **Affected IDs:** `DIVE-BOOK-REQ-001..006`, `009..011`, `017..020`, `029`, `049..057`; `DIVE-IAM-REQ-024`, `029..032`; ADR-DIVE-001; ADR-DIVE-008; ADR-DIVE-009

## Provenance

**Proposed, explicitly approved:** on 2026-09-30 the product owner authorized promotion of decisions meeting the readiness gate with "las decisiones que estan listas para pasarse a ready to start pasalas". The previously approved fixed-time pagination, DTO, persistence and time-rendering decisions below have no blocking question within their scope. Editing, expanded scheduling and new timezone-response fields remain outside this approval.

| Decision | Provenance | Exact source | Approval / status |
|---|---|---|---|
| Dashboard catalog is scoped to one authorized center; path identifiers are selectors, never authorization | `Documented` | `SPEC-DIVE-BOOKING-001` `DIVE-BOOK-REQ-001..006`, `050`; ADR-DIVE-008 | Existing normative constraint |
| Activity and slot request fields, lifecycle, HTTP status/error contract, filters, and stable ordering | `Documented` | `SPEC-DIVE-BOOKING-001` `DIVE-BOOK-REQ-009..011`, `017..020`, `029`, `049..057` | Existing normative constraint |
| Activities and slots use one-based page pagination; cursor pagination is deferred | `Proposed` | Product-owner confirmation by the product owner for PR #35 on 2026-09-27 | Approved for incorporation into `SPEC-DIVE-BOOKING-001` v1.3; approved for implementation by explicit promotion authorization on 2026-09-30 above |
| Minimal activity/slot representations | `Proposed` | Product-owner confirmation by the product owner for PR #35 on 2026-09-27 | Approved for incorporation into the booking contract; approved for implementation by explicit promotion authorization on 2026-09-30 above |
| `booking_app.activities` / `booking_app.slots`, physical columns, constraints, and catalog indexes | `Proposed` | Existing `iam_app` PostgreSQL/Drizzle conventions; product-owner confirmation by the product owner for PR #35 on 2026-09-27 | Approved for incorporation into the booking contract; approved for implementation by explicit promotion authorization on 2026-09-30 above |
| RFC3339 instants are persisted as `timestamptz`; slot responses render with the center's confirmed IANA time zone; missing or invalid center time zones fail closed | `Proposed` | Product-owner confirmation by the product owner for PR #35 on 2026-09-27; `DIVE-BOOK-REQ-049`; `DIVE-ONB-REQ-022` | Approved for incorporation into the booking contract; approved for implementation by explicit promotion authorization on 2026-09-30 above |
| The dashboard client consumes the catalog response DTOs and lifecycle states without creating a second client-side domain model | `Documented` | `SPEC-DIVE-BOOKING-001` `DIVE-BOOK-REQ-009..011`, `017..020`, `049..057`; `ADR-DIVE-009` § State ownership | Existing normative constraint |
| Interactive catalog reads and mutations use TanStack Query; pagination and filters are URL-owned; form drafts and dialogs remain local React state | `Documented` | `ADR-DIVE-009` § State ownership | Existing implementation boundary |
| Catalog query keys may contain center/resource selectors and filters, but never the Clerk token or raw `X-Tenant-Context` handle | `Documented` | `ADR-DIVE-009` § Cache and tenant boundaries; `ADR-DIVE-008` § Credential representation and transport | Existing security constraint |
| Activity DTO/persistence includes a base language resolved from center configuration and keeps authored localized objects; fallback belongs to presentation | `Documented` | [SPEC-DIVE-BOOKING-CATALOG-001 language policy](../../booking/SPEC-DIVE-BOOKING-CATALOG-001.md#activity-languages-and-fallback), `DIVE-BOOK-REQ-009`, `051`, `053`; historical "aplicalo" approval and subsequent center-level clarification on 2026-09-30 recorded by that owner | Approved center-level selection supersedes per-activity client selection; reported empty catalog requires no activity backfill |
| Bounded initial center catalog-language configuration: HTTP, existing permissions, explicit missing/locked behavior, catalog-owned persistence and concurrent selection/creation | `Documented` | [SPEC-DIVE-BOOKING-CATALOG-001 initial-configuration contract](../../booking/SPEC-DIVE-BOOKING-CATALOG-001.md#initial-center-catalog-language-contract), `DIVE-BOOK-REQ-009`, `050..056`; explicit product-owner acceptance "se acepta la propuesta, documentalo" on 2026-09-30 recorded by that owner | Initial configuration contract approved; later language replacement, unrelated Draft clauses and any additional public event contract are not approved by implication |

## Context

US-08 needs predictable lists for activities and slots. A typical center is expected to manage approximately 15–20 activities, while slots can grow over time. Simple page pagination gives both endpoints one uniform contract without cursor signing, rotation, versioning, or a special “range too broad” failure.

This ADR closes the walking-skeleton list contract with limit/offset pagination. **Documented:** the subsequent [initial-language configuration contract](../../booking/SPEC-DIVE-BOOKING-CATALOG-001.md#initial-center-catalog-language-contract), `DIVE-BOOK-REQ-009`, `050..056`, adds bounded settings routes and language resolution under existing permissions. It does not change activity/slot lifecycle, role grants, capacity semantics, public booking creation or bootstrap fields.

**Documented:** client state/cache architecture remains owned by ADR-DIVE-009. Increment-specific implementation sequencing belongs in its issue Development Brief, not this ADR. The separately accepted 2026-10-01 [activity-editing decisions](../../booking/SPEC-DIVE-BOOKING-CATALOG-001.md#activity-editing) and [storage/migration closure](../../booking/SPEC-DIVE-BOOKING-CATALOG-001.md#accepted-revision-storage-and-migration), together with the remaining trusted timezone-response questions, are owned by SPEC-DIVE-BOOKING-CATALOG-001. That acceptance is not implementation coverage or promotion of the Draft editing artifact; backend center-entry coverage and the pending web handoff are distinguished in TRACE-DIVE-MVP-001.

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
  "baseLocale": "es",
  "name": { "es": "string" },
  "description": { "es": "string", "en": "string" },
  "defaultCapacity": 8,
  "createdAt": "RFC3339 instant"
}
```

**Documented:** `description` and `defaultCapacity` are omitted when unset. Activity `baseLocale` is `es` or `en`, resolved from the authorized center's selected default at creation rather than selected in each activity request; the example does not select an implicit default. DTOs preserve stored localized objects without filling missing translations. Creation/publication, the center-level selection and presentation-only fallback are owned by [the catalog language policy](../../booking/SPEC-DIVE-BOOKING-CATALOG-001.md#activity-languages-and-fallback), `DIVE-BOOK-REQ-009`, `051`, `053`, not this ADR or a persistence adapter.

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
- `base_locale` text;
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

**Documented:** [the catalog language policy](../../booking/SPEC-DIVE-BOOKING-CATALOG-001.md#activity-languages-and-fallback), `DIVE-BOOK-REQ-009`, `051`, `053`, retains a non-null activity `base_locale` constrained to `es` or `en`, without a database language default. Its source is the authorized center's selected language, not a per-activity client input. The owner records the product owner's 2026-09-30 empty-catalog statement; no activity backfill is needed under that premise, but schema migration and checks remain required. The [initial-configuration contract](../../booking/SPEC-DIVE-BOOKING-CATALOG-001.md#initial-center-catalog-language-contract), under the same IDs and `050..056`, owns catalog-schema persistence, the tenant/center key, explicit unconfigured state, routes, existing permissions and transactional initial selection. This ADR does not assign a language to existing unconfigured centers or introduce a dependency on expanded scheduling settings.

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

**Documented:** no blocking decision remains for the approved fixed-time list/DTO/schema and time-rendering contract. [Activity editing](../../booking/SPEC-DIVE-BOOKING-CATALOG-001.md#activity-editing) records its separate 2026-10-01 acceptance and [bounded technical closure](../../booking/SPEC-DIVE-BOOKING-CATALOG-001.md#accepted-revision-storage-and-migration); implementation and validation remain pending. The center-timezone read projection remains a proposal. Neither contract is approved by implication from list approval or this ADR's historical promotion.

Cursor pagination is deferred. If demonstrated volume, deep-page cost, or offset drift later requires it, its scope, cursor format, validation, and compatibility become a new proposed contract change.

**Documented:** the approved center-level language direction, [initial-configuration contract](../../booking/SPEC-DIVE-BOOKING-CATALOG-001.md#initial-center-catalog-language-contract) and reported empty-catalog migration premise are owned by SPEC-DIVE-BOOKING-CATALOG-001, `DIVE-BOOK-REQ-009`, `050..056`. The dated acceptance closes the bounded transport/authorization and concurrent initial-selection/creation questions. Later preference changes and additional public event contracts are not implicitly approved. This ADR does not select a legacy default, assert an inspected database or claim executed implementation coverage.

## Implementation authority

Ready to start: the unchanged approved fixed-time clauses authorize reversible implementation with synthetic data under their owning requirements in SPEC-DIVE-BOOKING-CATALOG-001, with time representation in SPEC-DIVE-BOOKING-SCHEDULING-001 and historical approvals retained. Neither this promotion, merge nor the split approves editing, expanded scheduling or new timezone DTO fields. Review, Accepted, real personal data and pilot gates remain separate.
