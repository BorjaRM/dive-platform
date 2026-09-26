# Architecture overview (non-normative)

Normative decisions:

- `specs/architecture/adrs/ADR-DIVE-001.md`
- `specs/architecture/adrs/ADR-DIVE-002.md`
- `specs/architecture/adrs/ADR-DIVE-003.md`
- `specs/foundation/multitenancy-architecture.md`

## Intended topology

- **Web** (Next.js): dashboard + hosted public booking page + iframe widget
- **API** (NestJS): modular monolith
- **Worker**: outbox + async tasks
- **Database**: PostgreSQL shared DB/schema, RLS as defense in depth

This topology is not fully provisioned. The repo currently has starters and empty domain/database packages.

## Principles

- Tenant context is explicit and server-authorized
- Outbox for reliable, idempotent side effects
- Vendor-neutral observability via OpenTelemetry
- Domain must not import framework or vendor SDKs

## Monorepo (ADR-DIVE-003)

- Apps (`@dive-center/web`, `@dive-center/api`, `@dive-center/worker`) are the deployable processes.
- Libraries live under `packages/` with the `@dive-center/*` scope. Each has its own `package.json` and a thin `tsconfig.json` that extends `@dive-center/typescript-config`.
- Domain must not import Next.js, NestJS, Clerk, or other vendor SDKs. That rule is independent of package count.
- Most libraries are empty shells today. Do not treat them as implemented adapters.
