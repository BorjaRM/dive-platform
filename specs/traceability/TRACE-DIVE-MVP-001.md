# TRACE-DIVE-MVP-001 — Artifact map and coverage

- **Status:** Ready to start
- **Version:** 0.112
- **Purpose:** locate every SDD artifact and track coverage without copying requirement text.

## Artifact map

| Artifact | Path | Status | Version |
|---|---|---|---|
| Product profile | `specs/product/dive-mvp-profile.md` | Ready to start | 0.8 |
| Foundation — multitenancy | `specs/foundation/multitenancy-architecture.md` | Ready to start | 0.2 |
| Foundation — IAM | `specs/foundation/iam-baseline.md` | Ready to start | 0.2 |
| Foundation — security/privacy | `specs/foundation/security-privacy-baseline.md` | Ready to start | 0.2 |
| Foundation — operations | `specs/foundation/operations-quality-recovery.md` | Ready to start | 0.2 |
| Foundation — SDD | `specs/foundation/sdd-specs-traceability.md` | Ready to start | 0.4 |
| Adoption profile | `specs/multitenancy/adoption-profile.md` | Draft | 0.6 |
| ADR-DIVE-001 | `specs/architecture/adrs/ADR-DIVE-001.md` | Ready to start | 0.2 |
| ADR-DIVE-002 | `specs/architecture/adrs/ADR-DIVE-002.md` | Ready to start | 0.4 |
| ADR-DIVE-003 | `specs/architecture/adrs/ADR-DIVE-003.md` | Ready to start | 0.2 |
| ADR-DIVE-004 | `specs/architecture/adrs/ADR-DIVE-004.md` | Ready to start | 0.4 |
| ADR-DIVE-005 | `specs/architecture/adrs/ADR-DIVE-005.md` | Draft | 0.4 |
| ADR-DIVE-006 | `specs/architecture/adrs/ADR-DIVE-006.md` | Ready to start | 0.1 |
| ADR-DIVE-007 | `specs/architecture/adrs/ADR-DIVE-007.md` | Ready to start | 0.3 |
| ADR-DIVE-008 | `specs/architecture/adrs/ADR-DIVE-008.md` | Ready to start | 0.16 |
| ADR-DIVE-009 | `specs/architecture/adrs/ADR-DIVE-009.md` | Ready to start | 0.5 |
| ADR-DIVE-010 | `specs/architecture/adrs/ADR-DIVE-010.md` | Draft | 0.4 |
| ADR-DIVE-011 | `specs/architecture/adrs/ADR-DIVE-011.md` | Draft | 0.3 |
| ADR-DIVE-012 | `specs/architecture/adrs/ADR-DIVE-012.md` | Draft | 0.5 |
| ADR-DIVE-013 | `specs/architecture/adrs/ADR-DIVE-013.md` | Ready to start | 0.16 |
| ADR-DIVE-014 | `specs/architecture/adrs/ADR-DIVE-014.md` | Ready to start | 0.11 |
| ADR-DIVE-015 | `specs/architecture/adrs/ADR-DIVE-015.md` | Accepted | 0.3 |
| ADR-DIVE-016 | `specs/architecture/adrs/ADR-DIVE-016.md` | Draft | 0.1 |
| SPEC-DIVE-BOOKING-001 | `specs/booking/SPEC-DIVE-BOOKING-001.md` | Draft | 1.7 |
| SPEC-DIVE-IAM-001 | `specs/iam/SPEC-DIVE-IAM-001.md` | Ready to start | 0.29 |
| SPEC-DIVE-MARKETING-001 | `specs/marketing/SPEC-DIVE-MARKETING-001.md` | Ready to start | 0.1 |
| SPEC-DIVE-ONBOARDING-001 | `specs/onboarding/SPEC-DIVE-ONBOARDING-001.md` | Ready to start | 0.20 |
| SPEC-DIVE-TRIAL-001 | `specs/commercial/SPEC-DIVE-TRIAL-001.md` | Draft | 0.1 |
| SPEC-DIVE-OPS-001 | `specs/domain/SPEC-DIVE-OPS-001.md` | Deferred | 0.3-draft |
| MT-SPIKE-001 requirements | `specs/multitenancy/MT-SPIKE-001-requirements.md` | Accepted with conditions | 0.4 |
| SPIKE-DIVE-001 | `specs/spikes/SPIKE-DIVE-001/` | Draft / not executed | see spike files |
| SPIKE-DIVE-002 | `specs/spikes/SPIKE-DIVE-002/` | Deferred | see spike files |
| SPIKE-DIVE-003 | `specs/spikes/SPIKE-DIVE-003/` | Draft / not executed | see spike files |
| SPIKE-DIVE-004 | `specs/spikes/SPIKE-DIVE-004/` | Draft / executed 2026-09-29 (Documented: spike results and dated provider evidence) | see spike files |
| This map | `specs/traceability/TRACE-DIVE-MVP-001.md` | Ready to start | 0.112 |
| ADR-DIVE-017 | `specs/architecture/adrs/ADR-DIVE-017.md` | Ready to start | 0.4 |
| SPEC-DIVE-BOOKING-CAPABILITIES-001 | `specs/booking/SPEC-DIVE-BOOKING-CAPABILITIES-001.md` | Draft | 0.4 |
| SPEC-DIVE-BOOKING-CATALOG-001 | `specs/booking/SPEC-DIVE-BOOKING-CATALOG-001.md` | Draft | 0.15 |
| SPEC-DIVE-BOOKING-PUBLIC-001 | `specs/booking/SPEC-DIVE-BOOKING-PUBLIC-001.md` | Draft | 0.2 |
| SPEC-DIVE-BOOKING-SCHEDULING-001 | `specs/booking/SPEC-DIVE-BOOKING-SCHEDULING-001.md` | Accepted | 0.14 |
| SPEC-DIVE-BOOKING-WIDGET-001 | `specs/booking/SPEC-DIVE-BOOKING-WIDGET-001.md` | Draft | 0.2 |
| SPEC-DIVE-IAM-DASHBOARD-001 | `specs/iam/SPEC-DIVE-IAM-DASHBOARD-001.md` | Ready to start | 0.14 |
| SPEC-DIVE-IAM-INVITATIONS-001 | `specs/iam/SPEC-DIVE-IAM-INVITATIONS-001.md` | Ready to start | 0.1 |
| SPEC-DIVE-IAM-SUPPORT-001 | `specs/iam/SPEC-DIVE-IAM-SUPPORT-001.md` | Ready to start | 0.1 |
| SPEC-DIVE-ONBOARDING-ADMIN-001 | `specs/onboarding/SPEC-DIVE-ONBOARDING-ADMIN-001.md` | Ready to start | 0.3 |
| SPEC-DIVE-ONBOARDING-DELIVERY-001 | `specs/onboarding/SPEC-DIVE-ONBOARDING-DELIVERY-001.md` | Ready to start | 0.2 |
| SPEC-DIVE-ONBOARDING-GUIDANCE-001 | `specs/onboarding/SPEC-DIVE-ONBOARDING-GUIDANCE-001.md` | Deferred | 0.1 |

**Documented:** the map reflects the structural split and subsequent dated approvals recorded by the owners. Original approvals are retained; the new commercial direction is explicitly approved on 2026-09-30, not inferred from the map. No executed coverage is inferred. Requirement entry points are SPEC-DIVE-BOOKING-001, SPEC-DIVE-IAM-001 and SPEC-DIVE-ONBOARDING-001, each with its ownership table.

Notion indexes must show this map’s version. They must not invent an independent version sequence.

Notion pages are indexes only. They are not coverage evidence.

## Requirement ownership

| Owner | Declared IDs |
|---|---|
| [SPEC-DIVE-BOOKING-001](../booking/SPEC-DIVE-BOOKING-001.md) | `DIVE-BOOK-REQ-001`, `DIVE-BOOK-REQ-002`, `DIVE-BOOK-REQ-003`, `DIVE-BOOK-REQ-005`, `DIVE-BOOK-REQ-006`, `DIVE-BOOK-REQ-008`, `DIVE-BOOK-REQ-013`, `DIVE-BOOK-REQ-014`, `DIVE-BOOK-REQ-016`, `DIVE-BOOK-REQ-024`, `DIVE-BOOK-REQ-025`, `DIVE-BOOK-REQ-026`, `DIVE-BOOK-REQ-027`, `DIVE-BOOK-REQ-028`, `DIVE-BOOK-REQ-030`, `DIVE-BOOK-REQ-031`, `DIVE-BOOK-REQ-032`, `DIVE-BOOK-REQ-033`, `DIVE-BOOK-REQ-035`, `DIVE-BOOK-REQ-036`, `DIVE-BOOK-REQ-044`, `DIVE-BOOK-REQ-045`, `DIVE-BOOK-REQ-046`, `DIVE-BOOK-REQ-048`, `DIVE-BOOK-REQ-068`, `DIVE-BOOK-REQ-069`, `DIVE-BOOK-REQ-080` |
| [SPEC-DIVE-BOOKING-CAPABILITIES-001](../booking/SPEC-DIVE-BOOKING-CAPABILITIES-001.md) | `DIVE-BOOK-REQ-007`, `DIVE-BOOK-REQ-023`, `DIVE-BOOK-REQ-070`, `DIVE-BOOK-REQ-071`, `DIVE-BOOK-REQ-072`, `DIVE-BOOK-REQ-081` |
| [SPEC-DIVE-BOOKING-CATALOG-001](../booking/SPEC-DIVE-BOOKING-CATALOG-001.md) | `DIVE-BOOK-REQ-009`, `DIVE-BOOK-REQ-011`, `DIVE-BOOK-REQ-017`, `DIVE-BOOK-REQ-018`, `DIVE-BOOK-REQ-019`, `DIVE-BOOK-REQ-020`, `DIVE-BOOK-REQ-022`, `DIVE-BOOK-REQ-050`, `DIVE-BOOK-REQ-051`, `DIVE-BOOK-REQ-052`, `DIVE-BOOK-REQ-053`, `DIVE-BOOK-REQ-054`, `DIVE-BOOK-REQ-055`, `DIVE-BOOK-REQ-056`, `DIVE-BOOK-REQ-057`, `DIVE-BOOK-REQ-073`, `DIVE-BOOK-REQ-074`, `DIVE-BOOK-REQ-075`, `DIVE-BOOK-REQ-076`, `DIVE-BOOK-REQ-077`, `DIVE-BOOK-REQ-078`, `DIVE-BOOK-REQ-079` |
| [SPEC-DIVE-BOOKING-PUBLIC-001](../booking/SPEC-DIVE-BOOKING-PUBLIC-001.md) | `DIVE-BOOK-REQ-004`, `DIVE-BOOK-REQ-015`, `DIVE-BOOK-REQ-039`, `DIVE-BOOK-REQ-047`, `DIVE-BOOK-REQ-058`, `DIVE-BOOK-REQ-059`, `DIVE-BOOK-REQ-060`, `DIVE-BOOK-REQ-061`, `DIVE-BOOK-REQ-062`, `DIVE-BOOK-REQ-063`, `DIVE-BOOK-REQ-064`, `DIVE-BOOK-REQ-065`, `DIVE-BOOK-REQ-066`, `DIVE-BOOK-REQ-067` |
| [SPEC-DIVE-BOOKING-SCHEDULING-001](../booking/SPEC-DIVE-BOOKING-SCHEDULING-001.md) | `DIVE-BOOK-REQ-010`, `DIVE-BOOK-REQ-012`, `DIVE-BOOK-REQ-021`, `DIVE-BOOK-REQ-029`, `DIVE-BOOK-REQ-034`, `DIVE-BOOK-REQ-037`, `DIVE-BOOK-REQ-038`, `DIVE-BOOK-REQ-043`, `DIVE-BOOK-REQ-049` |
| [SPEC-DIVE-BOOKING-WIDGET-001](../booking/SPEC-DIVE-BOOKING-WIDGET-001.md) | `DIVE-BOOK-REQ-040`, `DIVE-BOOK-REQ-041`, `DIVE-BOOK-REQ-042` |
| [SPEC-DIVE-IAM-001](../iam/SPEC-DIVE-IAM-001.md) | `DIVE-IAM-REQ-001`, `DIVE-IAM-REQ-002`, `DIVE-IAM-REQ-003`, `DIVE-IAM-REQ-004`, `DIVE-IAM-REQ-005`, `DIVE-IAM-REQ-006`, `DIVE-IAM-REQ-007`, `DIVE-IAM-REQ-008`, `DIVE-IAM-REQ-009`, `DIVE-IAM-REQ-010`, `DIVE-IAM-REQ-011`, `DIVE-IAM-REQ-012`, `DIVE-IAM-REQ-013`, `DIVE-IAM-REQ-014`, `DIVE-IAM-REQ-015`, `DIVE-IAM-REQ-016`, `DIVE-IAM-REQ-018`, `DIVE-IAM-REQ-019`, `DIVE-IAM-REQ-021`, `DIVE-IAM-REQ-022`, `DIVE-IAM-REQ-023`, `DIVE-IAM-REQ-024`, `DIVE-IAM-REQ-025`, `DIVE-IAM-REQ-026`, `DIVE-IAM-REQ-027`, `DIVE-IAM-REQ-028` |
| [SPEC-DIVE-IAM-DASHBOARD-001](../iam/SPEC-DIVE-IAM-DASHBOARD-001.md) | `DIVE-IAM-REQ-029`, `DIVE-IAM-REQ-030`, `DIVE-IAM-REQ-031`, `DIVE-IAM-REQ-032` |
| [SPEC-DIVE-IAM-INVITATIONS-001](../iam/SPEC-DIVE-IAM-INVITATIONS-001.md) | `DIVE-IAM-REQ-017` |
| [SPEC-DIVE-IAM-SUPPORT-001](../iam/SPEC-DIVE-IAM-SUPPORT-001.md) | `DIVE-IAM-REQ-020` |
| [SPEC-DIVE-ONBOARDING-001](../onboarding/SPEC-DIVE-ONBOARDING-001.md) | `DIVE-ONB-REQ-001`, `DIVE-ONB-REQ-002`, `DIVE-ONB-REQ-003`, `DIVE-ONB-REQ-004`, `DIVE-ONB-REQ-006`, `DIVE-ONB-REQ-008`, `DIVE-ONB-REQ-009`, `DIVE-ONB-REQ-010`, `DIVE-ONB-REQ-011`, `DIVE-ONB-REQ-012`, `DIVE-ONB-REQ-013`, `DIVE-ONB-REQ-014`, `DIVE-ONB-REQ-015`, `DIVE-ONB-REQ-016`, `DIVE-ONB-REQ-017`, `DIVE-ONB-REQ-018`, `DIVE-ONB-REQ-019`, `DIVE-ONB-REQ-020`, `DIVE-ONB-REQ-021`, `DIVE-ONB-REQ-022`, `DIVE-ONB-REQ-023`, `DIVE-ONB-REQ-024`, `DIVE-ONB-REQ-025`, `DIVE-ONB-REQ-026`, `DIVE-ONB-REQ-035`, `DIVE-ONB-REQ-036`, `DIVE-ONB-REQ-037`, `DIVE-ONB-REQ-038`, `DIVE-ONB-REQ-041`, `DIVE-ONB-REQ-042`, `DIVE-ONB-REQ-047`, `DIVE-ONB-REQ-048`, `DIVE-ONB-REQ-049`, `DIVE-ONB-REQ-050` |
| [SPEC-DIVE-ONBOARDING-ADMIN-001](../onboarding/SPEC-DIVE-ONBOARDING-ADMIN-001.md) | `DIVE-ONB-REQ-005`, `DIVE-ONB-REQ-007`, `DIVE-ONB-REQ-039`, `DIVE-ONB-REQ-040`, `DIVE-ONB-REQ-043`, `DIVE-ONB-REQ-045`, `DIVE-ONB-REQ-046` |
| [SPEC-DIVE-ONBOARDING-DELIVERY-001](../onboarding/SPEC-DIVE-ONBOARDING-DELIVERY-001.md) | `DIVE-ONB-REQ-044` |
| [SPEC-DIVE-ONBOARDING-GUIDANCE-001](../onboarding/SPEC-DIVE-ONBOARDING-GUIDANCE-001.md) | `DIVE-ONB-REQ-027`, `DIVE-ONB-REQ-028`, `DIVE-ONB-REQ-029`, `DIVE-ONB-REQ-030`, `DIVE-ONB-REQ-031`, `DIVE-ONB-REQ-032`, `DIVE-ONB-REQ-033`, `DIVE-ONB-REQ-034` |

IDs are not renumbered or restated. Draft editing, staff command, token-replay and expanded-scheduling proposals do not gain approval through this ownership map.

## Requirement groups

### Booking — `DIVE-BOOK-REQ-001` … `081`

| Group | IDs | Tests (expected) | Evidence |
|---|---|---|---|
| Isolation and identity | 001–008 | `packages/database/test/integration/*.integration.test.ts` | MT-SPIKE-001 |
| Catalog and model | 009–016 | domain unit tests | implementation PR |
| Lifecycle | 017–024 | booking integration | implementation PR |
| Capacity and concurrency | 025–032 | `tests/concurrency`, SPIKE-DIVE-001 | `evidence/spikes/SPIKE-DIVE-001/` |
| Mutation | 033–036 | booking integration | implementation PR |
| Channels and widget | 037–042 | SPIKE-DIVE-003, e2e | `evidence/spikes/SPIKE-DIVE-003/` |
| Delivery and privacy | 043–048 | outbox, i18n, privacy review | `evidence/` + dated review |
| Catalog HTTP and center-scoped dashboard catalog | 049–057 | catalog API tests in the implementation PR | implementation PR |
| Activity editing | `DIVE-BOOK-REQ-050`, `056`, `078`; [catalog editing contract](../booking/SPEC-DIVE-BOOKING-CATALOG-001.md#activity-editing), [accepted concrete transport](../booking/SPEC-DIVE-BOOKING-CATALOG-001.md#accepted-grouped-put-and-clearing-contract) and [accepted revision/migration contract](../booking/SPEC-DIVE-BOOKING-CATALOG-001.md#accepted-revision-storage-and-migration) | [HTTP/concurrency](../../apps/api/test/iam.e2e-spec.ts), [validation](../../apps/api/src/catalog/catalog.validation.spec.ts), [migration/rollback](../../packages/database/test/integration/migrations.integration.test.ts), [atomic persistence](../../packages/database/test/integration/booking-catalog.integration.test.ts), [security inventory](../../packages/database/test/integration/product-security.integration.test.ts), [web drafts/recovery](../../apps/web/src/features/dashboard/catalog-panel.test.tsx), [web transport](../../apps/web/src/features/dashboard/catalog-api.test.ts) and [BFF transport](../../apps/web/src/lib/dashboard-bff.test.ts) | Documented: local synthetic-data checks executed 2026-10-01 under bounded issue-free product-owner authorization; existing implementation inspected and lost-response regression coverage added. Browser verification incomplete due to navigation timeout; no deployment or artifact promotion |
| Catalog language configuration and presentation fallback | `DIVE-BOOK-REQ-009`, `050..056`; [language policy](../booking/SPEC-DIVE-BOOKING-CATALOG-001.md#activity-languages-and-fallback) and [approved initial-configuration contract](../booking/SPEC-DIVE-BOOKING-CATALOG-001.md#initial-center-catalog-language-contract) | [API behavior and contention](../../apps/api/test/iam.e2e-spec.ts), [input validation](../../apps/api/src/catalog/catalog.validation.spec.ts), [persistence and rollback](../../packages/database/test/integration/booking-catalog.integration.test.ts), [migration](../../packages/database/test/integration/migrations.integration.test.ts), [security inventory](../../packages/database/test/integration/product-security.integration.test.ts), [command context](../../packages/database/test/integration/tenant-command-context.integration.test.ts), [pooled unit of work](../../packages/database/test/integration/product-unit-of-work.integration.test.ts), [web client](../../apps/web/src/features/dashboard/catalog-api.test.ts) and [web selection/presentation](../../apps/web/src/features/dashboard/catalog-panel.test.tsx) | Documented: backend PostgreSQL 18 and web checks executed locally, 2026-09-30; deployed-database verification remains pending. The reported empty catalog is not a production-data measurement |
| Catalog page pagination, response DTO, and physical persistence naming | 049–057; ADR-DIVE-014 | catalog contract and migration tests in the implementation PR | implementation PR |
| Public booking lifecycle and rejection | 068–069 | booking integration and rejection contract tests | implementation PR |
| Public booking capabilities | 070–072 | public capability contract tests | implementation PR |
| Commercial center/activity profiles, language guarantees, price, policies, Published editing and public composition | 073–079; [catalog owner](../booking/SPEC-DIVE-BOOKING-CATALOG-001.md#commercial-profile-contract), [accepted refinements](../booking/SPEC-DIVE-BOOKING-CATALOG-001.md#accepted-commercial-refinements) and [IAM grants](../iam/SPEC-DIVE-IAM-001.md#commercial-profile-and-policy-permissions) | Documented: expected scenarios and remaining implementation contracts in the owners | product direction approved 2026-09-30 and seven-block refinements approved 2026-10-01 in the owners' provenance; no new executed coverage |
| Historical commercial conditions and policy-conditioned cancellation | 080–081; [accepted price/revision](../booking/SPEC-DIVE-BOOKING-001.md#accepted-price-and-offer-revision) and [cancellation owner](../booking/SPEC-DIVE-BOOKING-CAPABILITIES-001.md#policy-conditioned-cancellation) | Documented: expected scenarios in the owners; exact snapshot/acceptance, policy/errors, state and migration contracts remain open; cutoff unit/equality and initial contact-only fallback selected | product direction approved 2026-09-30 and seven-block technical refinements approved 2026-10-01 in the owners' provenance; no new executed coverage |
| Public availability query and presentation closures | ADR-DIVE-011 Draft; no new SPEC IDs yet | none until ADR approved | none |
| Public create-booking | 058–067 | public-create API, idempotency, origin, channel-policy, token, and contention tests in implementation PR | implementation PR |
| Activity scheduling, recurrence, unscheduled booking, calendar, public projection, and staff mutation reconciliation | `ADR-DIVE-015`; affected existing booking IDs in SPEC-DIVE-BOOKING-SCHEDULING-001; accepted configuration model and [delivery/local-time refinement](../booking/SPEC-DIVE-BOOKING-SCHEDULING-001.md#accepted-delivery-sequence-and-initial-local-time-handling) | Documented: expanded-behavior tests require closure of the owner's open implementation contracts | model accepted 2026-09-30 and delivery/local-time refinement approved 2026-10-01 in the owner's provenance; no executed coverage from this documentation change |
| Calendar phase-two read scope | `DIVE-BOOK-REQ-021`, `029`, `043`, `049`; [scheduling read decisions](../booking/SPEC-DIVE-BOOKING-SCHEDULING-001.md#calendar-phase-two-read-scope), [concrete refinements](../booking/SPEC-DIVE-BOOKING-SCHEDULING-001.md#concrete-phase-two-read-refinements), [implementation conventions](../booking/SPEC-DIVE-BOOKING-SCHEDULING-001.md#calendar-phase-two-implementation-conventions) and [IAM read/contact grants](../iam/SPEC-DIVE-IAM-001.md#calendar-phase-two-read-permissions) | Documented: expected checks and remaining implementation gates in the owners | Initial scope, subsequent concrete-read and implementation-convention approvals/registration authorizations, product owner, 2026-10-01; no phase-two implementation or executed coverage inferred |
| Calendar phase-two remaining-contract solutions | `DIVE-BOOK-REQ-021`, `029`, `043`, `049`; [confirmed read/validation/query/URL solutions](../booking/SPEC-DIVE-BOOKING-SCHEDULING-001.md#calendar-phase-two-remaining-contract-solutions); `DIVE-IAM-REQ-015`, `025`, `028`; [confirmed read-audit contract](../iam/SPEC-DIVE-IAM-001.md#calendar-phase-two-read-audit-proposal) | Documented: bounded coverage through [read use cases and HTTP responses](../../apps/api/test/booking-read.e2e-spec.ts), [query validation](../../apps/api/src/booking/reads/booking-read.validation.spec.ts), [role grants](../../apps/api/src/iam/iam.roles.spec.ts), [route admission](../../apps/api/src/iam/application-admission.composition.spec.ts), [OpenAPI](../../apps/api/src/app/openapi.spec.ts), [command context](../../packages/database/test/integration/tenant-command-context.integration.test.ts), [function hardening](../../packages/database/test/integration/product-security.integration.test.ts), [frontend reads and URL normalization](../../apps/web/src/features/dashboard/calendar-data.test.ts), [calendar and contact lifecycle](../../apps/web/src/features/dashboard/dashboard-calendar.test.tsx), [BFF enumeration](../../apps/web/src/lib/dashboard-bff.test.ts) and [actual Next.js/API/PostgreSQL reads](../../apps/api/test/bff-next.e2e-spec.ts) | Product-owner confirmation and bounded issue-free implementation authorization, including frontend continuation, 2026-10-01; local synthetic-data backend, frontend and BFF integration checks executed. Complete visual, browser/provider integration and review remain pending; no artifact status promotion or publication |

`DIVE-BOOK-REQ-003` is the capacity invariant. `DIVE-BOOK-REQ-029` states that capacity lives on the slot.
**Documented:** `ADR-DIVE-015` and `SPEC-DIVE-BOOKING-SCHEDULING-001` own the explicitly accepted configuration model and architectural boundaries. `SPEC-DIVE-BOOKING-001` remains the Draft entry point for its own declared requirements; it does not make the accepted scheduling owner Draft. Open implementation contracts remain in that owner. Existing fixed-time implementation coverage remains valid but is not coverage of the expanded model.

### IAM — `DIVE-IAM-REQ-001` … `032`

Coverage is recorded in the current-coverage table below. Cross-tenant cases also map to `MT-REQ-*` and remain separate from `DIVE-*` results. Public-token and support-access evidence is not yet available in this vertical.

Dashboard tenant-context requirements `DIVE-IAM-REQ-029..032` remain Ready to start. `ADR-DIVE-008` and `ADR-DIVE-017` close reserved keys, database-resolved exact CORS, mandatory environment host configuration, `center.read`, the Owner/Admin-only active/disabled center-entry lifecycle with immutable keys, idempotent transitions, scoped disablement, fail-closed resolver errors, and audit, the absolute post-bootstrap center handoff, one Next.js deployment for canonical authentication and center hosts, and the MVP ban on center-entry without `Origin`. `SPEC-DIVE-BOOKING-001` and its declared owners keep the implemented US-08 fixed-time catalog contract; each owner's header and the artifact map define its status. ADR-DIVE-014 owns the fixed-time catalog decisions, while the accepted expanded model is owned by ADR-DIVE-015 and SPEC-DIVE-BOOKING-SCHEDULING-001. Backend and web-consumer coverage for `DIVE-IAM-REQ-032` is recorded below; deployed-host activation and real Clerk return evidence remain incomplete.

**Documented:** the [authorization-capability/application-scope clarification](../iam/SPEC-DIVE-IAM-DASHBOARD-001.md#authorization-capability-and-application-scope) for `DIVE-IAM-REQ-032` records the current product restriction and future direction explicitly confirmed as Documented on 2026-09-30. Its [open implementation questions](../iam/SPEC-DIVE-IAM-DASHBOARD-001.md#implementation-questions-and-current-limits) remain unresolved and linked for future work. Existing catalog and center-entry coverage does not establish application-wide conformance; this documentation adds no executed proof, activates no multi-center administration surface and changes no artifact status.

**Documented -- Design relationships only:** [dashboard application scope](../iam/SPEC-DIVE-IAM-DASHBOARD-001.md#proposed-application-scope-contract), [public-operation scope](../booking/SPEC-DIVE-BOOKING-PUBLIC-001.md#proposed-public-operation-scope-contract) and [widget embedding](../booking/SPEC-DIVE-BOOKING-WIDGET-001.md#proposed-widget-scope-and-embedding-contract) retain separate identity/channel admission and security/activation gates. The dashboard owner records the product-owner approval of the [simple BFF](../iam/SPEC-DIVE-IAM-DASHBOARD-001.md#simple-bff-contract), [service-admission/bootstrap closure](../iam/SPEC-DIVE-IAM-DASHBOARD-001.md#approved-service-admission-and-bootstrap) and [omission-prevention controls](../iam/SPEC-DIVE-IAM-DASHBOARD-001.md#avoiding-route-omissions) on 2026-09-30; concrete deployment configuration, route inventory and proof remain incomplete, and other linked proposals remain Draft. These pointers add no product implementation authorization or executed coverage.

**Documented -- Operational decision and proposal relationships:** the dashboard owner records the [protocol/browser-boundary approval](../iam/SPEC-DIVE-IAM-DASHBOARD-001.md#approved-bff-protocol-and-browser-boundary) and [approved credential procedure](../iam/SPEC-DIVE-IAM-DASHBOARD-001.md#approved-service-credential-operations), following explicit product-owner approval in the implementation-planning chat on 2026-09-30. Its [listed exception classifications](../iam/SPEC-DIVE-IAM-DASHBOARD-001.md#proposed-exception-inventory-with-normative-authority) are explicitly approved by the product owner in the BFF conformance and agent-configuration review chat on 2026-10-01; separate root/framework/rollout proposals remain Draft. These pointers record authority/design relationships, not deployed guarantees or additional executed coverage for `DIVE-IAM-REQ-032`.

### Onboarding — `DIVE-ONB-REQ-001` … `050`

| Group | IDs | Tests (expected) | Evidence |
|---|---|---|---|
| Controlled bootstrap and authority | 001–009 | domain/API authorization, invitation, expiry, rate-limit, and non-disclosure tests | implementation PR |
| Invited self bootstrap | 010–019 | no-assisted-path, transaction, rollback, outbox, Owner activation, idempotency, and concurrency tests | Partial in PR #78 plus residual integration tests: atomic success, Owner activation, replay, concurrency, induced rollback, and terminal/wrong-kind denial are represented by `packages/database/test/integration/onboarding-invitations.integration.test.ts` |
| Fields and completion boundary | 020–026, 035 | validation, time-zone, locale, Owner-mode, and dashboard-landing tests | Partial in PR #78 plus the center-entry backend: setup validation and the legacy `/dashboard` redirect exist; exact center-origin context issuance is demonstrated, but the setup client does not yet navigate to that origin |
| Guided onboarding | 027–034 | Deferred; no implementation tests until a future story reactivates and redefines the scope | none |
| Acceptance matrix | 036 | evidence mapped to every applicable row above | implementation PR |
| Login and bootstrap HTTP boundary | 037–041 | Clerk invite-only, application-invitation custom-flow, mandatory active-session sign-out and ticket reauthentication, ticket-redaction, platform-capability, abuse/idempotency, rollout, safe-state, and completion contract tests; MFA is out of scope for issue #72 | implementation PR plus Clerk Development evidence; future step-up remains governed by `ADR-DIVE-006` |
| Center entry, provider delivery, persistence, and retention | 042–047 | `centerKey` mapping/rollback, pre-tenant outbox, Clerk create/revoke/reissue/reconciliation, delivery-state transitions, retry/dead-letter, valid and invalid `Retry-After` handling, redirect, retention, audit, and event contract tests | Partial in PR #78 plus residual backend tests: mapping, dynamic exact-origin resolution, completion audit/event, provider delivery, and induced completion rollback are represented; deployed DNS/TLS/Clerk readiness remains an activation evidence gap |
| Revocation and no-active-membership safety | 048–050 | stale-handle denial, renewal denial, unrelated-membership continuity, neutral UI, and non-disclosure tests | Demonstrated by `apps/api/test/iam.e2e-spec.ts`, `packages/database/test/integration/iam-api.integration.test.ts`, `apps/web/src/features/dashboard/dashboard-tenant-context.test.tsx`, and `apps/web/src/features/dashboard/tenant-context.test.ts`; center-entry denial uses the same non-disclosing contract |

**Issue #73 reconciliation (Derived, 2026-09-29):** PR #78 contains the core self-bootstrap command and its persistence path. Residual integration tests represent induced transaction rollback and rejection of terminal or ordinary IAM grants without tenant side effects, and the existing IAM/dashboard paths plus the neutral no-access test cover `DIVE-ONB-REQ-048..050`. The backend now resolves exact center origins from trusted mappings, implements `POST /v1/me/center-entry-contexts` with current membership, `center.read`, and center-scope checks, and implements the approved Owner/Admin-only active/disabled lifecycle with immutable keys and audit. The setup client still lacks the absolute first-center navigation, which remains outside the issue #73 backend brief. This note records coverage only; it does not change requirement text or promote an artifact.

`SPEC-DIVE-ONBOARDING-001` and `ADR-DIVE-013` are Ready to start for `DIVE-ONB-REQ-001..026` and `035..050`; guided-onboarding requirements `027..034` are Deferred. Current US-19 uses a simple setup form and selects no tour library, guide state, guide analytics, or guidance rollout. Option B replaces the application-owned bearer/email design with Clerk Application Invitations plus a PostgreSQL bootstrap grant. Production invitation administration remains application-owned through the protected platform API, authoritative grant transaction, pre-tenant outbox, and post-commit worker; no dedicated administration UI is required initially. Clerk Dashboard is diagnostic/provider tooling rather than the ordinary issuance channel and cannot create bootstrap authority. Platform capability assignment, administration abuse/idempotency/rollout, and worker retry/dead-letter/reconciliation are approved implementation relationships. MFA is out of scope for issue #72; future step-up remains governed by `ADR-DIVE-006`. US-19 remains limited to invited self bootstrap; assisted provisioning and Clerk Organizations remain outside the story. The bootstrap-grant relationship is explicitly separate from ordinary tenant invitations governed by `SPEC-DIVE-IAM-001` `DIVE-IAM-REQ-017` and `ADR-DIVE-004`; neither flow can consume or activate the other. `specs/spikes/SPIKE-DIVE-004/results.md` owns the bounded Clerk Development evidence for `ignoreExisting`, new/existing identities, active-session states, invite-only behavior, and redirect/ticket cleanup. Its direct provider calls are measurement-only; production invitation delivery remains assigned to the post-commit pre-tenant outbox worker. Remaining provider lifecycle behavior stays in implementation tests unless the spike exposes an architectural contradiction. `SPEC-DIVE-IAM-001` only clarifies the authority boundary; this TRACE relationship is not implementation coverage. Implementation authority is active for reversible work, subject to the onboarding activation gates.

### Trial access — `DIVE-TRIAL-REQ-001` … `018`

`SPEC-DIVE-TRIAL-001` and `ADR-DIVE-016` are Draft. They record the product-owner-approved direction from issue #84 for an invite-only, platform-configured trial beginning after successful bootstrap. Exact duration representation and bounds, expiry handling for already-committed effects, rights/export execution, persistence labels, API/events, and privacy validation remain open; no implementation authority or coverage is claimed.

### Public product landing — `DIVE-MKT-REQ-001` … `012`

| Group | IDs | Tests (expected) | Evidence |
|---|---|---|---|
| Canonical product host and fail-closed routing | 001–003 | product-host, `www` redirect, unknown/center-like/cross-environment host tests | implementation PR |
| Public tenant-neutral behavior and contact action | 004–009 | page/component tests for contact-only behavior and absence of auth/signup/prices/tracking | implementation PR |
| Content, responsive/keyboard behavior, and indexing metadata | 010–012 | page metadata, accessibility-focused, keyboard, and responsive checks | implementation PR |

`SPEC-DIVE-MARKETING-001` is Ready to start for the initial Spanish product landing. It adds no API, persistence, tenant selector, authentication entry, signup, price presentation, lead form, or marketing tracker. Pricing remains a future product decision.

### Multi-tenant — `MT-REQ-001` … `010`

Owned by `specs/multitenancy/MT-SPIKE-001-requirements.md`. Scenario matrix: `specs/multitenancy/MT-SPIKE-001-traceability.md`. Do not merge into `DIVE-*` results. Do not treat a file mapping as coverage.

### Operations — `DIVE-OPS-REQ-001` … `009`

Deferred. Not required to start the booking MVP.

### Baseline channels deferred from MT-SPIKE-001 (Option B)

Not copied as requirement text. Owners:

| Channel | Owner |
|---|---|
| Cache, files, search | SPEC/spike that introduces the channel (ID not invented) |
| Export, deletion | Future rights/privacy SPEC; until opened, security/privacy baseline + product-profile privacy gate |
| Restore | Future recovery SPEC; until opened, operations-quality-recovery baseline |
| Support access | SPEC-DIVE-IAM-SUPPORT-001 |
| Noisy neighbor | Future operations SPEC; until opened, operations-quality-recovery baseline |

These rows block declaring the reusable baseline fully adopted. They do not invalidate the accepted PostgreSQL/Drizzle persistence result.

### MT-SPIKE-001 activation conditions

| Condition | Evidence owner | Gate |
|---|---|---|
| `MT-COND-IAM-001` | First IAM/API vertical | Before production traffic or production outbox emission |
| `MT-COND-WORKER-001` | First real outbox worker | Before external effects |

Owning verticals must link their tests and evidence back to the existing `MT-SC-*` rows; they must not duplicate or silently weaken `MT-REQ-*`.

## Maintenance rule

TRACE records relationships and coverage. It never restates requirement text.

Each functional PR must list:

- implemented/affected requirement IDs
- applicable ADR(s)
- tests
- evidence when applicable
- TRACE updates when coverage changes

Example:

```text
Implements: DIVE-BOOK-REQ-003, DIVE-BOOK-REQ-025, DIVE-BOOK-REQ-028
Decision: ADR-DIVE-001, ADR-DIVE-002
Tests: tests/concurrency/last-seat.spec.ts
Evidence: evidence/spikes/SPIKE-DIVE-001/
Traceability: TRACE-DIVE-MVP-001
```

## Current coverage

The first IAM/API vertical is partially implemented in `apps/api`, `packages/identity`, and `packages/database`. It is not full conformance with `SPEC-DIVE-IAM-001`.

**Documented -- JWT policy implementation and activation gap, 2026-10-01:** the approved [IAM validity boundary](../iam/SPEC-DIVE-IAM-001.md#dashboard-jwt-validity-boundary), affecting `DIVE-IAM-REQ-004`, `016`, `022`, is implemented locally. Executed [identity adapter tests](../../packages/identity/src/clerk.spec.ts) and [JWT verifier tests](../../packages/identity/src/clerk-token-verifier.spec.ts) cover status-free authentication, token validity and acceptance followed by expiry of a frozen token using the real SDK with local signing keys. [IAM sandbox tests](../../apps/api/test/iam.clerk.sandbox.e2e-spec.ts) and [BFF sandbox tests](../../apps/api/test/bff.clerk.sandbox.e2e-spec.ts) are updated but not executed under this policy. Actual provider token lifetime/tolerance, renewal cessation after revocation/blocking/deletion and the five-minute activation guarantee remain unverified; historical provider evidence does not close them.

**Documented -- Verified-email boundary coverage, 2026-10-01:** the approved [IAM lookup boundary](../iam/SPEC-DIVE-IAM-001.md#verified-email-lookup-boundary), `DIVE-IAM-REQ-004`, is implemented through an explicit provider-neutral operation and onboarding completion. Executed [identity adapter tests](../../packages/identity/src/clerk.spec.ts) and [onboarding service tests](../../apps/api/src/onboarding/tenant-bootstrap.service.spec.ts) cover authenticated-identity binding, provider-only verified data, absence of status checks and provider-failure denial before bootstrap effects; [onboarding HTTP tests](../../apps/api/test/onboarding.e2e-spec.ts) retain verified-email matching and atomic completion proof with a deterministic provider. Ordinary IAM invitation response still has only its existing persistence command, not a connected API use case; no new invitation endpoint or real-provider email proof is claimed.

### Demonstrated coverage

**Documented:** proof paths below identify existing assertions, not commands rerun in this documentation change. File existence alone is not conformance; provider/deployed readiness and MT activation conditions remain separate. Bootstrap replay tests do not close the Draft ambiguity when multiple pending/consumed grants coexist.

The Proposed reconciliation for original-emission credential replay (`DIVE-BOOK-REQ-063`) and consumed-cancellation result recovery (`DIVE-BOOK-REQ-023`, `071`) is Draft and not demonstrated by existing tests of the historical contracts.

| Slice | IDs | Proof |
|---|---|---|
| Identity resolution, independent memberships, issuer + subject, and requested-tenant enforcement | `DIVE-IAM-REQ-001`, `002`, `005`, `006` | `packages/database/test/integration/iam-api.integration.test.ts`, `apps/api/test/iam.e2e-spec.ts` |
| Explicit Phase 1 role grants, explicit Operations Lead center scope with missing-scope denial, inactive membership denial, and disabled external-collaborator fail-closed behavior | `DIVE-IAM-REQ-003`, `010..014`, `023` | `packages/identity/src/index.ts`, `apps/api/src/iam/iam.roles.spec.ts`, `apps/api/test/iam.e2e-spec.ts` |
| Provider-neutral identity assertion; invitation and pending-membership lifecycle; no-bearer retries; deliberate reissue; concurrent acceptance/reissue; non-disclosing scope denial; transactional audit/outbox | `DIVE-IAM-REQ-005`, `017`, `024`, `025` | `apps/api/src/iam/iam.identity.spec.ts`, `packages/database/test/integration/iam-invitations.integration.test.ts` |
| Command-only membership mutation, last-owner protection, and atomic disable audit/outbox | `DIVE-IAM-REQ-018`, `025` | `apps/api/test/iam.e2e-spec.ts`, `packages/database/test/integration/iam-api.integration.test.ts`, `packages/database/test/integration/migrations.integration.test.ts` |
| Non-disclosing errors for the exposed center, membership-disable, and invitation persistence paths | `DIVE-IAM-REQ-024` | `apps/api/test/iam.e2e-spec.ts`, `packages/database/test/integration/iam-invitations.integration.test.ts` |
| Provider-neutral assurance and ordinary authentication without a verified address | `DIVE-IAM-REQ-005`, `019` | `packages/identity/src/clerk.spec.ts`, `apps/api/src/iam/iam.identity.spec.ts`, `apps/api/test/iam.e2e-spec.ts` |
| Authenticated self-bootstrap command, closed setup input, verified-email grant resolution, atomic tenant/center/Owner creation, idempotency, concurrency, redemption rate limit, center-key mapping, completion audit, and safe completion event | `DIVE-ONB-REQ-004`, `006`, `008..009`, `012`, `018..021`, `041..042`, `047` | Partial: `apps/api/src/onboarding/tenant-bootstrap.validation.spec.ts`, `apps/api/src/onboarding/tenant-bootstrap.service.spec.ts`, `apps/api/test/onboarding.e2e-spec.ts`, `packages/database/test/integration/onboarding-invitations.integration.test.ts`, `packages/database/test/integration/product-security.integration.test.ts`; rollback and terminal/wrong-kind denial assertions exist in onboarding-invitations.integration.test.ts; `apps/web/src/features/bootstrap/bootstrap-setup.test.tsx` covers the absolute first-center web handoff; deployed readiness remains open |
| Official raw-body webhook verification plus database tenant resolution, idempotency, no grants, no authorization mutation, audit, and safe outbox signals | `DIVE-IAM-REQ-021` | `packages/identity/src/clerk-webhook.spec.ts`, `packages/database/test/integration/iam-identity-webhooks.integration.test.ts` |
| Dashboard tenant-context contract and frontend consumer boundary | `DIVE-IAM-REQ-029..031` | `ADR-DIVE-008` tenant-context contract; `ADR-DIVE-009` frontend state boundary; server authorization proof: `apps/api/test/iam.e2e-spec.ts`, `packages/database/test/integration/iam-api.integration.test.ts`, `packages/database/test/integration/migrations.integration.test.ts`; web consumer proof: `apps/web/src/features/dashboard/tenant-context.test.ts`, `apps/web/src/features/dashboard/dashboard-tenant-context.test.tsx` |
| Center-host web routing, initial handle issuance without workspace enumeration, single returned-center read, session/context cleanup and preserved sign-in destination | `DIVE-IAM-REQ-029..032` | Documented: `apps/web/src/proxy.test.ts`, `apps/web/src/lib/application-hosts.test.ts`, `apps/web/src/features/dashboard/tenant-context.test.ts`, `apps/web/src/features/dashboard/dashboard-tenant-context.test.tsx`, `apps/web/src/features/dashboard/clerk-dashboard-session.test.tsx`; the host test also exercises the installed Clerk redirect generator, while proxy tests distinguish resolver unavailability from denied mappings. These checks do not prove live Clerk or deployed DNS/TLS; the unresolved satellite configuration is recorded in ADR-DIVE-017 |
| BFF-associated center and catalog resource correspondence for multi-center identities, non-disclosing denial and absence of denied-write effects | `DIVE-IAM-REQ-032` | Documented: `apps/api/src/catalog/catalog-access.service.spec.ts`, `apps/api/src/iam/tenant-context/tenant-context.service.spec.ts`, `apps/api/test/iam.e2e-spec.ts`; HTTP/PostgreSQL cases cover same-tenant A-to-B and cross-tenant denial across settings, activities, slots and channels without changing tenant-scoped handles. Scope authority: [selected dashboard BFF contract](../iam/SPEC-DIVE-IAM-DASHBOARD-001.md#simple-bff-contract). |
| Dashboard permission projection for the resolved center | `DIVE-IAM-REQ-030..032` | Documented: product-owner approval of the concrete capability HTTP contract and bounded local continuation on 2026-10-01 in the home-planning conversation (VS Code session `0243d54d-0bf1-42fa-b4d0-a2befc6d694e`); executable pointers: `apps/api/src/catalog/catalog-access.service.spec.ts`, `apps/api/src/app/openapi.spec.ts`, `apps/api/test/iam.e2e-spec.ts`, `apps/api/test/bff-next.e2e-spec.ts`, `apps/web/src/lib/dashboard-bff.test.ts`. Coverage is the permission projection and BFF transport, not implementation or mobile/visual verification of the home. |
| Center home consumer, future-session projection and permission-aware navigation | `DIVE-IAM-REQ-030..032`; `DIVE-BOOK-REQ-049` | Documented: [approved center home scope](../iam/SPEC-DIVE-IAM-DASHBOARD-001.md#center-application-home). Partial consumer coverage: `apps/web/src/features/dashboard/dashboard-home.test.tsx`, `apps/web/src/features/dashboard/calendar-data.test.ts`, `apps/web/src/features/dashboard/catalog-api.test.ts`, `apps/web/src/features/dashboard/catalog-panel.test.tsx`, `apps/web/src/features/dashboard/dashboard-tenant-context.test.tsx`; these checks cover the local home increment and its existing scoped catalog boundary, not the whole scheduling contract. Live authentication and responsive visual verification remain unproven by these tests. |
| Code-owned exception inventory, real AppModule global admission and service/user separation | `DIVE-IAM-REQ-030..032` | Documented: `apps/api/src/iam/application-admission.composition.spec.ts`, `apps/api/src/iam/application-admission.guard.spec.ts`, `apps/api/src/common/auth/bff-service-credential.spec.ts`, `apps/api/test/iam.e2e-spec.ts`; current controller/direct-adapter discovery, metadata omission/conflict, exact exceptions, direct-API rejection, implicit HEAD rejection and configured verifier rotation are executable checks, not proof for every possible middleware or deployed instance. |
| Same-origin BFF transport and current dashboard consumers | `DIVE-IAM-REQ-029..032` | Documented: `apps/web/src/lib/dashboard-bff.test.ts`, `apps/web/src/features/dashboard/tenant-context.test.ts`, `apps/web/src/features/dashboard/dashboard-tenant-context.test.tsx`, `apps/web/src/proxy.test.ts`; handler/client checks include retained-context revalidation, tampering, redirects, response redaction, service-error separation, cancellation and deadlines without automatic mutation retry. |
| Actual Next.js to AppModule to PostgreSQL synthetic integration and local hop measurement | `DIVE-IAM-REQ-030..032` | Documented: `apps/api/test/bff-next.e2e-spec.ts`, included by the existing API e2e runner and integration CI command. Executed local cases cover scoped bootstrap/list/read/write, cross-center/tenant mutation non-effects, disabled mapping ownership, revocation and injected transport faults. Measurement uses deterministic identity and loopback development servers, without production budgets or provider-latency claims; GitHub CI itself was not executed in this chat. |
| Retained center mapping reads, privileged-selector restriction and pooled-context cleanup | `MT-REQ-004..005`, `010` | Documented: `packages/database/test/integration/iam-api.integration.test.ts`, `packages/database/test/integration/product-security.integration.test.ts`, `packages/database/test/integration/product-unit-of-work.integration.test.ts`; these MT results remain separate from application center-scope proof. |
| Exact center-origin resolution, center-entry context issuance, `center.read`, center scope, dynamic CORS failure behavior, and non-disclosing cross-tenant denial | `DIVE-IAM-REQ-032`; `MT-REQ-004..005`, `010` | `apps/api/src/common/tenant-context/tenant-context.crypto.spec.ts`, `apps/api/src/common/tenant-context/dashboard-cors.spec.ts`, `apps/api/src/iam/tenant-context/tenant-context.service.spec.ts`, `apps/api/test/iam.e2e-spec.ts`, `packages/database/test/integration/iam-api.integration.test.ts`, `packages/database/test/integration/migrations.integration.test.ts` |
| Center-entry lifecycle authority, active/disabled resolution, idempotent retries, immutable-key preservation, tenant-scoped audit, and manager/cross-tenant denial | `DIVE-IAM-REQ-003`, `023`, `025`, `032`; `MT-REQ-004..005`, `010` | `packages/identity/src/index.ts`, `apps/api/src/iam/iam.roles.spec.ts`, `apps/api/src/iam/iam.audit-contracts.spec.ts`, `apps/api/test/iam.e2e-spec.ts`, `packages/database/test/integration/iam-api.integration.test.ts`, `packages/database/drizzle/0000_baseline.sql` |
| Forced tenant-context RLS and tenant-scoped issue, resolve, revoke, cleanup, and session-revocation commands | `MT-REQ-002`, `004..006`, `010` | `packages/database/test/integration/iam-api.integration.test.ts`, `packages/database/test/integration/iam-identity-webhooks.integration.test.ts`, `packages/database/test/integration/migrations.integration.test.ts` |
| Center-scoped catalog lifecycle, pagination, time filters, and DTO/error contract | `DIVE-BOOK-REQ-049..057` | `apps/api/test/iam.e2e-spec.ts`, `apps/api/src/catalog/catalog.time.spec.ts`, `packages/database/test/integration/migrations.integration.test.ts`, `apps/web/src/features/dashboard/catalog-api.test.ts`, `apps/web/src/features/dashboard/catalog-panel.test.tsx` |
| Bounded activity content editing and revision/audit integration | `DIVE-BOOK-REQ-009`, `050..051`, `053`, `056` | Documented: [activity-edit owner](../booking/SPEC-DIVE-BOOKING-CATALOG-001.md#activity-editing); `apps/api/src/catalog/catalog.validation.spec.ts`, `apps/api/test/iam.e2e-spec.ts`, `packages/database/test/integration/booking-catalog.integration.test.ts`, `packages/database/test/integration/migrations.integration.test.ts`, `apps/web/src/features/dashboard/catalog-api.test.ts`, `apps/web/src/features/dashboard/catalog-panel.test.tsx`. These assertions cover the current-field edit increment, not the broader commercial model or a deployed migration/rollback. |
| Calendar/booking/contact read API, permission grants and audit boundary | `DIVE-BOOK-REQ-021`, `029`, `043`, `049`; `DIVE-IAM-REQ-003`, `015`, `025`, `028`, `030..032` | Documented: [Scheduling read owner](../booking/SPEC-DIVE-BOOKING-SCHEDULING-001.md#calendar-phase-two-read-scope) and [IAM audit owner](../iam/SPEC-DIVE-IAM-001.md#calendar-phase-two-read-audit-proposal); `apps/api/test/booking-read.e2e-spec.ts`, `apps/api/src/booking/reads/booking-read.validation.spec.ts`, `apps/api/src/iam/iam.roles.spec.ts`, `apps/api/src/app/openapi.spec.ts`, `apps/api/src/iam/application-admission.composition.spec.ts`. Scope is these three read operations, not complete sensitive-operation auditing. |
| Calendar phase-two browser consumer and enumerated BFF reads | `DIVE-BOOK-REQ-043`, `049`; `DIVE-IAM-REQ-030..032` | Documented: [Scheduling consumer owner](../booking/SPEC-DIVE-BOOKING-SCHEDULING-001.md#calendar-phase-two-remaining-contract-solutions); `apps/web/src/lib/dashboard-bff.test.ts`, `apps/web/src/features/dashboard/catalog-api.test.ts`, `apps/web/src/features/dashboard/calendar-data.test.ts`, `apps/web/src/features/dashboard/dashboard-calendar.test.tsx`, `apps/api/test/bff-next.e2e-spec.ts`. Actual Next.js/API/PostgreSQL assertions cover the three scoped reads and their non-disclosing denials; handler/DOM and deterministic HTTP assertions do not establish a real browser-to-API/provider journey, complete visual/zoom coverage or deployment readiness. |
| Booking-read audit command privileges and explicit-tenant mismatch | `MT-REQ-004..005`, `010` | Documented: `packages/database/test/integration/product-security.integration.test.ts`, `packages/database/test/integration/tenant-command-context.integration.test.ts`; these shared database contracts remain separate from DIVE read-permission and application-scope results. |
| Public create-booking app-role transaction, historical idempotent replay/conflict, non-disclosing cross-tenant rejection, and atomic booking/verifier/audit/outbox effects | `DIVE-BOOK-REQ-001`, `028`, `045`, `058..062`, `064..065`; `MT-REQ-004`, `007`, `010` | `apps/api/test/iam.e2e-spec.ts`, `apps/api/src/booking/public-booking.service.spec.ts`, `packages/database/test/integration/booking-catalog.integration.test.ts` |
| Public-booking capability primitives, exact hosted-origin middleware, and tenant-isolated booking persistence | `DIVE-IAM-REQ-007..008`, `026`; `MT-REQ-001`, `004..006`, `009..010` | `apps/api/src/booking/public-booking.crypto.spec.ts`, `apps/api/src/booking/public-booking.cors.spec.ts`, `apps/api/src/booking/public-booking.validation.pipe.spec.ts`, `packages/database/test/integration/booking-catalog.integration.test.ts` |

### Partial or not yet demonstrated

**Documented -- BFF activation limits:** the local implementation checks above do not close the [dashboard deployment/provider gates](../iam/SPEC-DIVE-IAM-DASHBOARD-001.md#verification-and-remaining-decisions). Actual ingress/TLS sanitization, environment provisioning and operational assignment, retirement/rollback across reachable instances and aliases, real Clerk continuity on authentication/two center hosts, browser/visual checks and production performance remain unverified for this increment. The product-owner instruction in this implementation chat on 2026-09-30 excluded browser execution; no browser-based provider proof is inferred from deterministic tests or HTTP/MCP checks. No artifact status is promoted.

Clerk authentication and session revocation (`DIVE-IAM-REQ-004`, `DIVE-IAM-REQ-016`, `DIVE-IAM-REQ-022`) remain Partial. `apps/web/src/features/dashboard/clerk-dashboard-session.test.tsx` proves only the mocked browser-adapter wiring and stable session-source identity. `apps/api/test/iam.clerk.sandbox.e2e-spec.ts` records a dated Clerk Development run for browser authentication and provider session revocation; natural expiry, browser logout, Clerk-delivered webhooks, and production integration remain unproven. `packages/identity/src/clerk-token-verifier.spec.ts` and the deterministic seams cover the remaining contract cases. See `evidence/releases/iam-phase-2-revocation.md`.

**Documented:** non-disclosure and complete sensitive-operation audit coverage (`DIVE-IAM-REQ-024`, `DIVE-IAM-REQ-025`) remain partial beyond the exposed paths. The bounded calendar/booking/contact assertions are now linked above under the [confirmed read-audit owner](../iam/SPEC-DIVE-IAM-001.md#calendar-phase-two-read-audit-proposal), `DIVE-IAM-REQ-015`, `025`, `028`; they do not establish application-wide auditing, privacy/retention operations or real-browser/provider verification.

Public capability coverage is now partial for purpose-separated token primitives and tenant-isolated verifier persistence (`DIVE-IAM-REQ-007..008`, `DIVE-IAM-REQ-026`); full HTTP contract, one-time consumption, token limits, and expiry evidence remain follow-ups. Support access plus expiry evidence (`DIVE-IAM-REQ-020`, `DIVE-IAM-REQ-028`) also remain follow-ups. Provider-neutral assurance is demonstrated for current dashboard authentication, while the exact Clerk step-up contract remains open for Phase 4. See `specs/iam/SPEC-DIVE-IAM-SUPPORT-001.md` and `specs/booking/SPEC-DIVE-BOOKING-CAPABILITIES-001.md`. `DIVE-IAM-REQ-027` remains governed by deferred `SPEC-DIVE-OPS-001` scope. `MT-COND-IAM-001` and `MT-COND-WORKER-001` remain activation gates; Option B channels remain deferred. Do not treat this map as additional verification.

Invitation application-boundary hardening is a Draft follow-up in `SPEC-DIVE-IAM-INVITATIONS-001`, with no implementation coverage before invitation HTTP exposure. Related requirements: `DIVE-IAM-REQ-006`, `DIVE-IAM-REQ-017`, `DIVE-IAM-REQ-024`, `DIVE-IAM-REQ-025`, `DIVE-IAM-REQ-028`, and `DIVE-IAM-REQ-030`.

Approved Phase 0 decision relationships are recorded in `ADR-DIVE-004` through `ADR-DIVE-008`. Approval authorizes implementation but is not implementation evidence.
