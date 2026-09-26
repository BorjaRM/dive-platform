# Quickstart (developer)

## Prerequisites

- Node.js `22.22.3` (see `.nvmrc`)
- pnpm `12.6.0` (see root `package.json`)
- Docker with Compose support when running the local PostgreSQL integration harness

## Current local setup

```bash
pnpm install
pnpm dev
pnpm build
pnpm lint
pnpm typecheck
pnpm check
```

`pnpm check` runs Biome at the repo root and then Turbo `typecheck`. Biome is not a per-package Turbo task.

## PostgreSQL 18 integration harness

The repository includes a local Docker Compose recipe at `infra/docker/postgres/docker-compose.yml` and synthetic connection settings in `.env.example`.

```bash
docker compose -f infra/docker/postgres/docker-compose.yml up -d --wait
pnpm test:integration
```

The harness uses synthetic data only. It is development and test infrastructure, not hosting or production automation.

CI runs the same integration scope with a PostgreSQL 18 service: it bootstraps database roles, applies product migrations, and executes database integration plus API e2e tests. See `.github/workflows/ci.yml`.

## Key folders

- `apps/` deployable processes (web, api, worker)
- `packages/` shared libraries (mostly stubs today)
- `specs/` **normative** SDD artifacts
- `docs/` navigation and overviews, never a second contract
- `evidence/` reproducible evidence once spikes run
- `tests/` reserved integration/e2e/security trees (placeholders)

## Source of truth

Requirements live in `specs/`. If a README or Notion page disagrees, stop and fix the SPEC.
