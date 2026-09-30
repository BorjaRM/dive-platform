# SPEC-DIVE-BOOKING-CATALOG-001 - Activity catalog, public profiles and HTTP

- **Status:** Draft
- **Version:** 0.5
- **Last reviewed:** 2026-09-30
- **Owner:** Product / Booking
- **Approval reference:** Original requirements and approvals extracted from SPEC-DIVE-BOOKING-001 at commit `86e9d97`; documentation split requested 2026-09-30. Language-policy approval and product-owner approval of commercial-profile proposals on 2026-09-30 are recorded below. No artifact promotion or implementation conformance is inferred.

## Normative authority

**Documented:** owns the requirements declared below, retaining existing IDs and historical sources from [SPEC-DIVE-BOOKING-001](SPEC-DIVE-BOOKING-001.md). Unchanged clauses preserve their approvals; the explicitly approved language-policy and commercial-profile revisions are recorded separately below. This file does not authorize unrelated contracts or infer conformance from implementation existence.

## Requirement provenance

| Requirement IDs | Provenance | Exact source | Decision status |
|---|---|---|---|
| `DIVE-BOOK-REQ-009` | `Derived` | `specs/product/dive-mvp-profile.md`; PR #1 | Approved by product owner |
| `DIVE-BOOK-REQ-011` | `Derived` | `specs/product/dive-mvp-profile.md`; PR #1 | Approved by product owner |
| `DIVE-BOOK-REQ-017..DIVE-BOOK-REQ-020` | `Proposed` | PR #1 booking lifecycle consolidation | Approved by product owner for MVP validation |
| `DIVE-BOOK-REQ-022` | `Proposed` | PR #1 booking lifecycle consolidation | Approved by product owner for MVP validation |
| `DIVE-BOOK-REQ-050` | `Proposed` | Product confirmation by the product owner on 2026-09-27 for US-08 center-scoped catalog HTTP; explicit user request on 2026-09-30: "es necesario añadir PATCH /activities/:activityId, documentalo" | Original routes and scope retain their approval. Activity-editing endpoint requested; detailed editing semantics remain Draft pending the decisions below |
| `DIVE-BOOK-REQ-051..DIVE-BOOK-REQ-057` | `Proposed` | Product confirmation by the product owner on 2026-09-27 for US-08 catalog HTTP, center-scoped operations, slot time representation, listing defaults, and PR #35 page-pagination contract for activity/slot listing | Approved by product owner 2026-09-27 for MVP validation |
| Language-policy revision of `DIVE-BOOK-REQ-009`, `051`, `053` | `Proposed` | Product-owner request on 2026-09-30: "aplicalo", approving the preceding recommendation for one initial language, optional later translations, publication with a base language and requested-language-to-base fallback | Accepted language policy; supersedes the earlier bilingual publication gate only; unresolved editing contracts remain separate |
| `DIVE-BOOK-REQ-073..DIVE-BOOK-REQ-079` | `Proposed` | Product-owner request on 2026-09-30: "aplica los cambios propuestos sobre la documentacion", approving the preceding center/activity field analysis and inconsistency-resolution proposals | Approved product direction and ownership boundaries; detailed transport, persistence, publication-readiness and edit contracts remain open; no runtime coverage claimed |

## Requirements

- **DIVE-BOOK-REQ-009:** An activity is a center-scoped catalog offering with its own identity, publication state, explicit `baseLocale` (`es` or `en`), localized name/description, and optional default capacity. Translations share that activity identity; they do not create duplicate activities.

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

- **DIVE-BOOK-REQ-051:** `POST /v1/centers/:centerId/activities` creates an activity in `Draft`. The client sends explicit `baseLocale` (`es` or `en`), localized `name` with a non-blank value in that base language, optional localized `description`, and optional positive `defaultCapacity`. The other language is optional; no base-language default, automatic translation or copy into a missing translation is introduced. The client MUST NOT send `tenantId`, `centerId`, or `status`.

- **DIVE-BOOK-REQ-052:** `POST /v1/centers/:centerId/activities/:activityId/slots` is allowed only when that activity is `Published`. The created slot is `Available`. The client sends `startsAt`, positive `durationMinutes`, and positive `capacity`. Tenant and center are taken from the authorized path and activity. The client MUST NOT send `tenantId`, another `centerId`, `status`, `end`, or remaining seats.

- **DIVE-BOOK-REQ-053:** `PATCH .../publish` requires a valid `baseLocale` and a non-blank `name[baseLocale]`; it does not require both languages or a description. Additional translations are optional at creation and publication. Presentation resolves each localized field through requested locale then activity base locale; missing optional description is omitted. `PATCH .../disable` stops new use of the activity and does not cancel existing slots.

- **DIVE-BOOK-REQ-054:** Repeating `publish`, `disable`, `close`, or `cancel` when the resource is already in the resulting state is idempotent success (`204`). An incompatible transition returns `409`.

- **DIVE-BOOK-REQ-055:** A slot may transition `Closed → Cancelled`.

- **DIVE-BOOK-REQ-056:** Catalog HTTP uses `application/problem+json`. Create returns `201`. Successful commands return `204`. Malformed JSON returns `400`. Missing session or tenant context returns `401`. A permission failure inside the current authorized center returns `403`. A missing resource or a resource outside the current center/tenant returns `404` with the same observable result. Semantic field errors return `422`.

- **DIVE-BOOK-REQ-057:** Catalog lists never accept multiple centers. Activity and slot lists use one-based page pagination with optional `page` and `pageSize` query parameters. `page` defaults to `1`; `pageSize` defaults to `20` and has a maximum of `50`. Values outside those bounds return the existing `422 validation_error`. Responses return `items`, `page`, `pageSize`, and `hasNext`; they do not require a total count. Activities are ordered by `created_at DESC`, then `id DESC`, and may be filtered by `status`. Slots are ordered by `starts_at ASC`, then `id ASC`, and may be filtered by optional date range and `status`. The walking skeleton uses limit/offset pagination; cursor pagination requires a separately approved contract change.

- **DIVE-BOOK-REQ-073:** A center may complete its public profile after bootstrap without blocking dashboard entry. The profile belongs to that tenant and center and supports optional public contacts, social/review links, public location, website, logo, short presentation, customer-service languages and habitual teaching languages. Public contacts are distinct from identity, administration and fiscal data. Bootstrap retains its existing minimal fields.

- **DIVE-BOOK-REQ-074:** An activity's commercial content supports localized description, published prerequisites, ordered images, included/excluded items, commercial category, entry modality, meeting guidance and indicative duration. Center inclusion/exclusion templates are copied into the activity and reviewed, not dynamically inherited. These fields describe the offer; they do not collect participant evidence, assign resources or authorize operational eligibility checks.

- **DIVE-BOOK-REQ-075:** Activity teaching languages are distinct from content translations and customer-service languages. Center teaching languages may preselect suggestions during creation, but the center confirms and stores the activity selection. Later center edits do not rewrite existing activities. When execution restrictions apply, the effective languages must be shown before booking; advertised teaching availability must not promise an unguaranteed language.

- **DIVE-BOOK-REQ-076:** The initial commercial price is one fixed amount per activity and person, with explicit currency, unit and whether taxes are included or excluded. Price presentation does not introduce online collection, deposits, invoicing, refunds or dynamic pricing. Packages, season-dependent prices and execution-specific rates require a subsequent approved tariff contract rather than an implicit override.

- **DIVE-BOOK-REQ-077:** Cancellation conditions belong to a reusable, versioned policy of the center, explicitly assigned to each activity. Public policy text and executable cancellation rules must describe the same conditions. No policy assignment or change may silently rewrite existing booking terms. Booking term history and cancellation eligibility are owned by their respective linked contracts below.

- **DIVE-BOOK-REQ-078:** Non-structural editing of Published activity content is permitted as a product direction for future bookings, while preserving activity identity, publication state, existing executions and accepted booking conditions. Changing an execution or an existing booking requires its separate authorized flow. Exact state-specific permissions, revision, concurrency and HTTP contracts remain implementation gates; this direction does not authorize editing Disabled activities.

- **DIVE-BOOK-REQ-079:** A public activity listing is a server-derived projection combining eligible activity content, center public information and applicable availability. It does not duplicate center facts in activity storage or expose private contacts. Center reviews are identified as center reviews, initially external links only. Enabling a public offer is distinct from publishing an activity and must check channel eligibility and the applicable public-profile/commercial readiness contract without silently broadening the existing activity-publication gate.

## Commercial profile contract

**Proposed, explicitly approved:** the dated approval for `DIVE-BOOK-REQ-073..079` owns this section. It records product decisions, not a finished HTTP/schema contract. This owner is reused for center public presentation and activity catalog content; no parallel profile SPEC, generic CMS, tariff engine or operational-resource module is introduced.

### Center public profile and completion

**Documented:** [SPEC-DIVE-ONBOARDING-001](../onboarding/SPEC-DIVE-ONBOARDING-001.md), `DIVE-ONB-REQ-020..026`, owns the minimal bootstrap and excludes public contact collection. The public-profile step follows bootstrap; it is not a new tenant/center creation path or a substitute for membership and center-entry readiness.

| Data group | Approved meaning |
|---|---|
| Social links | Optional collection of platform and URL pairs; no fixed column per social network |
| Review links | Optional collection of provider and URL pairs; not imported ratings or reviews |
| Public location | Optional structured address and map coordinates, separate from fiscal address and activity meeting points |
| Public contacts | Optional telephone, independent WhatsApp contact and public email; telephone does not imply WhatsApp support; Owner login email is not automatically published |
| Website and identity | Optional website, logo and short public presentation |
| Languages | Separate customer-service languages and habitual teaching languages; neither selects interface or activity content locale |

Profile completion is optional for dashboard access. Initial public-offer readiness asks for at least one public contact and customer-appropriate location/meeting guidance; social links, review links and a physical headquarters address are not prerequisites. Centers meeting customers elsewhere can supply meeting guidance instead. Exact readiness validation and channel enablement remain open; no new center lifecycle flag is selected.

### Activity content and reuse boundaries

| Data group | Approved meaning |
|---|---|
| Name and description | Reuse the existing localized content and base-locale policy; description is recommended for the public detail but is not made mandatory by this change |
| Prerequisites | Published certification names accepted by the center, minimum age and required experience when applicable; "OPEN" alone is ambiguous, and equivalence between certifying organizations is not inferred |
| Images | References to media with cover selection, ordering, alternative text and usage rights; no image binaries or participant documents in the activity record |
| Included/excluded items | Activity-owned localized lists, initially copied from optional center templates and editable independently; "global" means center-owned, never platform-global |
| Teaching languages | Explicit activity selection under `DIVE-BOOK-REQ-075`; a French teaching language does not extend the currently supported content-translation keys |
| Category and modality | Commercial category such as introductory dive, guided dive or course is separate from boat/shore/pool entry modality; neither assigns a boat, staff member or operational trip |
| Meeting guidance | Activity-owned when stable; execution-owned when it changes by departure; never silently replaced with the center address |
| Duration | Indicative total experience duration is commercial information, not authoritative execution start/end or a claim about time underwater |
| Price | Fixed per-person amount, currency, unit and explicit tax presentation under `DIVE-BOOK-REQ-076`; no implicit currency, tax choice, free-price rule or payment integration |
| Cancellation policy | Explicit reference to a reusable center policy version under `DIVE-BOOK-REQ-077`; no inherited policy default |

Location presentation identifies whether it shows the center or the activity's meeting point. Public prerequisites do not broaden `DIVE-BOOK-REQ-013` or `046` to collect medical answers, certification evidence or participant documents. `SPEC-DIVE-OPS-001` and staff/resource assignment remain outside this increment.

**Documented:** [SPEC-DIVE-BOOKING-SCHEDULING-001](SPEC-DIVE-BOOKING-SCHEDULING-001.md), `DIVE-BOOK-REQ-010`, `049`, owns rules and executions. Center opening/contact hours, activity commercial duration and execution availability are different concepts. Do not store days/times as a second activity availability authority.

### Public projection and historical conditions

The public list may combine cover, name, indicative duration, category/modality, prerequisite summary, effective teaching-language information, fixed price and customer-appropriate location summary. Detail may include included/excluded items, cancellation terms and the relevant meeting map. These are safe projection fields, not permission to expose dashboard DTOs or private center data.

External review links stay labeled as center reviews. Importing a rating, count or review text needs a separately approved provider/source, licensing and refresh contract; no scraping or user-entered rating is introduced. Server composition must preserve the resolved tenant, center and channel boundary and avoid one browser request per card for repeated center data. Performance has not been measured and no new numeric budget or pagination contract is selected.

[SPEC-DIVE-BOOKING-001](SPEC-DIVE-BOOKING-001.md) owns accepted booking conditions and historical snapshots. [SPEC-DIVE-BOOKING-CAPABILITIES-001](SPEC-DIVE-BOOKING-CAPABILITIES-001.md) owns policy-conditioned cancellation, including the approved direction for a booking without an assigned date. Neither historical terms nor executable cancellation rules are duplicated in this profile.

Implementation gates: localized merge/clear behavior for new fields; vocabulary/cardinality for languages, categories and modalities; media upload/storage, ownership and URL validation; contact/address validation and public visibility; money representation, precision/bounds and tax display; policy representation/version lifecycle and legal meaning of the price; concrete readiness checks; and permissions, revision, idempotency, concurrency and HTTP/schema/migration contracts. No transport field, storage default or publication predicate is silently selected.

Expected checks, not executed proof: bootstrap unchanged; profile optional for entry; public contacts separate from Owner identity; same-tenant/same-center ownership and denial of cross-scope links; center edits not rewriting activity languages or copied items; independent category/modality and meeting location; raw localized content preserved; fixed price/unit/tax presentation; center review attribution without imported ratings; public/private projection boundaries; Published edits not changing existing bookings; and policy/term history once its contracts are closed.

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

### Activity languages and fallback

**Proposed, explicitly approved:** the language-policy revision in the provenance table is the owner of these rules. Activity state `Draft` is a lifecycle value, not a pending approval of this policy.

One language is sufficient for creation and publication:

```json
{
	"baseLocale": "es",
	"name": { "es": "Bautismo de buceo" }
}
```

- `baseLocale` belongs to the activity, not the viewer or channel, and is explicitly selected. Only `es` and `en` translation keys are supported. Supplied translation values must be non-blank; a missing translation is omitted rather than stored as a blank placeholder.
- `name` and `description` retain their localized-object representation. Catalog DTOs return the stored translations and `baseLocale`, not objects filled with fallback text. A UI can distinguish authored translations from absent ones and add translations later through authorized edits.
- Hosted/widget presentation resolves each field independently: use the requested-language value if present, otherwise the base-language value. If neither description exists, omit it; a publishable activity always has its base name. Do not select an arbitrary third fallback or claim that base-language text is translated.
- Resolution never writes fallback text into persistence and does not create an extra activity. It does not change the requested page/booking locale, interface translations, email locale or channel authorization.
- This policy does not decide per-language PATCH merge/clear semantics, base-language changes, or permission to edit Published/Disabled activities. Those remain part of the editing contract below.

Expected checks, not executed behavior evidence: creation and publication with only `es` or only `en`; missing/unsupported base locale or missing/blank base name rejected; optional description; requested translation preferred; per-field fallback; omitted absent description; raw DTOs and persisted objects unchanged by rendering; and additional translations without duplicate activity identities.

**Documented implementation gap:** the current activity publish service still checks both names in [activity-catalog.service.ts](../../apps/api/src/catalog/activities/activity-catalog.service.ts), and [booking-schema.ts](../../packages/database/src/booking-schema.ts) does not yet store `baseLocale`. This documentation approves the contract, not runtime conformance. Existing-record backfill and rollout require an explicit migration decision; do not infer a base language from object-key order or silently assign one.

### Activity editing

```text
PATCH /v1/centers/:centerId/activities/:activityId
```

**Documented:** `DIVE-BOOK-REQ-051` and `053` require the base-language name for creation and publication, not both names. Missing translations remain optional and follow [the activity language policy](#activity-languages-and-fallback).

**Derived, Draft:** editing supports completing an existing Draft without creating a replacement activity. `/activities/:activityId` in the user request is the suffix under the existing center-scoped catalog prefix defined by `DIVE-BOOK-REQ-050`, not a new unscoped or tenant-selecting route.

**Proposed, explicitly approved direction:** `DIVE-BOOK-REQ-078` permits future-facing non-structural edits of Published activities, including content and translations, without retroactive effects. This resolves the former product question about whether Published editing is allowed; it does not close its permissions, state-specific input, revision/concurrency or HTTP contract. Disabled editing remains outside the approval.

**Proposed, Draft transport slice:** retain the existing Draft-editing proposal under `DIVE-BOOK-REQ-050`, with this bounded input and behavior. It is not the completed transport contract for the commercial extension or Published editing:

- Require the current authenticated center context and `booking_service.update`, without introducing new role grants. `centerId` and `activityId` remain selectors; resolve the activity within that authorized tenant and center.
- Allow localized `name` and `description` (`es` / `en`) and optional positive `defaultCapacity`, preserving a non-blank base-language name. Base-language changes require the unresolved contract below. Reject client authority, identity, publication-state and derived-capacity fields, including `tenantId`, `centerId`, `id`, `status` and remaining seats.
- Edit only the existing Draft. Preserve its identity and publication state, allow incomplete Draft translations, and leave slot capacity, existing slots and bookings unchanged. Publishing and disabling keep their separate commands; this proposal does not authorize editing Published or Disabled activities.
- Reuse the owning tenant-scoped catalog mutation and audit boundary rather than a second editing API. This contract does not select a new event, provider or persistence abstraction.

**Documented:** shared catalog authentication, permission, non-disclosing scope and field-error conventions remain owned by `DIVE-BOOK-REQ-056`. A missing activity and an activity outside the current authorized center/tenant have the same observable `404`, including when the actor can access another center.

Decisions still required before implementation:

- Omitted-field behavior, per-language merge versus whole-object replacement, and clearing `description` or `defaultCapacity` with `null` or another explicit representation.
- Base-language changes, protection of the required base name, and the state-specific permission/input contract for Published edits and translations; `DIVE-BOOK-REQ-078` approves their direction, not implementation details.
- Empty/no-op patch handling, final success response/body, and the state-conflict error for a non-Draft activity.
- Retry/idempotency and concurrent-edit conflict handling; no replay key, version precondition or last-write-wins policy is selected here.

Expected tests, not executed proof: authorized same-center edits; cross-tenant and same-identity cross-center denial; forbidden input; incomplete translations followed by publication; non-Draft denial for the bounded Draft-only transport slice; future-facing Published edits with unchanged accepted booking terms under the extended contract; unchanged slots/bookings/capacity; and mutation/audit, clear, replay and concurrency behavior once their contracts are approved.

## Dependencies and verification

**Documented:** capacity and atomic booking effects are owned by SPEC-DIVE-BOOKING-001. Expanded scheduling and time fields refer to SPEC-DIVE-BOOKING-SCHEDULING-001; the fixed-time representation remains approved. ADR-DIVE-014 owns the approved pagination, DTO and physical naming decisions. Test publication, lifecycle replay, pagination bounds and same-identity cross-center denial.

## Open questions

Commercial-field, public-profile, readiness, policy-version and Published-edit transport gates are listed in [Commercial profile contract](#commercial-profile-contract). Their product direction is approved; unresolved implementation contracts and real-data/legal review remain separate.

The unresolved [Activity editing](#activity-editing) decisions and the trusted center-timezone response contract need explicit closure before claiming a complete management UI.

Existing-activity base-language selection/backfill and rollout compatibility must be approved before the language-policy implementation is activated. No legacy-language default is selected.

### Pending API implementation

**Documented:** `DIVE-BOOK-REQ-009`, `051` and `053` define the approved [language policy](#activity-languages-and-fallback), but the current API and persistence do not implement it. The API update remains required; documentation acceptance is not delivery.

**Proposed, explicitly approved operational exception:** on 2026-09-30 the product owner authorized "se autoriza expresamente la actualizacion aunque no existe issue. no generes issue", then requested a durable pending-change record and permission for chat authorization. The [workflow exception](../../docs/sdd/development-brief-template.md#explicit-chat-authorization) governs that issue-free route. This records the pending contract implementation, not a second Development Brief.

- Update catalog input validation and raw activity DTOs for explicit `baseLocale`, and align creation/publication with the approved single-language gate.
- Persist the activity's base language through the existing tenant/center-scoped mutation boundary; preserve authorization, RLS, audit and outbox behavior.
- Add requirement-scoped API/contract tests and migration/isolation checks before claiming conformance. Presentation fallback remains owned by its consumer boundary, not stored DTO copies.
- Do not create an issue or fake closure reference. No branch, commit, push, PR or deployment is authorized by this operational exception alone.
- Existing-activity base-language assignment/backfill and rollout remain unresolved; do not infer a language or choose a default. This decision still blocks the affected migration/activation slice.

### Proposed completion contracts

**Proposed, Draft:** expose the confirmed IANA `timeZone` through authorized center read, without browser or code defaults. Approve unavailable-zone handling and response shape before a center-local scheduling form relies on it.
