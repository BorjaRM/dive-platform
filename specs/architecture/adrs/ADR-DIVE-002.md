# ADR-DIVE-002 — Stack, topology, and region

- **Status:** Ready to start
- **Initial decision:** Next.js on Vercel + NestJS API/worker + PostgreSQL on Render (EU region), with portable contracts.

## Decision

- TypeScript monorepo
- Backend: NestJS modular monolith
- Frontend: Next.js (dashboard + hosted booking page + widget via iframe)
- Persistence: PostgreSQL 18.x (shared DB/schema), RLS as defense in depth
- Data access: Drizzle + node-postgres + tenant-aware unit of work
- Async: transactional outbox + idempotent worker
- Observability: OpenTelemetry, vendor-neutral
- Identity: Clerk behind our own façade/adapter
- Transactional email behind `TransactionalEmailPort` (provider chosen later)
- i18n: `es` + `en` from MVP using `next-intl`
- Money model: minor units integer + ISO 4217 (EUR only in MVP)

## Topology

Vercel:
- Dashboard / hosted page / iframe widget

Render (EU):
- API (NestJS)
- Worker (outbox)
- Managed PostgreSQL

## Operational rules (minimum)

- Environment separation (dev/staging/prod)
- Migrations run with a separate DB role; runtime role has no DDL and no BYPASSRLS
- Secrets never stored in git
- Encrypted backups + restoration tested