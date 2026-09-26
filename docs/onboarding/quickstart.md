
# Quickstart (developer)

## Prerequisites

- Node.js version pinned by the repository
- pnpm version pinned by the repository
- Docker + Docker Compose

## Typical local setup

```bash
cp .env.example .env
pnpm install
docker compose up -d
pnpm db:migrate
pnpm db:seed
pnpm dev
```

## Key folders

- `apps/` deployable processes (web, api, worker)
- `packages/` shared domain, application, contracts, database tooling
- `specs/` **normative** SDD artifacts (ADRs, SPECS, requirements)
- `evidence/` reproducible evidence for spikes and validations