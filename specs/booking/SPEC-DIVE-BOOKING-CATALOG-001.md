# SPEC-DIVE-BOOKING-CATALOG-001 - Activity catalog, public profiles and HTTP

- **Status:** Draft
- **Version:** 0.15
- **Last reviewed:** 2026-10-01
- **Owner:** Product / Booking
- **Approval reference:** Original requirements and approvals extracted from SPEC-DIVE-BOOKING-001 at commit `86e9d97`; documentation split requested 2026-09-30. Language-policy, initial-configuration and commercial-profile approvals on 2026-09-30, and the activity-editing decisions accepted in chat on 2026-10-01, are recorded below. No artifact promotion or implementation conformance is inferred.

## Normative authority

**Documented:** owns the requirements declared below, retaining existing IDs and historical sources from [SPEC-DIVE-BOOKING-001](SPEC-DIVE-BOOKING-001.md). Unchanged clauses preserve their approvals; the explicitly approved language-policy and commercial-profile revisions are recorded separately below. This file does not authorize unrelated contracts or infer conformance from implementation existence.

## Requirement provenance

| Requirement IDs | Provenance | Exact source | Decision status |
|---|---|---|---|
| `DIVE-BOOK-REQ-009` | `Derived` | `specs/product/dive-mvp-profile.md`; PR #1 | Approved by product owner |
| `DIVE-BOOK-REQ-011` | `Derived` | `specs/product/dive-mvp-profile.md`; PR #1 | Approved by product owner |
| `DIVE-BOOK-REQ-017..DIVE-BOOK-REQ-020` | `Proposed` | PR #1 booking lifecycle consolidation | Approved by product owner for MVP validation |
| `DIVE-BOOK-REQ-022` | `Proposed` | PR #1 booking lifecycle consolidation | Approved by product owner for MVP validation |
| `DIVE-BOOK-REQ-050` | `Proposed` | Product confirmation by the product owner on 2026-09-27 for US-08 center-scoped catalog HTTP; product-owner request on 2026-09-30 to document activity editing | Original routes and scope retain their approval. The later editing decisions below supersede the original partial-update proposal |
| `DIVE-BOOK-REQ-051..DIVE-BOOK-REQ-057` | `Proposed` | Product confirmation by the product owner on 2026-09-27 for US-08 catalog HTTP, center-scoped operations, slot time representation, listing defaults, and PR #35 page-pagination contract for activity/slot listing | Approved by product owner 2026-09-27 for MVP validation |
| Language-policy revision of `DIVE-BOOK-REQ-009`, `051`, `053` | `Proposed` | Product-owner request on 2026-09-30: "aplicalo", approving the preceding recommendation for one initial language, optional later translations, publication with a base language and requested-language-to-base fallback | Accepted language policy; supersedes the earlier bilingual publication gate only; unresolved editing contracts remain separate |
| Center-level language selection for `DIVE-BOOK-REQ-009`, `051`, `053` | `Proposed` | Product-owner clarification on 2026-09-30: "el centro elige el idioma por defecto en el que rellena la info de sus actividades, no es necesario que lo indique en cada actividad"; supported values clarified with "por ahora entre español e ingles"; subsequent requests "Implementa los cambios, incluido el idioma del catalogo" and "registra la decision sobre el cambio y haz handoff al agente indicado para su implementacion" | Explicitly approved center-level selection and implementation intent; supersedes client selection of `baseLocale` for each activity. Initial configuration is closed by the subsequent approval below; later preference changes remain outside scope |
| Initial center catalog-language contract under `DIVE-BOOK-REQ-009`, `050..056` | `Proposed` | Product-owner acceptance on 2026-09-30: "se acepta la propuesta, documentalo", referring to the preceding GET/PUT catalog-settings proposal, existing read/update permissions, explicit missing/locked errors, catalog-owned persistence, transactional selection and activity creation, empty-catalog migration checks, and reuse of the catalog audit/outbox owner | Explicitly approved bounded initial-configuration increment; subsequent language changes are excluded. This approval records the contract without artifact promotion, new role grants, implementation evidence or invented audit/event names |
| Empty existing activity catalog for the language migration | `Documented` | Product-owner statement on 2026-09-30: "no existen actividades existentes aun" | Reported migration premise, not executed database evidence; no existing-activity language assignment is needed under that premise |
| `DIVE-BOOK-REQ-073..DIVE-BOOK-REQ-079` | `Proposed` | Product-owner request on 2026-09-30: "aplica los cambios propuestos sobre la documentacion", approving the preceding center/activity field analysis and inconsistency-resolution proposals | Approved product direction and ownership boundaries; detailed transport, persistence, publication-readiness and edit contracts remain open; no runtime coverage claimed |
| Activity editing and preload under `DIVE-BOOK-REQ-050`, `056`, `078` | `Proposed` | Product-owner decisions in this chat on 2026-10-01 permitting editing in every activity state, accepting preload and revision-based concurrency, requesting separate language forms, and accepting the separation of shared facts from translations; subsequent request to update the documents | Explicitly approved direction and interaction contract below; replaces Draft-only editing and partial-field submission. The subsequent acceptance below closes grouped-write, clearing, no-op and retry behavior; no artifact promotion or implementation proof |
| Concrete editing contract under `DIVE-BOOK-REQ-050`, `056`, `078` | `Proposed` | Product-owner explicit acceptance in this chat on 2026-10-01 of the preceding seven-part proposal for grouped PUT bodies, clearing, persisted revision initialization, strong preconditions, unchanged saves, retries, transactional audit and current-field extension | Accepted bounded contract in Activity editing; approval applies to that proposal, not the whole artifact, unresolved physical migration details, future commercial fields or implementation coverage |
| Revision storage and migration closure under `DIVE-BOOK-REQ-050`, `056`, `078` | `Proposed` | Product-owner direction in this chat on 2026-10-01 to close the immediately preceding technical proposal: BIGINT revision initialized to 1, serialization without JavaScript Number, identity/revision ETag, additive transactional migration and dependent-code-first rollback | Explicitly approved bounded technical closure below; supersedes the former open storage/migration choices. No artifact promotion, executed migration, deployment or product-code claim |
| Current-field scope and future extension under `DIVE-BOOK-REQ-009`, `011`, `074..078` | `Proposed` | Product-owner clarification in this chat on 2026-10-01 requesting applicability to future activity fields where feasible, otherwise use of the current model, followed by the document-update request | Current editable fields first; future fields reuse common/localized ownership only after their own contracts are defined. No arbitrary-property editor or implicit commercial-field implementation |
| Commercial refinements under `DIVE-BOOK-REQ-073..079` | `Proposed` | Product-owner acceptance in this chat on 2026-10-01 of the preceding area-by-area recommendations for contacts/location, teaching languages, prerequisites, category/modality, images, inclusion templates, price, cancellation, public readiness and editing, followed by authorization to update documentation | Explicitly approved refinements in the commercial profile contract below; no artifact promotion, product implementation or executed coverage. Scheduling and executable cancellation refinements remain with their respective owners |
| Incremental contract closure and delivery under `DIVE-BOOK-REQ-050`, `056`, `073..081` | `Proposed` | Product-owner acceptance in this chat on 2026-10-01 of the preceding seven-block recommendations and profile-first contract preparation, followed by authorization to update documentation | Accepted delivery sequence and per-block gates below; reuses the existing concrete editing contract. Approval does not select absent profile API/permissions, storage, currency, cancellation or scheduling contracts, waive the implementation issue gate, authorize product code or promote artifacts |
| Seven-block technical refinements under `DIVE-BOOK-REQ-050`, `056`, `073..079` | `Proposed` | Product-owner acceptance in this chat on 2026-10-01 of the preceding recommendations for each open delivery block, followed by authorization to document them | Approved bounded profile, content, media, money and public-readiness refinements below; existing editing closure is retained. IAM grants, history, cancellation and scheduling remain with their owners. Conditional deployment/legal choices and absent detailed contracts are not approved by implication; no artifact promotion or executed coverage |

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
GET    /v1/centers/:centerId/activities/:activityId
PUT    /v1/centers/:centerId/activities/:activityId
PATCH  /v1/centers/:centerId/activities/:activityId/publish
PATCH  /v1/centers/:centerId/activities/:activityId/disable
GET    /v1/centers/:centerId/activities/:activityId/slots
POST   /v1/centers/:centerId/activities/:activityId/slots
PATCH  /v1/centers/:centerId/slots/:slotId/close
PATCH  /v1/centers/:centerId/slots/:slotId/cancel
```

`:centerId`, `:activityId`, and `:slotId` are selectors, never authorization. Paths MUST NOT include a tenant identifier. A request MUST NOT list, create, or mutate resources of another center, even when the actor has access to that other center.

**Proposed, explicitly approved:** the 2026-10-01 editing acceptances in the provenance table replace the original editing PATCH proposal with individual read and complete-form PUT saves. [Activity editing](#activity-editing) owns the accepted `group` request selector, language/common separation and revision contract. This inventory does not claim implementation; publication and disabling retain their separate PATCH commands.

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

**Proposed, explicitly approved:** the 2026-10-01 activity-editing acceptance in the provenance table owns the revision of `DIVE-BOOK-REQ-078` below.

- **DIVE-BOOK-REQ-078:** Activity content is editable in `Draft`, `Published` and `Disabled`, while preserving activity identity, publication state, existing executions and accepted booking conditions. Editing does not publish or reactivate an activity. Common facts have one authoritative value, not a value per translation; localized content is edited independently by language. The 2026-10-01 acceptance in the provenance table and [Activity editing](#activity-editing) own preload, full-form replacement and revision-based concurrency. Changing an execution or an existing booking requires its separate authorized flow. Expanded commercial fields retain their own unresolved contracts.

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

Profile completion is optional for dashboard access. Initial public-offer readiness asks for at least one public contact and customer-appropriate location/meeting guidance; social links, review links and a physical headquarters address are not prerequisites. Centers meeting customers elsewhere can supply meeting guidance instead. The accepted readiness checklist below refines the required data; exact validation and channel enablement transport remain open; no new center lifecycle flag is selected.

### Activity content and reuse boundaries

| Data group | Approved meaning |
|---|---|
| Name and description | Reuse the existing localized content and base-locale policy; description remains optional for creation and activity publication, but is required by the accepted public-offer readiness checklist below |
| Prerequisites | Published certification names accepted by the center, minimum age and required experience when applicable; "OPEN" alone is ambiguous, and equivalence between certifying organizations is not inferred |
| Images | References to media with cover selection, ordering, alternative text and usage rights; no image binaries or participant documents in the activity record |
| Included/excluded items | Activity-owned localized lists, initially copied from optional center templates and editable independently; "global" means center-owned, never platform-global |
| Teaching languages | Explicit activity selection under `DIVE-BOOK-REQ-075`; a French teaching language does not extend the currently supported content-translation keys |
| Category and modality | Commercial category such as introductory dive, guided dive or course is separate from boat/shore/pool entry modality; neither assigns a boat, staff member or operational trip |
| Meeting guidance | Activity-owned when stable; execution-owned when it changes by departure; never silently replaced with the center address |
| Duration | Indicative total experience duration is commercial information, not authoritative execution start/end or a claim about time underwater |
| Price | Fixed per-person amount, currency, unit and explicit tax presentation under `DIVE-BOOK-REQ-076`; the accepted refinement below distinguishes an explicitly free offer from an unconfigured price; no implicit currency, tax choice or payment integration |
| Cancellation policy | Explicit reference to a reusable center policy version under `DIVE-BOOK-REQ-077`; no inherited policy default |

Location presentation identifies whether it shows the center or the activity's meeting point. Public prerequisites do not broaden `DIVE-BOOK-REQ-013` or `046` to collect medical answers, certification evidence or participant documents. `SPEC-DIVE-OPS-001` and staff/resource assignment remain outside this increment.

**Documented:** [SPEC-DIVE-BOOKING-SCHEDULING-001](SPEC-DIVE-BOOKING-SCHEDULING-001.md), `DIVE-BOOK-REQ-010`, `049`, owns rules and executions. Center opening/contact hours, activity commercial duration and execution availability are different concepts. Do not store days/times as a second activity availability authority.

### Public projection and historical conditions

The public list may combine cover, name, indicative duration, category/modality, prerequisite summary, effective teaching-language information, fixed price and customer-appropriate location summary. Detail may include included/excluded items, cancellation terms and the relevant meeting map. These are safe projection fields, not permission to expose dashboard DTOs or private center data.

External review links stay labeled as center reviews. Importing a rating, count or review text needs a separately approved provider/source, licensing and refresh contract; no scraping or user-entered rating is introduced. Server composition must preserve the resolved tenant, center and channel boundary and avoid one browser request per card for repeated center data. Performance has not been measured and no new numeric budget or pagination contract is selected.

[SPEC-DIVE-BOOKING-001](SPEC-DIVE-BOOKING-001.md) owns accepted booking conditions and historical snapshots. [SPEC-DIVE-BOOKING-CAPABILITIES-001](SPEC-DIVE-BOOKING-CAPABILITIES-001.md) owns policy-conditioned cancellation, including the approved direction for a booking without an assigned date. Neither historical terms nor executable cancellation rules are duplicated in this profile.

### Accepted commercial refinements

**Proposed, explicitly approved:** source is the product-owner acceptance and documentation authorization on 2026-10-01 recorded in the commercial-refinements provenance row above. The following decisions refine `DIVE-BOOK-REQ-073..079`; they do not promote this Draft artifact or imply implementation. Existing creation and activity-publication gates remain unchanged; the additional checklist governs public-offer enablement only.

#### Contacts and location

Telephone, WhatsApp, public email, website, social links and review links remain independently optional. Public projection uses only explicitly public profile fields, never Owner identity or fiscal data. A structured center address and coordinates identify the center; activity meeting guidance identifies the customer meeting point. Public booking requires at least one public contact and sufficient meeting guidance, not a physical headquarters, social presence or review link.

**Proposed, explicitly approved:** the seven-block acceptance in the provenance table selects `GET/PUT /v1/centers/:centerId/public-profile`. PUT replaces the complete form: empty optional values are removed and empty collections remain empty. Read an absent profile as empty public data, never populated from Owner identity. Persistence has one profile row per center with tenant/center ownership, a revision and structured collections. Require `ETag`/`If-Match`; no silent overwrite. Commit changes and audit atomically; unchanged saves retain revision and produce no duplicate audit. No public event or automatic channel enablement is introduced.

**Proposed, explicitly approved:** telephone and WhatsApp use international format; email reuses the existing validator; links are HTTPS without embedded credentials; coordinates require both components within valid ranges. The server does not fetch submitted URLs. [IAM](../iam/SPEC-DIVE-IAM-001.md#commercial-profile-and-policy-permissions) owns `center.read` and the approved profile-write grants. Logo upload is excluded from the first profile increment and follows the media increment. Exact field envelope, international-phone normalization, text/collection bounds, coordinate precision, map presentation, profile ETag serialization, revision initialization, errors, audit action and migration remain open.

#### Teaching languages

Teaching languages use normalized language codes and multiple selection, independently of content translations. Activity creation preselects the center's habitual teaching languages for explicit confirmation. An execution may restrict, but not automatically broaden, its advertised languages. Presentation distinguishes available languages from guaranteed languages; when a customer selects a language, booking is allowed only when it can be guaranteed, not merely recorded as a preference.

**Proposed, explicitly approved:** use a controlled BCP 47 vocabulary, multiple selection without duplicates, and explicit vocabulary extensions rather than free text. Each execution declares guaranteed languages and booking revalidates a selected customer language against them. Do not enable customer language selection for a booking without an execution until that guarantee contract is closed. Initial vocabulary, canonicalization, effective-field storage, concurrency and customer-change communication remain open; content translations remain bounded by their existing language policy.

#### Prerequisites, category and modality

Prerequisites use optional structured minimum age and accepted certification fields, with localized experience clarification. Certification names are shown in full; no automatic agency-equivalence or eligibility engine is introduced, and participant medical/certification documents remain outside this profile. Category has one primary value from introductory dive, guided dive, course, snorkel or other; other requires a description. Entry modality permits one or more of boat, shore and pool, separately from category; alternative modalities require the effective execution modality to be shown. Exact field validation remains open; boat and staff assignment remain excluded.

**Proposed, explicitly approved:** accepted certifications identify agency and full certification name; minimum age is optional and experience initially uses localized clarification rather than an eligibility interpretation. Category and modalities are common facts; descriptive prerequisite content and included/excluded items are localized. Save only the selected group. Reuse catalog authorization for commercial content, not policy management or channel enablement. Exact certification structure, age bounds, category/modality wire codes, field bounds and extension to the grouped-save envelope remain open.

#### Images

Images are uploaded to managed storage; activity records hold references, not binaries or arbitrary external image URLs. Each activity has one cover and editable ordering, localized alternative text and confirmation of usage rights. The initial accepted formats are JPEG, PNG and WebP, with at most 10 images per activity and 10 MB per original. Upload processing validates actual format, size and same-center ownership, removes sensitive metadata and generates optimized list/detail versions.

**Proposed, explicitly approved:** private S3-compatible managed storage is accessed through an adapter. AWS S3 is the accepted provider recommendation conditional on account, region and cost confirmation, not an authorization to provision infrastructure. Create an authorized temporary upload, upload, inspect actual format/dimensions/decodability, process, confirm same-center media ownership, then attach to the activity. Interpret 10 MB as `10 000 000` bytes. Expose only processed derivatives and public metadata, never private keys, upload URLs or original files automatically. These limits are media bounds, not measured performance budgets.

**Proposed, explicitly approved:** upload links last 15 minutes; unconfirmed temporary uploads are eligible for deletion after 24 hours. Do not delete linked media while references exist. Worker/outbox cleanup is idempotent and does not call storage inside a database transaction. Precise expiry origins and boundary semantics, asset states, upload/confirmation HTTP, processing safety bounds, derivative dimensions, reference/deletion races, cleanup cadence and account/region/cost remain open; no credentials, live provisioning or worker implementation are claimed.

#### Included and excluded items

Each activity owns two ordered localized lists. Optional center templates are copied at creation; later template edits never rewrite activities. Applying a template later requires replacement preview and explicit confirmation. An empty list means no published information, not that everything is included. Exact localized replacement/clear and template transport remain open.

**Proposed, explicitly approved:** apply a template per language, show the differences and confirm replacement. Never delete another language or rewrite existing activities when the center template changes. This selects the replacement boundary, not an absent template API or field limits.

#### Price

Persist a fixed per-person amount in integer currency minor units, not floating-point decimal money, with explicit currency and tax inclusion/exclusion. An unconfigured price is distinct from zero; zero explicitly means free. Public booking requires configured price and displays the calculable total before confirmation. Packages, discounts, payment collection and seasonal/execution tariffs are excluded from this increment.

**Proposed, explicitly approved:** the initial currency is explicitly selected EUR, with no default, represented as nonnegative integer cents. Validate amount, seat multiplication and total representability; zero means free. Additional currencies require explicit precision contracts. The first expanded public offer displays a final tax-included price; tax-excluded public presentation remains inactive until total calculation and fiscal/legal review are closed. This narrows first-public-offer scope, not an automatic conversion or inferred tax calculation. Exact numeric wire/storage bounds and fiscal/legal review remain open; [Booking history](SPEC-DIVE-BOOKING-001.md#accepted-price-and-offer-revision) owns accepted amounts and offer revisions.

#### Policies and accepted conditions

Center policies combine structured executable rules and coherent localized text, with explicit activity assignment and immutable accepted versions on bookings. **Proposed, explicitly approved:** editing a policy creates a new immutable version of its rules and localized text; a booking retains the version it accepted. Policy changes affect new bookings only. [The cancellation owner](SPEC-DIVE-BOOKING-CAPABILITIES-001.md#policy-conditioned-cancellation), `DIVE-BOOK-REQ-081`, owns the minute-based inclusive cutoff, initial contact-center-only fallback and unresolved undated-booking rules; [the booking owner](SPEC-DIVE-BOOKING-001.md#accepted-commercial-conditions), `DIVE-BOOK-REQ-080`, owns historical conditions. [IAM](../iam/SPEC-DIVE-IAM-001.md#commercial-profile-and-policy-permissions) owns `cancellation_policy.manage`. Exact policy schema, version identity, assignment lifecycle and management HTTP remain open; no default cutoff or refund promise is introduced.

#### Public-offer readiness

Public-offer enablement checks eligible activity and channel publication plus public contact, adequate meeting guidance, name, description, cover, configured price, teaching languages and an assigned cancellation policy; prerequisites are required only when applicable. Show missing items and block only the affected channel, without adding a center lifecycle state. Dashboard entry, preparation of Draft activities and the existing base-language-only activity-publication gate remain available.

**Proposed, explicitly approved:** reject edits that would make an enabled channel incomplete, identifying missing requirements. Allow explicitly disabling the affected channel first without cancelling existing bookings. Enablement, relevant edits and booking creation revalidate eligibility with a defined transactional order. [IAM](../iam/SPEC-DIVE-IAM-001.md#commercial-profile-and-policy-permissions) retains `channel.manage`; profile and policy edits do not grant it. Exact completeness predicates, cross-owner transaction coordination, field/error projection and channel API remain open; existing unaffected public booking behavior is not silently disabled.

#### Editing and permissions

Common facts and each language use independently preloaded complete-form saves with required revision checks. Conflicts preserve the user's draft and require reload/review; no silent overwrite. Authorization distinguishes profile editing, catalog editing, policy editing and channel publication; [IAM](../iam/SPEC-DIVE-IAM-001.md#commercial-profile-and-policy-permissions) owns the subsequently approved grants. Editing never publishes/reactivates an activity or rewrites executions or accepted booking conditions. The existing [activity-editing contract](#activity-editing) continues to own grouped saves and concurrency.

#### Delivery order and remaining contracts

**Proposed, explicitly approved:** the 2026-10-01 incremental-delivery acceptance in the provenance table refines the earlier recommended sequence into the following bounded blocks. Close and approve each block's required contracts before its implementation; do not require the whole commercial extension to be designed before the first block can proceed.

1. Public center profile first: use the approved center-scoped GET/PUT, full-form replacement, basic validation and IAM grants above. Close exact fields/bounds, revision serialization, persistence/migration, audit and isolation-test contracts. Keep fields optional for dashboard entry, retain minimal bootstrap and do not enable public bookings automatically.
2. Current activity editing: use the existing [accepted grouped PUT and clearing contract](#accepted-grouped-put-and-clearing-contract), [revision contract](#revision-and-concurrent-changes) and [accepted storage/migration closure](#accepted-revision-storage-and-migration), rather than reopening their decisions. Explicit groups, rejection of mixed bodies, optional-value clearing, strong preconditions, unchanged-save revision/audit behavior and the bounded technical closure are selected; implementation and executable migration validation remain delivery gates, not open product choices.
3. Simple commercial content: prerequisites, category, modalities, teaching languages and included/excluded items, with copied center templates rather than dynamic inheritance. Do not expose customer language selection until its guarantee contract is closed.
4. Images as a separate increment: use the approved private managed S3-compatible lifecycle, 15-minute upload link and 24-hour unconfirmed cleanup eligibility. Confirm account/region/cost and close states, safe processing/derivatives, reference races, errors and migration before implementation; approved formats/byte limits are not performance measurements.
5. Price together with accepted-condition history: use explicit initial EUR/cents, tax-included public presentation and offer-revision confirmation. Close numeric bounds, acceptance/snapshot/API/migration details and fiscal/legal review before exposing new prices. [Booking history](SPEC-DIVE-BOOKING-001.md#accepted-price-and-offer-revision), `DIVE-BOOK-REQ-080`, remains the history owner; no payment subsystem or fabricated legacy consent is introduced.
6. Cancellation and public-offer enablement: use the approved inclusive minute cutoff, contact-only fallback and rejection of edits that make an enabled offer incomplete. Close policy schema/version management, eligibility/errors and cross-owner transaction order before activating the expanded public offer. Existing unaffected booking behavior is not disabled by this delivery sequence.
7. Expanded scheduling last in the commercial delivery sequence: retain exact-date/time scheduling as its first increment, then separately close recurrence, day-only and date-free contracts with [the scheduling owner](SPEC-DIVE-BOOKING-SCHEDULING-001.md#accepted-delivery-sequence-and-initial-local-time-handling). This changes sequencing, not that owner's accepted model or existing fixed-time behavior.

**Documented:** the earlier delivery acceptance requested a concrete public-profile proposal; the subsequent seven-block acceptance now selects the bounded profile decisions above. Remaining detailed contracts still require closure before end-to-end implementation. Neither acceptance authorizes issue-free product implementation. The [implementation-entry workflow](../../docs/sdd/development-brief-template.md#explicit-chat-authorization) and supervised handoff gates remain applicable.

**Documented:** the subsequent seven-block technical acceptance refines the delivery gates above. The selected profile routes and basic validation, IAM grants, controlled language vocabulary direction, template language boundary, media byte limit/TTLs, EUR precision, inclusive cancellation cutoff and incomplete-edit rejection are no longer undecided. Remaining implementation gates are the exact profile field/validation/ETag/audit/migration contract; initial language vocabulary and effective-language storage/concurrency; commercial grouped-field schemas and bounds; conditional media deployment, states, processing and deletion races; price wire/storage bounds and fiscal/legal review; policy schema/lifecycle and capability errors; complete readiness predicates and cross-owner transaction order; and expanded scheduling's remaining state, HTTP and migration contracts. The already accepted current-field revision/migration contract is not reopened. No additional absent field, permission, default or migration is silently selected.

Expected checks, not executed proof: bootstrap unchanged; profile optional for entry; public contacts separate from Owner identity; same-tenant/same-center ownership and denial of cross-scope links; center edits not rewriting activity languages or copied items; independent category/modality and meeting location; raw localized content preserved; fixed price/unit/tax presentation; center review attribution without imported ratings; public/private projection boundaries; Published edits not changing existing bookings; and policy/term history once its contracts are closed.

## Catalog HTTP (center application)

This interface is for the authenticated center application. Public widget and hosted-page routes remain outside it.

| Method and path | Effect |
|---|---|
| `GET /v1/centers/:centerId/catalog-settings` | Read the initial catalog-language selection, or explicit unconfigured state |
| `PUT /v1/centers/:centerId/catalog-settings` | Select the initial catalog language; same-value retry succeeds, replacement is excluded |
| `GET /v1/centers/:centerId/activities` | List activities of that center only |
| `POST /v1/centers/:centerId/activities` | Create a Draft activity in that center |
| `GET /v1/centers/:centerId/activities/:activityId` | Read current stored activity values and revision for editing |
| `PUT /v1/centers/:centerId/activities/:activityId` | Complete-form save for one independently edited language or the common fields, selected by the accepted `group` body below |
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
- **Documented:** [Activity editing](#activity-editing), under its 2026-10-01 approval, now owns independent language-form replacement and editing in all activity states. The initial center-preference contract still rejects replacing the selected center language; that historical boundary does not prohibit the separately accepted activity-content editing flow. Changing the center preference or an activity's base language is not authorized by editing translations.

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
GET /v1/centers/:centerId/activities/:activityId
PUT /v1/centers/:centerId/activities/:activityId
```

**Proposed, explicitly approved:** source is the product owner's 2026-10-01 decisions, explicit acceptance of the concrete editing proposal and subsequent technical closure recorded in the provenance table. This section supersedes the previous Draft-only PATCH proposal, not creation, publication, public-offer eligibility or accepted booking terms. The bounded interaction, transport and revision-migration contract is accepted; this does not promote the whole Draft artifact or claim implementation or executed migration.

#### Scope and ownership

**Proposed, explicitly approved:** activities are editable in all three states. Edits retain identity and state; editing a Disabled activity does not enable new use, and editing a Published activity does not alter existing slots or accepted booking conditions. Publishing and disabling remain separate commands.

**Proposed, explicitly approved:** the first implementation uses current fields: localized `name` and `description`, and common optional positive `defaultCapacity`. Capacity has one stored value across languages; changing the default does not change an existing slot's capacity or derived available seats. Public-content editability is an extension direction for future activity fields, not permission to add fields without their own validation, persistence and commercial contracts.

**Documented:** `DIVE-BOOK-REQ-009`, `051`, `053` and [the language policy](#activity-languages-and-fallback) distinguish authored translations from presentation fallback and require a non-blank base-language name. Identity, authority, publication state, `baseLocale` and derived capacity are not editable content inputs in this increment. No new role grants or language-change operation is inferred.

#### Preload and independent forms

**Proposed, explicitly approved:** individual GET loads current authored activity values before editing. A failed load must not open an empty/default-filled editor. Spanish and English use separate forms with only one language form visible at a time, not side-by-side inputs. Each language form is prefilled with that language's stored values, never fallback text copied from another language. Switching languages retains unsaved drafts.

**Proposed, explicitly approved:** common facts use a separate form and independent save. A language save sends the complete editable content of that selected language, not a changed-field patch, and preserves every other translation and all common fields. A common-form save sends its complete editable values and preserves localized content. These saves update the existing activity rather than create a replacement through POST.

**Proposed, explicitly approved:** clearing an optional form value removes that value when saved; it must not retain the former value merely because the field is now empty. The end user does not enter or understand `null`: the interface submits empty text for a cleared translation and `null` for a cleared common capacity under the transport contract below. The required base-language name cannot be cleared. Missing optional translations remain absent, not persisted blank placeholders.

#### Accepted grouped PUT and clearing contract

**Proposed, explicitly approved:** the single PUT selects exactly one complete form through a closed request body. A translation request has `group: "translation"`, `locale: "es"` or `"en"`, and `values` containing both string fields `name` and `description`. A common request has `group: "common"` and `values` containing `defaultCapacity`, a positive integer or `null`; it has no `locale`. Omitted required form fields, unknown fields and mixed-group bodies return `422` without changing the activity. Creation remains the separate POST operation.

**Proposed, explicitly approved examples:** these bodies replace only their selected form, not other translations or groups:

```json
{
	"group": "translation",
	"locale": "es",
	"values": {
		"name": "Bautismo de buceo",
		"description": ""
	}
}
```

```json
{
	"group": "common",
	"values": {
		"defaultCapacity": 6
	}
}
```

**Proposed, explicitly approved:** empty or whitespace-only optional text deletes the selected stored translation; a non-base `name` may be cleared in the same way. The base-language name must remain non-blank. Clearing `defaultCapacity` sends `null` and removes the default without changing any existing slot's capacity. No blank placeholder is persisted. A complete form whose optional values are all cleared is not an empty request. These clearing rules do not change the existing validation of other non-blank values.

#### Revision and concurrent changes

**Proposed, explicitly approved:** individual GET returns an `ETag` derived from a persisted activity revision. Every content save requires `If-Match`: missing precondition returns `428`, and an outdated revision returns `412`, without changing stored content. Content changes and actual publication-state changes advance the same activity revision so an editor detects intervening state changes. This does not add an `If-Match` requirement to the existing lifecycle commands by implication.

**Proposed, explicitly approved:** the revision is persisted as `BIGINT` initialized to `1` for existing and newly created activities. Only actual content or state changes increment it. The technical closure selects the strong ETag format `"activity-<id>-r<revision>"`, with the decimal revision serialized without conversion to JavaScript `Number`. PUT requires exactly one strong ETag in `If-Match`; malformed or unsupported precondition syntax returns `400`, while a syntactically valid but nonmatching revision returns `412`. Authentication, permissions and resource scope are checked before disclosing resource or revision outcomes.

**Proposed, explicitly approved:** on a conflict, retain the user's unsaved form and offer reloading current data; do not automatically retry against a new revision or silently overwrite another save. Authorization and scope checks precede resource/revision disclosure. A successful save uses the existing `204` command convention and returns the current `ETag`.

**Proposed, explicitly approved:** a complete-form save with a current precondition and unchanged values returns `204` and the current ETag without increasing the revision or adding audit effects. A stale precondition still returns `412`, even if the submitted values happen to match. No replay/idempotency key is introduced. If a changed save commits but its response is lost, repeating its old precondition returns `412`; retain the form and allow reading current values instead of automatically resubmitting against a new revision.

**Proposed, explicitly approved:** persist content changes, revision and the audit action `booking.activity.updated` in one transaction through the current catalog owner. The audit identifies the edited group and, for a translation edit, its locale. Unchanged saves produce no new audit entry. This increment adds no new public event or notification and does not change accepted booking terms, slots or existing booking records.

**Documented:** `DIVE-BOOK-REQ-050`, `056` and [SPEC-DIVE-IAM-001](../iam/SPEC-DIVE-IAM-001.md#matrix-mvp) own authentication, current center scope, existing `booking_service.read` for GET and `booking_service.update` for saving, and non-disclosing errors. A missing activity and an activity outside the current authorized center/tenant have the same observable `404`, even if the actor can access another center. Revision preconditions never authorize access. Reuse the catalog mutation/audit owner and [ADR-DIVE-002](../architecture/adrs/ADR-DIVE-002.md) for required transactional effects; do not add a parallel mutation API, pre-commit external call, invented event or notification.

#### Accepted revision storage and migration

**Proposed, explicitly approved:** the technical closure in the provenance table selects `booking_app.activities.revision` as a non-null PostgreSQL `BIGINT`, initialized to `1` for existing and newly created activities. Maintain tenant/center scope, existing RLS and the catalog transaction owner. Add this column through an additive transactional migration, preserving existing activity content, identity and state. This does not require a new product relation, locale backfill or revision index, and does not authorize data deletion or unrelated migration changes.

**Derived:** the approved positive, monotonically increasing revision and PostgreSQL [BIGINT range](https://www.postgresql.org/docs/18/datatype-numeric.html#DATATYPE-INT) imply representable revisions from `1` to `9223372036854775807`. Parse, compare and serialize exactly with integer-safe representations such as `bigint` or decimal strings, never JavaScript `Number`. An unrepresentable increment must fail atomically rather than wrap, reset or commit content without its revision; this does not select a new named HTTP error.

**Proposed, explicitly approved:** apply the schema migration before enabling the dependent API/web editing flow. Rollback is coordinated: retire dependent editing code and mutation paths before reverting the revision column; never remove a column still required by active code. The rollback may remove revision metadata, not activity content, identity, publication state, slots or bookings. No live migration, deployment or rollback is authorized or demonstrated by this documentation closure.

**Documented:** this closure and the accepted grouped PUT contract resolve the current-field editing storage, ETag and migration choices previously listed as open. Executable upgrade/rollback, exact-integer, concurrency and transaction tests remain delivery gates, not unresolved product decisions. Migration performance and locking have not been measured; no numeric budget or deployed-data premise is inferred. Future commercial fields and any later public event/notification retain their separate contracts and approval gates.

#### Expected validation

**Proposed, explicitly approved:** these are expected tests, not executed proof: authorized edits in all three states; current-value preload and failed-load protection; one visible language form and unsaved-draft preservation; complete selected-language replacement and clear behavior without changes to other languages/common facts; independent common save and shared capacity; missing, unknown and mixed-group body rejection; required base name and forbidden identity/authority/state fields; same-center permissions and cross-tenant/cross-center non-disclosure; missing, malformed and stale preconditions; concurrent-save conflicts and content/state revision ordering; unchanged saves with no revision/audit increment; lost-response retry returning `412` without duplicated effects; conflict draft preservation; initial revision `1` for existing/new activities; exact ETag handling above JavaScript's safe-integer range; no committed effects on revision overflow; preservation of activity data during upgrade/rollback; dependent-code-first rollback; unchanged identity, state, existing slots, bookings and accepted conditions; and atomic mutation/revision/audit rollback. No such check is claimed as executed by this documentation change.

## Dependencies and verification

**Documented:** capacity and atomic booking effects are owned by SPEC-DIVE-BOOKING-001. Expanded scheduling and time fields refer to SPEC-DIVE-BOOKING-SCHEDULING-001; the fixed-time representation remains approved. ADR-DIVE-014 owns the approved pagination, DTO and physical naming decisions. Test publication, lifecycle replay, pagination bounds and same-identity cross-center denial.

**Documented:** [the accepted initial local-time contract](SPEC-DIVE-BOOKING-SCHEDULING-001.md#accepted-delivery-sequence-and-initial-local-time-handling), under `DIVE-BOOK-REQ-010`, `029`, `049` and its 2026-10-01 approval, owns rejection of ambiguous or nonexistent center-local times. That policy is not an open catalog decision; user interaction, precise validation/error transport and center-timezone changes remain implementation gates. Existing explicit-instant slot inputs retain their contract.

## Open questions

**Documented:** [Accepted commercial refinements](#accepted-commercial-refinements) records the 2026-10-01 decisions and the narrower remaining commercial-field, public-profile, readiness and policy-version gates. The [Activity editing](#activity-editing) acceptance closes all-state editability, independent language/common forms, preload and revision-based conflict detection; it does not close the concrete new-field contracts or real-data/legal review.

**Documented:** [the accepted revision storage and migration contract](#accepted-revision-storage-and-migration) closes the technical choices for current-field editing. Implementation and its expected validation remain pending; the trusted center-timezone response contract and separate expanded-field gates are not closed by this approval. Existing-field editing must not be described as implemented by this documentation update.

**Documented:** [the initial center catalog-language contract](#initial-center-catalog-language-contract) records approval of read/write routes, existing permissions, missing/locked errors, persistence ownership and concurrent initial selection/creation. It replaces the earlier configuration blockers for that bounded increment. Later center-preference changes remain excluded; activity-content editing now has its separately accepted contract above, without a base-language change, automatic rewrite or legacy-language default. Exact new audit/event names were not part of the initial-configuration proposal; additional public event contracts remain subject to ADR-DIVE-002. The reported empty activity catalog is still a premise to check, not executed evidence.

### Implementation verification

**Documented:** local API, persistence and web coverage for the approved [language policy](#activity-languages-and-fallback) and initial selection is linked above. Deployment verification remains separate; documentation acceptance is not delivery.

**Proposed, explicitly approved operational exception:** on 2026-09-30 the product owner authorized "se autoriza expresamente la actualizacion aunque no existe issue. no generes issue", then requested a durable pending-change record and permission for chat authorization. The [workflow exception](../../docs/sdd/development-brief-template.md#explicit-chat-authorization) governs that issue-free route. This records the pending contract implementation, not a second Development Brief.

- Do not create an issue or fake closure reference. No branch, commit, push, PR or deployment is authorized by this operational exception alone.
- The empty-catalog migration premise is recorded above; it removes the need for existing-activity language assignment, not the schema migration or checks. **Documented:** [migration tests](../../packages/database/test/integration/migrations.integration.test.ts) cover an empty database and atomic refusal of a synthetic nonempty upgrade. Initial-configuration API/persistence/web coverage is linked above; deployed-database checks remain pending.

**Documented implementation authorization:** the product owner's subsequent 2026-09-30 request "Implementa los cambios, incluido el idioma del catalogo" retains the issue-free authorization for the bounded catalog-language and already-approved center-entry work discussed in this chat. The later acceptance "se acepta la propuesta, documentalo" additionally approves the initial-configuration contract above, not the other Draft proposals, subsequent preference changes, status promotion or publication. The implementation owner is Backend for catalog API/persistence; Frontend owns the dependent configuration/activity UI and presentation plus the already-approved center-entry web flow. Coordination remains governed by [the agent contract](../../.github/agents/README.md).

### Proposed completion contracts

**Proposed, Draft:** expose the confirmed IANA `timeZone` through authorized center read, without browser or code defaults. Approve unavailable-zone handling and response shape before a center-local scheduling form relies on it.
