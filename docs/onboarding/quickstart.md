# Quickstart (developer)

## Prerequisites

- Node.js `22.22.3` (see `.nvmrc`)
- pnpm `12.6.0` (see root `package.json`)

Docker Compose and `.env.example` are **not** in the repository yet. Do not copy commands that assume them.

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


When PostgreSQL, migrations, and Compose are added, this page must be updated in the same PR that adds them.

## Key folders

- `apps/` deployable processes (web, api, worker)
- `packages/` shared libraries (mostly stubs today)
- `specs/` **normative** SDD artifacts
- `docs/` navigation and overviews, never a second contract
- `evidence/` reproducible evidence once spikes run
- `tests/` reserved integration/e2e/security trees (placeholders)

## Source of truth

Requirements live in `specs/`. If a README or Notion page disagrees, stop and fix the SPEC.
