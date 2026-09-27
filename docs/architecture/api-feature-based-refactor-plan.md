# API feature-based refactor plan (non-normative)

## Purpose

This document describes the changes needed to complete the Feature-Based Modular Architecture refactor in `apps/api`.

It is an implementation guide, not a source of product requirements. Normative behavior remains defined by:

- `specs/architecture/adrs/ADR-DIVE-001.md`
- `specs/architecture/adrs/ADR-DIVE-002.md`
- `specs/architecture/adrs/ADR-DIVE-003.md`
- `specs/foundation/multitenancy-architecture.md`
- `specs/iam/SPEC-DIVE-IAM-001.md`
- `specs/booking/SPEC-DIVE-BOOKING-001.md`
- `specs/traceability/TRACE-DIVE-MVP-001.md`

The refactor must not introduce new permissions, states, defaults, TTLs, database semantics, or API contracts.

## Goals

- Organize NestJS code by business capability rather than technical type.
- Keep each feature responsible for its controllers, DTOs, filters, providers, and module wiring.
- Split services that combine unrelated use cases into cohesive subcapabilities.
- Keep controllers thin and preserve existing HTTP contracts.
- Keep tenant authorization, transaction, idempotency, and outbox boundaries explicit.
- Keep the application root limited to process-level composition and bootstrap concerns.
- Reserve `common/` for cross-cutting NestJS concerns with multiple real consumers.
- Preserve the repository-level domain, application, contract, and persistence boundaries.

## Non-goals

- Rewriting the domain model.
- Adding generic Clean Architecture layers inside every feature.
- Introducing repositories, ports, factories, or strategies without a demonstrated boundary.
- Changing database queries, RLS policies, authorization decisions, or outbox payloads.
- Splitting files according to arbitrary line-count limits.
- Removing the starter root endpoint unless its public contract is deliberately retired.
- Changing web or worker behavior.

## Target structure

```text
apps/api/src/
  app/
    app.controller.ts
    app.module.ts
    app.service.ts
    openapi.spec.ts
  catalog/
    activities/
      activity-catalog.service.ts
    slots/
      slot-catalog.service.ts
    catalog-access.service.ts
    catalog.controller.ts
    catalog.dto.ts
    catalog.errors.ts
    catalog.module.ts
    catalog.validation.ts
  iam/
    centers/
      centers.service.ts
    identity-webhook/
      identity-webhook.controller.ts
      identity-webhook.dto.ts
      identity-webhook.module.ts
    invitations/
      invitations.service.ts
    memberships/
      memberships.service.ts
    tenant-context/
      tenant-context.service.ts
    iam.controller.ts
    iam.dto.ts
    iam.facade.ts
    iam.module.ts
  common/
    auth/
      auth.guard.ts
      clerk.config.ts
      clerk.config.spec.ts
    database/
      database.module.ts
      database.tokens.ts
    security/
      security.tokens.ts
    tenant-context/
      tenant-context.crypto.ts
      tenant-context.tokens.ts
    core.module.ts
  main.ts
```

Subcapability folders should only be added when a feature has distinct responsibilities. A small feature should remain flat.

## Current progress

### Completed or implemented in the current refactor

- Top-level API code is grouped into `app`, `catalog`, `iam`, and `common` features.
- Catalog access resolution is isolated in `CatalogAccessService`.
- Activity use cases are isolated in `ActivityCatalogService`.
- Slot use cases are isolated in `SlotCatalogService`.
- The catalog controller delegates to focused activity and slot providers.
- IAM tenant-context behavior is isolated in `TenantContextService`.
- IAM center behavior is isolated in `CentersService`.
- IAM membership behavior is isolated in `MembershipsService`.
- IAM invitation behavior is isolated in `InvitationsService`.
- `IamService` has been replaced by a thin `iam.facade.ts` compatibility facade.
- The identity webhook is located under the IAM feature while retaining its own module.
- `CatalogProblemFilter` is registered by `CatalogModule`, not by `AppModule`.
- Shared infrastructure is grouped under `common/auth`, `common/database`, `common/security`, and `common/tenant-context`.
- Database and tenant-context injection tokens are owned by their respective concerns.
- The catalog access test is named after `CatalogAccessService`.
- The OpenAPI test loads the real `IamModule` and a shared test-infrastructure module.

### Remaining work

- No additional focused catalog-provider tests are required: the existing API e2e
  lifecycle covers activity and slot behavior, while the focused unit test covers
  catalog access resolution.
- The complete validation matrix and final diff review are complete for the current
  working tree.

### Validation completed

- `pnpm --filter @dive-center/api typecheck` passed.
- `pnpm --filter @dive-center/api test` passed: 16 files and 339 tests.
- `pnpm --filter @dive-center/api test:e2e` passed: 2 files and 30 tests.
- `CI=1 TERM=dumb pnpm check` passed: Biome clean and 17 typecheck tasks.
- `CI=1 TERM=dumb pnpm test` passed across the workspace.
- `CI=1 TERM=dumb pnpm test:integration` passed: 60 database integration tests
  and 30 API e2e tests.
- `git diff --check HEAD` passed.

## Required changes

### 1. Complete the catalog decomposition

The former catalog service mixed tenant-context resolution, authorization, activities, slots, response mapping, and outbox writes.

Required end state:

- `CatalogAccessService` owns tenant-context lookup and server-authorized IAM access resolution.
- `CatalogAccessService` owns the shared tenant-scoped unit-of-work entry point used by catalog mutations.
- `ActivityCatalogService` owns activity listing, creation, lifecycle changes, DTO mapping, and activity outbox events.
- `SlotCatalogService` owns slot listing, creation, lifecycle changes, DTO mapping, and slot outbox events.
- `CatalogController` only translates HTTP inputs and delegates to the relevant provider.
- `CatalogModule` owns all catalog providers and the catalog problem filter.

Constraints:

- Every tenant-owned query must retain an explicit `tenant_id` predicate.
- Activity and slot authorization must continue to use the server-resolved tenant context.
- Existing center-scope checks must remain unchanged.
- Mutation, audit, and outbox writes must remain in the same transaction.
- Existing event names, payloads, and idempotency keys must not change.
- Existing error-to-HTTP mappings must remain unchanged.

Follow-up tests:

- Rename `catalog.service.spec.ts` to `catalog-access.service.spec.ts` if it only verifies access resolution.
- Cover operational IAM errors and authorization denials through `CatalogAccessService`.
- Cover activity and slot observable behavior through their public methods or HTTP endpoints.
- Avoid assertions on private helpers or internal provider calls.

### 2. Complete the IAM decomposition

IAM contains several cohesive subcapabilities and should not return to a single catch-all service.

Required end state:

- `TenantContextService` owns operator listing, tenant-context issue/revoke, and authorized-context resolution.
- `CentersService` owns center collection and center detail reads.
- `MembershipsService` owns membership state changes.
- `InvitationsService` owns invitation issue, response, and revocation.
- `iam.facade.ts` may preserve the current controller-facing API while the controller remains thin.
- `IamModule` owns and wires all IAM providers.

Constraints:

- Do not expose feature-internal providers outside `IamModule` unless another feature has a demonstrated dependency.
- Preserve denial logging actions, reasons, and correlation IDs.
- Preserve non-disclosing authorization responses.
- Operational dependency failures must continue to propagate rather than becoming authorization denials.
- Preserve last-owner protection.
- Preserve each database command's transaction and outbox behavior.
- Do not accept a client-supplied tenant ID as authorization.

Follow-up tests:

- Keep explicit coverage for non-disclosing 403 responses.
- Keep explicit coverage for database and command dependency failures.
- Add facade tests only if the facade gains behavior; pure delegation does not need implementation-detail tests.
- Rename `iam.error-handling.spec.ts` only if a more precise owner is clear after the final structure settles.

### 3. Keep the identity webhook inside IAM

The Clerk webhook is an IAM identity-ingress capability. It should remain under `iam/identity-webhook/`, with a separate NestJS module.

Required end state:

- `IamModule` imports `IdentityWebhookModule`.
- `AppModule` imports only `IamModule`; it does not import webhook internals.
- The webhook controller remains outside `ClerkAuthGuard` because it uses signature verification rather than bearer authentication.
- Raw request body verification remains intact.
- Webhook application remains delegated to the existing database command.

Constraints:

- Preserve the route and response contract.
- Preserve Svix signature verification.
- Preserve security logging and correlation IDs.
- Preserve session revocation hashing.
- Do not log webhook secrets or raw credentials.

### 4. Refine `common/` by cross-cutting concern

The current `common/` root mixes authentication, identity-provider configuration, database lifecycle, tenant-context cryptography, and security logging.

Required moves:

| Current file | Target file |
| --- | --- |
| `common/auth.guard.ts` | `common/auth/auth.guard.ts` |
| `common/clerk.config.ts` | `common/auth/clerk.config.ts` |
| `common/clerk.config.spec.ts` | `common/auth/clerk.config.spec.ts` |
| `common/database.module.ts` | `common/database/database.module.ts` |
| `common/tenant-context.crypto.ts` | `common/tenant-context/tenant-context.crypto.ts` |
| `common/security.tokens.ts` | `common/security/security.tokens.ts` |

Replace `common/tokens.ts` with tokens owned by their concerns:

- `common/database/database.tokens.ts` exports `DATABASE_POOL`.
- `common/tenant-context/tenant-context.tokens.ts` exports `TENANT_CONTEXT_CRYPTO`.

`CoreModule` may remain at `common/core.module.ts` while it composes shared authentication, identity, security logging, and tenant-context providers. If it accumulates more responsibilities, split it into focused modules only when there is a concrete consumer or lifecycle boundary.

Constraints:

- `common/` must not import feature internals.
- A utility used by only one feature belongs inside that feature.
- Avoid index barrels that obscure dependency direction.
- Update all source, test, and bootstrap imports atomically.
- Keep tests colocated with their implementation.

### 5. Keep `AppModule` as the composition root

`AppModule` should compose process-level modules and the root starter controller only.

Required end state:

- Import `DatabaseModule`, `CoreModule`, `IamModule`, and `CatalogModule`.
- Configure process-level observability.
- Do not register feature filters, feature services, or feature controllers directly.
- Do not import feature-internal files.

The starter `AppController` and `AppService` can remain until the root endpoint is deliberately removed. Their removal is not part of this structural refactor.

### 6. Improve module-boundary tests

The current OpenAPI test manually assembles controllers and providers. Prefer importing real feature modules when this does not require production-only environment configuration.

Recommended approach:

- Build a testing module from `IamModule` and the minimum shared provider overrides.
- Override database, identity, webhook-verifier, logger, and tenant-context tokens.
- Generate the Swagger document from the resulting Nest application.
- Assert route presence and security metadata, not internal wiring.

Do not make the OpenAPI test dependent on a live Clerk service or PostgreSQL instance.

### 7. Update the backend agent instructions

Strengthen `.github/agents/backend-api-implementer.agent.md` so future work preserves this structure.

Add these rules under `Implementation design`:

- Top-level feature folders are necessary but not sufficient; split a feature when one service owns unrelated business subcapabilities.
- Prefer a flat feature directory while it remains cohesive; introduce subcapability folders only when responsibilities have genuinely diverged.
- Avoid catch-all `*Service` classes that combine unrelated flows.
- Controllers may remain transport facades only while they stay thin and contain no business decisions.
- Keep shared feature-internal providers inside the owning module.
- Register filters, interceptors, and errors through their owning feature module rather than the application root.
- Keep identity webhooks under IAM/identity unless they become independently reusable.
- Group `common/` by real cross-cutting concern and prohibit dependencies from `common/` into features.
- Keep tests colocated with the provider or controller they verify.
- Do not split code solely by technical type or arbitrary line count.
- Preserve tenant, RLS, transaction, idempotency, and outbox boundaries during extraction.

These are engineering guidance changes, not product requirements.

## Dependency rules

Allowed directions:

```text
app -> feature modules -> shared NestJS infrastructure
feature transport -> feature providers -> repository packages
packages/application -> packages/domain
persistence adapters -> domain/application contracts
```

Disallowed directions:

```text
common -> catalog or iam internals
domain -> NestJS, Clerk, Drizzle, PostgreSQL, or vendor SDKs
feature A -> feature B internal files
controller -> direct SQL or transaction orchestration
app root -> feature controller, filter, DTO, or service internals
```

When one feature genuinely needs another, expose an explicit public provider or contract from the owning module rather than importing an internal implementation file.

## Tenancy and security invariants

This refactor moves existing tenant-scoped code, so isolation evidence must remain valid.

- Resolve tenant context on the server from the opaque handle and authenticated session.
- Never authorize from a tenant, center, activity, or slot identifier supplied by the client alone.
- Retain explicit tenant predicates in every tenant-owned query.
- Keep RLS as defense in depth; do not rely on it as the only query boundary.
- Do not use migration credentials or `BYPASSRLS` in the application.
- Ensure pooled connections cannot retain tenant context between requests.
- Preserve same-tenant, cross-tenant, missing-context, and pooled-connection test coverage required by `MT-REQ-010`.

No new `MT-REQ-*` behavior is introduced by this plan.

## Transaction, outbox, and performance invariants

- Keep business mutation, audit record, and outbox append in one transaction where currently required.
- Keep idempotency checks at the use-case boundary.
- Do not hide transactions inside a generic helper that makes the business boundary unclear.
- Preserve outbox event schemas and consumer expectations.
- Avoid adding query round trips solely because code moved between providers.
- Preserve existing list filtering and payload shape.
- Do not invent latency, throughput, or payload-size budgets.

## Validation plan

Run focused checks after each extraction, then the full repository checks.

### Focused checks

```bash
pnpm --filter @dive-center/api typecheck
pnpm --filter @dive-center/api test
pnpm --filter @dive-center/api test:e2e
```

Recommended focused test invocations while iterating:

```bash
pnpm --filter @dive-center/api exec vitest run src/iam/iam.error-handling.spec.ts
pnpm --filter @dive-center/api exec vitest run src/app/openapi.spec.ts
```

### Isolation and integration checks

Because tenant-scoped query code is moved, even without changing SQL semantics, rerun:

```bash
CI=1 TERM=dumb pnpm test:integration
```

The isolation suite must still cover:

- same-tenant access;
- cross-tenant denial;
- missing tenant context;
- pooled-connection context reset.

### Repository checks

```bash
pnpm check:fix
pnpm check
pnpm test
git diff --check
```

Record only commands actually run in the pull request Validation section. Do not claim browser e2e, CI, or integration success unless those checks were executed successfully.

## Completion criteria

The refactor is complete when:

- No catch-all catalog or IAM service owns unrelated subcapabilities.
- Controllers remain thin and existing routes are unchanged.
- Each feature module owns its controllers, providers, DTOs, and filters.
- The identity webhook is composed through IAM and remains signature-authenticated.
- `common/` is grouped by actual cross-cutting concern.
- `AppModule` imports modules without reaching into feature internals.
- Tenant authorization and explicit tenant query scoping are unchanged.
- Mutation, audit, idempotency, and outbox boundaries are unchanged.
- Focused API tests, API e2e tests, integration isolation tests, repository checks, and `git diff --check` pass.
- The backend agent instructions contain the maintainability rules listed above.
- The pull request describes the refactor as structural and lists no unimplemented requirement IDs as completed.

## Review checklist

- [ ] No HTTP route, status, DTO, or OpenAPI contract changed unintentionally.
- [ ] No permission, role, state, TTL, or default was introduced.
- [ ] No tenant-owned query lost its `tenant_id` predicate.
- [ ] No client-supplied scope became an authorization source.
- [ ] No transaction or outbox write was split across providers.
- [ ] No operational error was translated into a misleading 403 response.
- [ ] No feature implementation leaked into `common/` or `AppModule`.
- [ ] No new abstraction was added without a real boundary or consumer.
- [ ] Tests verify observable behavior rather than private implementation details.
- [ ] Validation claims match commands actually run.

## Open questions

None are required to complete the structural refactor described here. Any discovered ambiguity in permissions, lifecycle states, idempotency, outbox behavior, tenant resolution, or API contracts is a specification gap and must stop implementation rather than be resolved with a silent default.
