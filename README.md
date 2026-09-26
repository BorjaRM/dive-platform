# dive-center-platform

> 🤿 **Status:** Ready to start documentation · **Method:** Spec-Driven Development · **Initial market:** recreational dive centers in Spain  
> **Repository:** `BorjaRM/dive-platform` · **npm package name:** `dive-center-platform`

SaaS multi-tenant platform for bookings (and later operations) of dive centers. The first cut publishes availability, accepts online and manual bookings, keeps a calendar, and confirms without overselling.

GitHub `specs/` is the source of truth. Notion is navigation and status only.

## Terminology

- **Activity:** catalog offering, e.g. “Discover Scuba Dive”
- **Slot / scheduled activity:** concrete occurrence with its own capacity and state (`Slot` in code)
- **Session:** authentication lifecycle only

## What exists today

The repository is a TypeScript monorepo skeleton:

- `apps/web` — Next.js starter
- `apps/api` — NestJS starter (Vitest)
- `apps/worker` — package stub
- `packages/*` — `@dive-center/*` workspace packages; most are empty shells
- `packages/typescript-config` — shared TypeScript presets
- `specs/` — normative SDD artifacts
- Tooling: pnpm, Turborepo, Biome, Node `22.22.3`, TypeScript `7.0.2`

Not in the repository yet (planned, do not assume they exist):

- CI workflows
- Docker Compose / local PostgreSQL recipes
- `.env.example`, migrations, seeds
- `pnpm db:*`, `pnpm test:integration`, `pnpm specs:validate`
- Clerk, Drizzle schema, outbox worker implementation

## First product slice

```text
Create tenant and center
  → create an activity and schedule it
  → query public availability
  → book
  → see the booking in the authorized dashboard
  → emit confirmation in the outbox
```

Ready to start means reversible implementation with **synthetic data**. It does not authorize real personal data or a pilot.

## Stack (ADR-DIVE-002)

- TypeScript, pnpm workspaces, Turborepo
- Next.js, NestJS modular monolith, worker
- PostgreSQL 18.x, Drizzle, node-postgres, RLS
- Clerk behind a façade
- Transactional outbox
- OpenTelemetry
- Biome for lint/format
- API tests: Vitest (current starter). Additional runners only if a later ADR requires them

## Normative docs

- [Product profile](specs/product/dive-mvp-profile.md)
- [How we work](docs/sdd/how-we-work.md)
- [Architecture overview](docs/architecture/overview.md)
- [ADR-DIVE-001](specs/architecture/adrs/ADR-DIVE-001.md)
- [ADR-DIVE-002](specs/architecture/adrs/ADR-DIVE-002.md)
- [SPEC-DIVE-BOOKING-001](specs/booking/SPEC-DIVE-BOOKING-001.md)
- [SPEC-DIVE-IAM-001](specs/iam/SPEC-DIVE-IAM-001.md)
- [TRACE-DIVE-MVP-001](specs/traceability/TRACE-DIVE-MVP-001.md)

## Current commands

```bash
pnpm install
pnpm dev
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm format
pnpm check
```

Workspace packages are scoped as `@dive-center/*`. TypeScript options live in `packages/typescript-config` (ADR-DIVE-003). `pnpm check-types` remains an alias of `pnpm typecheck`.


Database, integration, e2e, and CI commands will be documented when those tools land.

## Scope

Included: tenant/center, activities, slots, hosted page, iframe widget, public availability, online and manual booking, basic calendar, confirmation email via outbox, cancellation, tenant/center authorization, audit, idempotency, `es`/`en`.

Excluded: payments, trip operations, certifications/medical/emergency data, marketplace, equipment, offline.

## Implementation order

1. Walking skeleton: tenancy, RLS, unit of work, outbox, PostgreSQL 18 from zero
2. MT-SPIKE-001
3. SPIKE-DIVE-001
4. Booking vertical slice
5. SPIKE-DIVE-003 before pilot
6. Privacy review of contact/booking data before real personal data
7. OPS and SPIKE-DIVE-002 stay deferred

## License

UNLICENSED. Decide a license before publishing outside the team.
