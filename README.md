# dive-center-platform

> 🤿 **Status:** Ready to start documentation · **Method:** Spec-Driven Development · **Initial market:** recreational dive centers in Spain  
> **Repository:** `dive-platform` · **npm package name:** `dive-center-platform`

SaaS multi-tenant platform for bookings (and later operations) of dive centers. The first cut publishes availability, accepts online and manual bookings, keeps a calendar, and confirms without overselling.

GitHub `specs/` is the source of truth. Notion is navigation and status only.

## Terminology

- **Activity:** catalog offering, e.g. “Discover Scuba Dive”
- **Slot / scheduled activity:** concrete occurrence with its own capacity and state (`Slot` in code)
- **Session:** authentication lifecycle only
- **Spike IDs:** always `MT-SPIKE-001` (isolation) and `SPIKE-DIVE-001` (last seat). There is no `SPIKE-001` in this repository.

## What exists today

**Documented -- Implementation navigation:** this TypeScript monorepo contains
local product slices, not a complete or activated product. The sources below own
their implementation details; [TRACE](specs/traceability/TRACE-DIVE-MVP-001.md)
locates contracts, proof and remaining gaps.

- [Web](apps/web/README.md): Next.js center home, catalog editing, calendar and
  booking/contact reads, tenant context, bootstrap and platform invitation
  console, using enumerated same-origin BFF operations.
- [API](apps/api/README.md): NestJS IAM/Clerk adapter, global BFF admission,
  center-scoped catalog/booking reads, public booking and controlled onboarding.
- [Worker entry point](apps/worker/src/main.ts): one-shot processing of the
  existing bootstrap invitation outbox; delivery activation is separate.
- [Database](packages/database/README.md): product schemas/migrations and
  tenant-scoped runtime operations, plus the separate MT-SPIKE-001 harness.
- [Local PostgreSQL](infra/docker/postgres/README.md): PostgreSQL 18 Compose
  recipe for synthetic integration work.
- `packages/*`: `@dive-center/*` workspace boundaries with differing maturity;
  some remain placeholders. Shared TypeScript presets live in
  `packages/typescript-config`.
- [Tooling](package.json) and [CI](.github/workflows/ci.yml): build, read-only
  check/test, schema-artifact verification and PostgreSQL integration. Spec
  governance has its [own workflow](.github/workflows/spec-governance.yml).

Real Clerk/provider checks, deployed ingress/TLS, effective credential revocation,
rollout and real-data readiness are not established by local code, unit/DOM tests
or builds. Consult the owning SPEC activation gates before use outside the
synthetic increment. There is still no root `pnpm specs:validate` alias; use the
existing governance script below.

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
- API tests: Vitest unit and HTTP/PostgreSQL suites; deterministic BFF integration
  and separately configured Clerk sandbox runners are documented in
  [the API README](apps/api/README.md).

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
pnpm swagger
node scripts/validate-spec-governance.mjs --all
```

Workspace packages are scoped as `@dive-center/*`. TypeScript options live in `packages/typescript-config` (ADR-DIVE-003). `pnpm check-types` remains an alias of `pnpm typecheck`.

Configure the local environment before starting the applications; example Clerk
and BFF placeholders are not usable credentials. Follow the
[quickstart](docs/onboarding/quickstart.md), [web BFF configuration](apps/web/README.md#server-side-bff-configuration)
and [API admission configuration](apps/api/README.md#bff-admission).

**Documented -- GitHub Actions:** source is the current workflows, not a claim
that CI has run for this branch.

- [App CI](.github/workflows/ci.yml): build, generated schema metadata check,
  `pnpm check` and `pnpm test`, with a separate PostgreSQL 18 integration job.
  It does not auto-fix or commit source changes.
- [Spec CI](.github/workflows/spec-governance.yml): governance validation for
  normative artifacts.

```bash
docker compose -f infra/docker/postgres/docker-compose.yml up -d --wait
pnpm test:integration
```

`pnpm test:integration` includes database tests and API e2e, including the
deterministic Next.js/API/PostgreSQL harness. It is not a complete browser or
real-provider journey. Use the documented disposable synthetic database, not a
database containing local work or real personal data.

## Planned scope

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
