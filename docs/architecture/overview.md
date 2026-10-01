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

This topology is partially implemented. The API and database provide the walking
skeleton for IAM, the center catalog, public booking, and controlled self
bootstrap. The web app provides the authenticated dashboard, tenant-context
flows, Clerk invitation acceptance, bootstrap setup, and ordinary sign-in. The
worker implements the pre-tenant invitation outbox, retry/dead-letter policy,
reconciliation, and Render cron entry point. A product E2E run against a
deployed HTTPS host has not yet been executed; local unit, integration, API e2e,
component, and deterministic worker tests remain the current proof.

**Documented -- Center-data boundary:** the current
[web transport](../../apps/web/src/lib/dashboard-bff.ts) runs enumerated BFF
operations in the existing Next.js application; the
[API admission owner](../../apps/api/src/iam/application-admission.guard.ts)
separates service authentication from the user's Clerk bearer and tenant context.
Feature owners retain authorization, resource scope and transactional effects.
The selected contract and activation limits remain in
[IAM dashboard](../../specs/iam/SPEC-DIVE-IAM-DASHBOARD-001.md#simple-bff-contract),
`DIVE-IAM-REQ-030..032`; this is not a new deployable or an authorization cache.
Runtime navigation is in the [web](../../apps/web/README.md#center-dashboard)
and [API](../../apps/api/README.md#catalog-editing-and-booking-reads) README;
[TRACE](../../specs/traceability/TRACE-DIVE-MVP-001.md#demonstrated-coverage)
keeps the bounded editing/read coverage and provider/deployment gaps.

## Principles

- Tenant context is explicit and server-authorized
- Outbox for reliable, idempotent side effects
- Vendor-neutral observability via OpenTelemetry
- Domain must not import framework or vendor SDKs

## Monorepo (ADR-DIVE-003)

- Apps (`@dive-center/web`, `@dive-center/api`, `@dive-center/worker`) are the deployable processes.
- Libraries live under `packages/` with the `@dive-center/*` scope. Each has its own `package.json` and a thin `tsconfig.json` that extends `@dive-center/typescript-config`.
- Domain must not import Next.js, NestJS, Clerk, or other vendor SDKs. That rule is independent of package count.
- Library maturity varies. Database, identity, and observability contain
    implemented adapters and runtime operations, while some other packages remain
    placeholders. Inspect each package before treating it as an implemented boundary.
