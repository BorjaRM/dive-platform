# ADR-DIVE-002 — Stack, topology, and region

- **Status:** Ready to start
- **Version:** 0.3
- **Decision date:** 2026-09-26

## Context

The product needs a portable, EU-resident, multi-tenant booking platform. The reusable baseline recommends TypeScript, a modular monolith, PostgreSQL with RLS, and a transactional outbox. Widget integration for non-developer center websites is a product constraint.

## Decision

- Language: TypeScript, strict
- Monorepo: pnpm workspaces + Turborepo
- Linting/format: Biome (not ESLint/Prettier)
- Backend: NestJS modular monolith (`apps/api`)
- Worker: outbox and async tasks (`apps/worker`)
- Web: Next.js (`apps/web`) for dashboard, hosted booking page, and iframe widget
- Persistence: PostgreSQL 18.x, shared database and schema, Drizzle + node-postgres, tenant-aware unit of work, RLS as defense in depth
- Identity: Clerk behind our façade/adapter
- Email: `TransactionalEmailPort`; provider chosen later
- API: REST / OpenAPI, correlation ID
- Observability: OpenTelemetry, vendor-neutral
- i18n: `es` + `en` via `next-intl` when introduced
- Money model (future payments, not MVP): minor units integer + ISO 4217, EUR only
- Widget modality (provisional): responsive iframe + hosted-page fallback. SPIKE-DIVE-003 must accept or change this before pilot

### Intended deployment topology

- Vercel: web
- Render (EU): API, worker, managed PostgreSQL

**Documented (decision-time context):** when version 0.2 was recorded in commit
`f18144c`, CI workflows and Docker Compose were deferred. This is historical
implementation context, not a current repository-state claim.

**Documented (current repository status, 2026-09-28):**
[CI](../../../.github/workflows/ci.yml) now runs build, static checks, tests, and
a separate PostgreSQL 18 integration job. Local PostgreSQL Compose exists under
[infra/docker/postgres](../../../infra/docker/postgres/docker-compose.yml).
Neither implementation changes the intended deployment topology above.

## Operational rules

- Environment separation (dev / staging / prod)
- Migrations use a separate DB role; runtime role has no DDL and no `BYPASSRLS`
- Secrets never stored in git
- Encrypted backups and tested restoration before real data
- Portable contracts: domain must not import Next.js, NestJS, Clerk, Vercel, Render, or mail SDKs

## Current repository vs target

**Documented (decision-time context):** the workspace-skeleton description in
version 0.2 reflected the repository at the decision date and is retained in git
history; it is not a statement about the current implementation.

**Documented (current repository status, 2026-09-28):** the repository now
contains a Nest API whose [root module](../../../apps/api/src/app/app.module.ts)
composes IAM, catalog, and public booking, a Next
[dashboard route](../../../apps/web/src/app/dashboard/page.tsx), and a
PostgreSQL [product schema](../../../packages/database/src/product-schema.ts)
with an immutable pre-release
[baseline](../../../packages/database/drizzle/0000_baseline.sql). The
[worker entry point](../../../apps/worker/src/main.ts) remains a stub and does
not demonstrate external outbox delivery. Current implementation details belong
in code, tests, and descriptive documentation; this ADR continues to own the
stack and topology decisions only.

## Alternatives considered

- Microservices: rejected until a measured reason exists
- Database-per-tenant: rejected for MVP cost
- Web Component as first widget: deferred; higher CMS/support cost
- Script injected into host DOM: rejected for MVP security surface

## Acceptance criteria

- Stack choices are enough to implement the walking skeleton
- Isolation and last-seat spikes can run on real PostgreSQL
- Widget modality remains provisional until SPIKE-DIVE-003 evidence
