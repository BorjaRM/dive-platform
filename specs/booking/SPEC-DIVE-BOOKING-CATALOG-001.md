# SPEC-DIVE-BOOKING-CATALOG-001 - Fixed-time catalog and HTTP

- **Status:** Draft
- **Version:** 0.2
- **Last reviewed:** 2026-09-30
- **Owner:** Product / Booking
- **Approval reference:** Unchanged requirements and approval records extracted from SPEC-DIVE-BOOKING-001 at commit `86e9d97`; documentation split requested 2026-09-30. No new semantic approval or status promotion is inferred.

## Normative authority

**Documented:** owns only the requirements declared below, extracted verbatim from [SPEC-DIVE-BOOKING-001](SPEC-DIVE-BOOKING-001.md). Original Derived/Proposed classifications, sources and approvals are preserved. This file does not authorize unrelated contracts or infer conformance from implementation existence.

## Requirement provenance

| Requirement IDs | Provenance | Exact source | Decision status |
|---|---|---|---|
| `DIVE-BOOK-REQ-009` | `Derived` | `specs/product/dive-mvp-profile.md`; PR #1 | Approved by product owner |
| `DIVE-BOOK-REQ-011` | `Derived` | `specs/product/dive-mvp-profile.md`; PR #1 | Approved by product owner |
| `DIVE-BOOK-REQ-017..DIVE-BOOK-REQ-020` | `Proposed` | PR #1 booking lifecycle consolidation | Approved by product owner for MVP validation |
| `DIVE-BOOK-REQ-022` | `Proposed` | PR #1 booking lifecycle consolidation | Approved by product owner for MVP validation |
| `DIVE-BOOK-REQ-050` | `Proposed` | Product confirmation by the product owner on 2026-09-27 for US-08 center-scoped catalog HTTP; explicit user request on 2026-09-30: "es necesario añadir PATCH /activities/:activityId, documentalo" | Original routes and scope retain their approval. Activity-editing endpoint requested; detailed editing semantics remain Draft pending the decisions below |
| `DIVE-BOOK-REQ-051..DIVE-BOOK-REQ-057` | `Proposed` | Product confirmation by the product owner on 2026-09-27 for US-08 catalog HTTP, center-scoped operations, slot time representation, listing defaults, and PR #35 page-pagination contract for activity/slot listing | Approved by product owner 2026-09-27 for MVP validation |

## Requirements

- **DIVE-BOOK-REQ-009:** An activity is a center-scoped catalog offering with its own identity, publication state, localized name/description, and optional default capacity.

- **DIVE-BOOK-REQ-011:** An activity may propose a default capacity for new slots. That default is never the authoritative remaining-capacity source.

- **DIVE-BOOK-REQ-017:** Only `Published` activities may be used to create new public-facing slots or accept new public bookings.

- **DIVE-BOOK-REQ-018:** Disabling an activity stops new use of that activity. Existing slots are not cancelled automatically.

- **DIVE-BOOK-REQ-019:** A slot becomes `Full` when no remaining sellable seats exist; it may return to `Available` if seats are released and it is not `Closed` or `Cancelled`.

- **DIVE-BOOK-REQ-020:** Full cancellation of a slot blocks remaining sellable capacity. No new booking can confirm on that slot.

- **DIVE-BOOK-REQ-022:** Closing a slot rejects new bookings and leaves already confirmed bookings intact.

- **DIVE-BOOK-REQ-050:** Dashboard catalog and availability HTTP for the center application is always scoped to one center:

```text
GET    /v1/centers/:centerId/activities
POST   /v1/centers/:centerId/activities
PATCH  /v1/centers/:centerId/activities/:activityId
PATCH  /v1/centers/:centerId/activities/:activityId/publish
PATCH  /v1/centers/:centerId/activities/:activityId/disable
GET    /v1/centers/:centerId/activities/:activityId/slots
POST   /v1/centers/:centerId/activities/:activityId/slots
PATCH  /v1/centers/:centerId/slots/:slotId/close
PATCH  /v1/centers/:centerId/slots/:slotId/cancel
```

`:centerId`, `:activityId`, and `:slotId` are selectors, never authorization. Paths MUST NOT include a tenant identifier. A request MUST NOT list, create, or mutate resources of another center, even when the actor has access to that other center.

The activity-editing route was explicitly requested on 2026-09-30. Its detailed contract is Proposed/Draft in [Activity editing](#activity-editing); adding it to this inventory does not approve unresolved semantics or claim implementation.

- **DIVE-BOOK-REQ-051:** `POST /v1/centers/:centerId/activities` creates an activity in `Draft`. The client sends localized `name` (`es` / `en` object), optional localized `description`, and optional positive `defaultCapacity`. The client MUST NOT send `tenantId`, `centerId`, or `status`.

- **DIVE-BOOK-REQ-052:** `POST /v1/centers/:centerId/activities/:activityId/slots` is allowed only when that activity is `Published`. The created slot is `Available`. The client sends `startsAt`, positive `durationMinutes`, and positive `capacity`. Tenant and center are taken from the authorized path and activity. The client MUST NOT send `tenantId`, another `centerId`, `status`, `end`, or remaining seats.

- **DIVE-BOOK-REQ-053:** `PATCH .../publish` requires both `name.es` and `name.en`. A Draft may be saved with incomplete translations. `PATCH .../disable` stops new use of the activity and does not cancel existing slots.

- **DIVE-BOOK-REQ-054:** Repeating `publish`, `disable`, `close`, or `cancel` when the resource is already in the resulting state is idempotent success (`204`). An incompatible transition returns `409`.

- **DIVE-BOOK-REQ-055:** A slot may transition `Closed → Cancelled`.

- **DIVE-BOOK-REQ-056:** Catalog HTTP uses `application/problem+json`. Create returns `201`. Successful commands return `204`. Malformed JSON returns `400`. Missing session or tenant context returns `401`. A permission failure inside the current authorized center returns `403`. A missing resource or a resource outside the current center/tenant returns `404` with the same observable result. Semantic field errors return `422`.

- **DIVE-BOOK-REQ-057:** Catalog lists never accept multiple centers. Activity and slot lists use one-based page pagination with optional `page` and `pageSize` query parameters. `page` defaults to `1`; `pageSize` defaults to `20` and has a maximum of `50`. Values outside those bounds return the existing `422 validation_error`. Responses return `items`, `page`, `pageSize`, and `hasNext`; they do not require a total count. Activities are ordered by `created_at DESC`, then `id DESC`, and may be filtered by `status`. Slots are ordered by `starts_at ASC`, then `id ASC`, and may be filtered by optional date range and `status`. The walking skeleton uses limit/offset pagination; cursor pagination requires a separately approved contract change.

## Catalog HTTP (center application)

This interface is for the authenticated center application. Public widget and hosted-page routes remain outside it.

| Method and path | Effect |
|---|---|
| `GET /v1/centers/:centerId/activities` | List activities of that center only |
| `POST /v1/centers/:centerId/activities` | Create a Draft activity in that center |
| `PATCH /v1/centers/:centerId/activities/:activityId` | Edit the stored Draft activity; detailed semantics remain Proposed/Draft below |
| `PATCH /v1/centers/:centerId/activities/:activityId/publish` | Publish that activity |
| `PATCH /v1/centers/:centerId/activities/:activityId/disable` | Disable new use of that activity |
| `GET /v1/centers/:centerId/activities/:activityId/slots` | List slots of that activity and center |
| `POST /v1/centers/:centerId/activities/:activityId/slots` | Schedule a slot on a Published activity |
| `PATCH /v1/centers/:centerId/slots/:slotId/close` | Close the slot to new bookings; keep confirmed bookings |
| `PATCH /v1/centers/:centerId/slots/:slotId/cancel` | Cancel the slot and block remaining sellable capacity |

Protected requests send `Authorization: Bearer <clerk-session-token>` and `X-Tenant-Context` issued for the center application. Entry follows `ADR-DIVE-008`: body `centerRef` equals the platform-subdomain `centerKey` during bootstrap; afterward product paths use the returned `centerId`. `centerId` in the path must match the center resolved at entry.

### Activity editing

```text
PATCH /v1/centers/:centerId/activities/:activityId
```

**Documented:** `DIVE-BOOK-REQ-051` and `053` permit storing incomplete Draft translations but require both names for publication.

**Derived, Draft:** editing supports completing an existing Draft without creating a replacement activity. `/activities/:activityId` in the user request is the suffix under the existing center-scoped catalog prefix defined by `DIVE-BOOK-REQ-050`, not a new unscoped or tenant-selecting route.

**Proposed, Draft:** retain the existing Draft-editing proposal under `DIVE-BOOK-REQ-050`, with this bounded input and behavior:

- Require the current authenticated center context and `booking_service.update`, without introducing new role grants. `centerId` and `activityId` remain selectors; resolve the activity within that authorized tenant and center.
- Allow localized `name` and `description` (`es` / `en`) and optional positive `defaultCapacity`. Reject client authority, identity, publication-state and derived-capacity fields, including `tenantId`, `centerId`, `id`, `status` and remaining seats.
- Edit only the existing Draft. Preserve its identity and publication state, allow incomplete Draft translations, and leave slot capacity, existing slots and bookings unchanged. Publishing and disabling keep their separate commands; this proposal does not authorize editing Published or Disabled activities.
- Reuse the owning tenant-scoped catalog mutation and audit boundary rather than a second editing API. This contract does not select a new event, provider or persistence abstraction.

**Documented:** shared catalog authentication, permission, non-disclosing scope and field-error conventions remain owned by `DIVE-BOOK-REQ-056`. A missing activity and an activity outside the current authorized center/tenant have the same observable `404`, including when the actor can access another center.

Decisions still required before implementation:

- Omitted-field behavior, per-language merge versus whole-object replacement, and clearing `description` or `defaultCapacity` with `null` or another explicit representation.
- Empty/no-op patch handling, final success response/body, and the state-conflict error for a non-Draft activity.
- Retry/idempotency and concurrent-edit conflict handling; no replay key, version precondition or last-write-wins policy is selected here.

Expected tests, not executed proof: authorized same-center edits; cross-tenant and same-identity cross-center denial; forbidden input; incomplete translations followed by publication; non-Draft denial; unchanged slots/bookings/capacity; and mutation/audit, clear, replay and concurrency behavior once their contracts are approved.

## Dependencies and verification

**Documented:** capacity and atomic booking effects are owned by SPEC-DIVE-BOOKING-001. Expanded scheduling and time fields refer to SPEC-DIVE-BOOKING-SCHEDULING-001; the fixed-time representation remains approved. ADR-DIVE-014 owns the approved pagination, DTO and physical naming decisions. Test publication, lifecycle replay, pagination bounds and same-identity cross-center denial.

## Open questions

The unresolved [Activity editing](#activity-editing) decisions and the trusted center-timezone response contract need explicit closure before claiming a complete management UI.

### Proposed completion contracts

**Proposed, Draft:** expose the confirmed IANA `timeZone` through authorized center read, without browser or code defaults. Approve unavailable-zone handling and response shape before a center-local scheduling form relies on it.
