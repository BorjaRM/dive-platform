# ADR-DIVE-002 — Stack, topology, and region

- **Status:** Ready to start
- **Version:** 0.2
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

### Intended topology (not provisioned in this increment)

- Vercel: web
- Render (EU): API, worker, managed PostgreSQL

CI workflows and Docker Compose are **deferred**. Do not document them as existing. Local PostgreSQL may be added with Docker later.

## Operational rules

- Environment separation (dev / staging / prod)
- Migrations use a separate DB role; runtime role has no DDL and no `BYPASSRLS`
- Secrets never stored in git
- Encrypted backups and tested restoration before real data
- Portable contracts: domain must not import Next.js, NestJS, Clerk, Vercel, Render, or mail SDKs

## Current repository vs target

The repository currently contains a workspace skeleton (Nest starter API, Next starter web, empty domain/database packages). Missing infrastructure must be added in implementation PRs, not assumed by this ADR.

## Alternatives considered

- Microservices: rejected until a measured reason exists
- Database-per-tenant: rejected for MVP cost
- Web Component as first widget: deferred; higher CMS/support cost
- Script injected into host DOM: rejected for MVP security surface

## Acceptance criteria

- Stack choices are enough to implement the walking skeleton
- Isolation and last-seat spikes can run on real PostgreSQL
- Widget modality remains provisional until SPIKE-DIVE-003 evidence
