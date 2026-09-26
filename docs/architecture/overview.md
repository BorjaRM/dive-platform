# Architecture overview (non-normative)

Normative decisions:

- `specs/architecture/adrs/ADR-DIVE-001.md`
- `specs/architecture/adrs/ADR-DIVE-002.md`
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
