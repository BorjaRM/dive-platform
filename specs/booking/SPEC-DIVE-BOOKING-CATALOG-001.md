# SPEC-DIVE-BOOKING-CATALOG-001 - Activity catalog, public profiles and HTTP

- **Status:** Draft
- **Version:** 0.9
- **Last reviewed:** 2026-09-30
- **Owner:** Product / Booking
- **Approval reference:** Original requirements and approvals extracted from SPEC-DIVE-BOOKING-001 at commit `86e9d97`; documentation split requested 2026-09-30. Language-policy approval, its center-level selection clarification, the subsequent initial-configuration contract approval and the product-owner approval of commercial-profile proposals on 2026-09-30 are recorded below. No artifact promotion or implementation conformance is inferred.

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
| Center-level language selection for `DIVE-BOOK-REQ-009`, `051`, `053` | `Proposed` | Product-owner clarification on 2026-09-30: "el centro elige el idioma por defecto en el que rellena la info de sus actividades, no es necesario que lo indique en cada actividad"; supported values clarified with "por ahora entre español e ingles"; subsequent requests "Implementa los cambios, incluido el idioma del catalogo" and "registra la decision sobre el cambio y haz handoff al agente indicado para su implementacion" | Explicitly approved center-level selection and implementation intent; supersedes client selection of `baseLocale` for each activity. Initial configuration is closed by the subsequent approval below; later preference changes remain outside scope |
| Initial center catalog-language contract under `DIVE-BOOK-REQ-009`, `050..056` | `Proposed` | Product-owner acceptance on 2026-09-30: "se acepta la propuesta, documentalo", referring to the preceding GET/PUT catalog-settings proposal, existing read/update permissions, explicit missing/locked errors, catalog-owned persistence, transactional selection and activity creation, empty-catalog migration checks, and reuse of the catalog audit/outbox owner | Explicitly approved bounded initial-configuration increment; subsequent language changes are excluded. This approval records the contract without artifact promotion, new role grants, implementation evidence or invented audit/event names |
| Empty existing activity catalog for the language migration | `Documented` | Product-owner statement on 2026-09-30: "no existen actividades existentes aun" | Reported migration premise, not executed database evidence; no existing-activity language assignment is needed under that premise |
| `DIVE-BOOK-REQ-073..DIVE-BOOK-REQ-079` | `Proposed` | Product-owner request on 2026-09-30: "aplica los cambios propuestos sobre la documentacion", approving the preceding center/activity field analysis and inconsistency-resolution proposals | Approved product direction and ownership boundaries; detailed transport, persistence, publication-readiness and edit contracts remain open; no runtime coverage claimed |

## Requirements

- **DIVE-BOOK-REQ-009:** An activity is a center-scoped catalog offering with its own identity, publication state, server-resolved `baseLocale` (`es` or `en`), localized name/description, and optional default capacity. The center selects its default activity-content language once; the server obtains the activity's base language from that authorized center configuration at creation, without a separate selection for each activity. Translations share that activity identity; they do not create duplicate activities.

- **DIVE-BOOK-REQ-011:** An activity may propose a default capacity for new slots. That default is never the authoritative remaining-capacity source.

- **DIVE-BOOK-REQ-017:** Only `Published` activities may be used to create new public-facing slots or accept new public bookings.

- **DIVE-BOOK-REQ-018:** Disabling an activity stops new use of that activity. Existing slots are not cancelled automatically.

- **DIVE-BOOK-REQ-019:** A slot becomes `Full` when no remaining sellable seats exist; it may return to `Available` if seats are released and it is not `Closed` or `Cancelled`.

- **DIVE-BOOK-REQ-020:** Full cancellation of a slot blocks remaining sellable capacity. No new booking can confirm on that slot.

- **DIVE-BOOK-REQ-022:** Closing a slot rejects new bookings and leaves already confirmed bookings intact.

- **DIVE-BOOK-REQ-050:** Dashboard catalog and availability HTTP for the center application is always scoped to one center:

```text
GET    /v1/centers/:centerId/catalog-settings
PUT    /v1/centers/:centerId/catalog-settings
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

The catalog-settings routes implement only the explicitly approved [initial center catalog-language contract](#initial-center-catalog-language-contract); they do not expose the Draft commercial profile or expanded scheduling settings.

- **DIVE-BOOK-REQ-051:** `POST /v1/centers/:centerId/activities` creates an activity in `Draft`. The client sends localized `name` with a non-blank value in the center-selected base language, optional localized `description`, and optional positive `defaultCapacity`. The server resolves and stores `baseLocale` from the authorized center configuration; the creation request does not include a per-activity `baseLocale` selection or override. Missing configuration returns `409 center_catalog_locale_not_configured` without creating an activity. The other language is optional; no code/database language default, automatic translation or copy into a missing translation is introduced. The client MUST NOT send `tenantId`, `centerId`, or `status`.

- **DIVE-BOOK-REQ-052:** `POST /v1/centers/:centerId/activities/:activityId/slots` is allowed only when that activity is `Published`. The created slot is `Available`. The client sends `startsAt`, positive `durationMinutes`, and positive `capacity`. Tenant and center are taken from the authorized path and activity. The client MUST NOT send `tenantId`, another `centerId`, `status`, `end`, or remaining seats.

- **DIVE-BOOK-REQ-053:** `PATCH .../publish` requires a valid `baseLocale` and a non-blank `name[baseLocale]`; it does not require both languages or a description. Additional translations are optional at creation and publication. Presentation resolves each localized field through requested locale then activity base locale; missing optional description is omitted. `PATCH .../disable` stops new use of the activity and does not cancel existing slots.

- **DIVE-BOOK-REQ-054:** Repeating `publish`, `disable`, `close`, or `cancel` when the resource is already in the resulting state is idempotent success (`204`). An incompatible transition returns `409`.

- **DIVE-BOOK-REQ-055:** A slot may transition `Closed → Cancelled`.

- **DIVE-BOOK-REQ-056:** Catalog HTTP uses `application/problem+json`. Create returns `201`. Successful commands return `204`. Malformed JSON returns `400`. Missing session or tenant context returns `401`. A permission failure inside the current authorized center returns `403`. A missing resource or a resource outside the current center/tenant returns `404` with the same observable result. Semantic field errors return `422`. The approved initial catalog-language contract adds `409 center_catalog_locale_not_configured` when activity creation lacks configuration and `409 center_catalog_locale_locked` when a PUT attempts to replace the selected language; these errors are returned only after authorization of the current center.

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
| `GET /v1/centers/:centerId/catalog-settings` | Read the initial catalog-language selection, or explicit unconfigured state |
| `PUT /v1/centers/:centerId/catalog-settings` | Select the initial catalog language; same-value retry succeeds, replacement is excluded |
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

**Proposed, explicitly approved:** the language-policy revision and subsequent center-level selection clarification in the provenance table own these rules. The later clarification supersedes the earlier per-activity client selection, not the approved optional translations or presentation fallback. Activity state `Draft` is a lifecycle value, not a pending approval of this policy.

The center chooses its default activity-content language once, currently Spanish or English. When that configured language is Spanish, one language is sufficient for this activity creation request and subsequent publication:

```json
{
	"name": { "es": "Bautismo de buceo" }
}
```

- The center-selected default belongs to its activity-content configuration, not the viewer, channel, interface locale, booker locale, customer-service languages or teaching languages. It is not inferred from browser language, translation keys or the bootstrap form's user locale. No implicit Spanish or English default is selected.
- Activity creation resolves the default through the existing authorized tenant/center boundary and persists the resulting activity `baseLocale`. The activity form uses that configured language without asking for another language choice. Only `es` and `en` translation keys are supported. Supplied translation values must be non-blank; a missing translation is omitted rather than stored as a blank placeholder.
- `name` and `description` retain their localized-object representation. Catalog DTOs return the stored translations and `baseLocale`, not objects filled with fallback text. A UI can distinguish authored translations from absent ones and add translations later through authorized edits.
- Hosted/widget presentation resolves each field independently: use the requested-language value if present, otherwise the base-language value. If neither description exists, omit it; a publishable activity always has its base name. Do not select an arbitrary third fallback or claim that base-language text is translated.
- Resolution never writes fallback text into persistence and does not create an extra activity. It does not change the requested page/booking locale, interface translations, email locale or channel authorization.
- This policy does not decide per-language PATCH merge/clear semantics, base-language changes, or permission to edit Published/Disabled activities. Those remain part of the editing contract below. The approved first increment rejects changing the center preference after initial selection; a subsequent change flow and its effect on existing activities require a separate approved contract.

**Proposed, explicitly approved:** the dated acceptance of the initial-configuration proposal closes the previous Derived/Draft absence-of-default and transport questions for the bounded contract below. Missing configuration is explicit, not a browser, bootstrap-locale or code fallback. This acceptance does not extend to the other Draft catalog proposals.

Expected checks, not executed behavior evidence: center selection of either supported language; creation without per-activity language input; same-tenant/same-center configuration resolution and cross-scope denial; creation/publication with only the selected language; missing/blank base name rejected; optional description; requested translation preferred; per-field fallback; omitted absent description; raw DTOs and persisted objects unchanged by rendering; and the configuration, replay, concurrency and rollback cases specified below.

**Documented implementation coverage:** [catalog-settings.service.ts](../../apps/api/src/catalog/settings/catalog-settings.service.ts) implements initial selection through the existing authorized catalog unit of work. [activity-catalog.service.ts](../../apps/api/src/catalog/activities/activity-catalog.service.ts) resolves and returns stored `baseLocale` and publishes with only the stored base-language name; [booking-schema.ts](../../packages/database/src/booking-schema.ts) and [the incremental migration](../../packages/database/drizzle/0007_center_catalog_language.sql) provide catalog-owned tenant-scoped persistence without language defaults. [API tests](../../apps/api/test/iam.e2e-spec.ts) and [persistence tests](../../packages/database/test/integration/booking-catalog.integration.test.ts) preserve backend behavior. [The existing catalog panel](../../apps/web/src/features/dashboard/catalog-panel.tsx) implements explicit initial selection, base-language creation validation and independent presentation fallback for the current English interface without modifying raw translations. [Client contract tests](../../apps/web/src/features/dashboard/catalog-api.test.ts) and [panel tests](../../apps/web/src/features/dashboard/catalog-panel.test.tsx) cover missing/locked configuration, denied access, center changes, monolingual creation and field fallback. Local tests do not establish deployed-database or live-provider conformance.

**Documented migration premise:** the product owner's dated statement in the provenance table reports no existing activities. Existing-activity language selection/backfill is therefore not an unresolved product decision for that reported empty catalog; the schema migration and executable migration checks are still required. No deployed database was inspected by this documentation change, and the statement does not assert that no centers exist or choose a language for an unconfigured center. If an implementation check finds existing activities, their migration must be explicitly resolved rather than assigning a fabricated base language.

### Initial center catalog-language contract

**Proposed, explicitly approved:** source is the product owner's 2026-09-30 acceptance "se acepta la propuesta, documentalo" recorded in the provenance table. This is the bounded initial-selection contract under `DIVE-BOOK-REQ-009`, `050..056`, not a general center-settings API or permission to edit an already selected language.

#### HTTP and authorization

| Method and path | Existing permission | Result |
|---|---|---|
| `GET /v1/centers/:centerId/catalog-settings` | `booking_service.read` | `200` with `{ "defaultActivityLocale": "es" }`, `{ "defaultActivityLocale": "en" }` or `{ "defaultActivityLocale": null }` |
| `PUT /v1/centers/:centerId/catalog-settings` | `booking_service.update` | Closed body `{ "defaultActivityLocale": "es" }` or `{ "defaultActivityLocale": "en" }`; initial selection or same-value repetition returns `204` without a response body |

`null` is a read projection of an unconfigured center, not a language value or a stored database default. PUT does not accept `null`, unsupported languages, omitted selection or client authority fields. Semantic/unknown-field errors use `422 validation_error`; malformed JSON uses the existing `400` contract. A valid different selection after initialization returns `409 center_catalog_locale_locked` without modifying configuration or activities. No delete/reset or subsequent-language-change operation is included.

**Documented:** authentication, tenant context, current center scope and non-disclosing `401`/`403`/`404` conventions remain owned by `DIVE-BOOK-REQ-050`, `056`. Permission grants remain those in [SPEC-DIVE-IAM-001](../iam/SPEC-DIVE-IAM-001.md#matrix-mvp); this contract reuses `booking_service.read`/`update` and grants no additional role capability. A missing or unauthorized center does not expose whether its language has been configured.

#### Activity creation and interface

The server reads the selected language through the authorized tenant/center transaction and stores it as the activity's `baseLocale`; the request supplies neither that field nor another language override. The base-language name remains mandatory, the other translation and description remain optional, and publication uses the activity's stored value. If selection is missing, creation returns `409 center_catalog_locale_not_configured` with no activity, activity audit or activity outbox side effect.

The interface asks for the center selection once before its first activity can be created and thereafter authors in that language without a per-activity selector. Missing selection does not block dashboard entry or bootstrap and does not add a bootstrap field. It remains distinct from interface, booker, service and teaching languages. Reaching the language-setting step does not replace server authorization.

#### Persistence, concurrency and mutation ownership

Configuration is catalog-owned in PostgreSQL schema `booking_app`, not a field inferred from IAM identity or the browser. There is at most one selection per `(tenant_id, center_id)`, with a tenant-qualified relation to the existing center, forced RLS and the existing authorized transaction boundary. A configured value is constrained to `es` or `en` without a database language default. An unconfigured center is represented by absent configuration; migration does not assign a language to existing centers. This decision selects ownership and keys, not an additional dependency on the expanded scheduling settings.

Initial selection, its audit and required outbox effects use one transaction and the existing catalog mutation owner. Extend that owner's supported configuration responsibility rather than introduce another audit/outbox implementation, generic authorization helper or pre-commit external call. Audit/event names and payload schemas were not specified by the accepted proposal; no new named event, recipient or external delivery is inferred here. Any additional public event contract must be resolved under [ADR-DIVE-002](../architecture/adrs/ADR-DIVE-002.md) before it is introduced.

Database uniqueness and transaction ordering choose one committed selection. Concurrent identical PUTs both succeed; competing Spanish/English PUTs have one success and one locked conflict, never last-write-wins replacement. Same-value retries do not reapply the mutation or duplicate its committed effects. Activity creation reads the same center's committed selection inside its own authorized transaction. If it observes no committed selection while PUT is still in flight, it returns the missing-configuration error and can be retried after PUT succeeds; no language is guessed and no partially selected configuration is used.

The migration must check the reported empty-activity premise before enforcing the activity base-language constraint. It must not assign fabricated activity languages or delete existing data if that premise is false. A discovered existing activity requires an explicitly resolved migration; schema migration, rollback and isolation tests remain required even when no backfill is needed.

#### Expected validation

These are accepted test expectations, not executed proof: GET unconfigured/null and selected values; es/en selection; forbidden/missing/unsupported/null inputs; current permission and center-scope enforcement; cross-tenant and same-tenant cross-center denial; same-value retry; different-value conflict; concurrent identical and competing selections; activity creation racing with selection; committed-language inheritance with no per-activity input; atomic configuration/audit/outbox rollback without duplicate retry effects; monolingual creation/publication; optional translations and presentation-only fallback; empty-catalog migration checks; and tenant-context/RLS inventory coverage for the new product relation and commands. Keep `MT-REQ-*` isolation results separate from `DIVE-BOOK-*` results.

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

**Documented:** [the initial center catalog-language contract](#initial-center-catalog-language-contract) records approval of read/write routes, existing permissions, missing/locked errors, persistence ownership and concurrent initial selection/creation. It replaces the earlier configuration blockers for this bounded increment. Later center-preference changes and activity-language editing remain excluded; no automatic rewrite or legacy-language default is selected. Exact new audit/event names were not part of the proposal; additional public event contracts remain subject to ADR-DIVE-002 rather than being invented by this acceptance. The reported empty activity catalog is still a premise to check, not executed evidence.

### Implementation verification

**Documented:** local API, persistence and web coverage for the approved [language policy](#activity-languages-and-fallback) and initial selection is linked above. Deployment verification remains separate; documentation acceptance is not delivery.

**Proposed, explicitly approved operational exception:** on 2026-09-30 the product owner authorized "se autoriza expresamente la actualizacion aunque no existe issue. no generes issue", then requested a durable pending-change record and permission for chat authorization. The [workflow exception](../../docs/sdd/development-brief-template.md#explicit-chat-authorization) governs that issue-free route. This records the pending contract implementation, not a second Development Brief.

- Do not create an issue or fake closure reference. No branch, commit, push, PR or deployment is authorized by this operational exception alone.
- The empty-catalog migration premise is recorded above; it removes the need for existing-activity language assignment, not the schema migration or checks. **Documented:** [migration tests](../../packages/database/test/integration/migrations.integration.test.ts) cover an empty database and atomic refusal of a synthetic nonempty upgrade. Initial-configuration API/persistence/web coverage is linked above; deployed-database checks remain pending.

**Documented implementation authorization:** the product owner's subsequent 2026-09-30 request "Implementa los cambios, incluido el idioma del catalogo" retains the issue-free authorization for the bounded catalog-language and already-approved center-entry work discussed in this chat. The later acceptance "se acepta la propuesta, documentalo" additionally approves the initial-configuration contract above, not the other Draft proposals, subsequent preference changes, status promotion or publication. The implementation owner is Backend for catalog API/persistence; Frontend owns the dependent configuration/activity UI and presentation plus the already-approved center-entry web flow. Coordination remains governed by [the agent contract](../../.github/agents/README.md).

### Proposed completion contracts

**Proposed, Draft:** expose the confirmed IANA `timeZone` through authorized center read, without browser or code defaults. Approve unavailable-zone handling and response shape before a center-local scheduling form relies on it.
