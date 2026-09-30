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

## Important scripts

Documented: commands are defined in [root package.json](../../package.json).
Worker behavior is owned by [the worker entry point](../../apps/worker/src/main.ts)
and [the invitation processor](../../apps/worker/src/bootstrap-invitation-worker.ts).

| Command | What it does |
| --- | --- |
| `pnpm dev` | Loads the example and local environment, selects the repository Node version and starts web, API and the worker's source watcher. Does not reset the database. |
| `pnpm dev:fresh` | Requires a confirmed local database reset, then starts `dev` only if the reset succeeds. |
| `pnpm email:send` | Loads the example and local environment and runs the existing invitation worker once. May send real invitation emails through the configured Clerk instance. |
| `pnpm db:reset:local` | Confirms and recreates only the configured local `dive_spike` database, prepares roles and applies migrations. Deletes all data in that database. |
| `pnpm db:bootstrap` | Prepares restricted database roles and permissions using admin credentials. Does not reset or migrate the schema. |
| `pnpm db:migrate` | Applies versioned product migrations using migration credentials. Does not drop the database. |
| `pnpm db:generate` | Generates migration files from the schema; does not apply them. Review generated SQL before applying it. |
| `pnpm build` | Builds workspace applications and packages through Turbo. Does not start servers. |
| `pnpm check` | Checks formatting/lint and runs workspace typechecks without fixing files. |
| `pnpm check:fix` | Applies Biome fixes. Does not fix typecheck or test failures. |
| `pnpm test` | Runs workspace unit tests through Turbo. Does not replace integration tests or the standalone reset-script tests below. |
| `pnpm test:integration` | Runs database integration tests and API e2e tests against the configured PostgreSQL harness. Use a disposable test database. |

Only `db:reset:local` enforces the local URL restrictions described below.
The standalone `db:bootstrap` and `db:migrate` commands load `.env.example`
through the database package scripts; inherited environment variables take
precedence. They do not automatically load root `.env.local` or reject remote
endpoints. The reset passes its effective local environment to both commands.

## Send pending invitation emails

```bash
pnpm email:send
```

This reuses the existing outbox worker, not a general SMTP sender. It processes
currently eligible bootstrap invitation events through Clerk and exits when the
queue is idle. It does not create invitations just by starting, enable rollout
flags automatically or stay running to poll new events. Run it again after new
invitations are queued or retries become eligible.

Configure `BOOTSTRAP_INVITATION_WRITES_ENABLED=true` and
`BOOTSTRAP_INVITATION_DELIVERY_ENABLED=true`, the existing Clerk secret and
redirect/timeout settings, and the restricted `WORKER_DATABASE_URL` in the local
environment. With delivery disabled the command exits without sending. The worker
rejects enabling delivery without enabling writes and rejects a database role
other than `dive_worker`. Its workspace dependencies must be built; on a fresh
checkout, run `pnpm build` first.

`pnpm dev` already starts `tsx watch` for the worker, but that watcher restarts
on source changes, not on new database events. It is not a continuous queue
poller. Use `email:send` for an explicit delivery run. An exit without error is
not proof that an email reached an inbox; delivery may be disabled or the queue
may be empty.

## Rebuild the local development database

Documented: local reset tooling authorized by the product owner in chat on 2026-09-30.

Keep PostgreSQL running and stop `pnpm dev` before resetting:

```bash
pnpm db:reset:local
# Or reset first and start the app only if the reset succeeds:
pnpm dev:fresh
```

Both commands require an interactive terminal and typing `dive_spike` to confirm
the loss of all data in that database. `pnpm dev` remains non-destructive.

The reset loads `.env.example` and overrides from `.env.local`. It requires
`NODE_ENV=development` and all four application, worker, migration and admin
database URLs to target `dive_spike` on a loopback address at port `55432`, using
their existing roles. Query parameters and URL fragments are rejected.

These checks reject remote URL hosts, but do not prove the physical location of
the server behind a loopback connection. Never forward local port `55432` to a
remote or production database through an SSH tunnel or another proxy when using
the reset command. `NODE_ENV=development` alone is not a security boundary.

The script connects directly to the validated local PostgreSQL admin endpoint,
independently of the Docker context, recreates only
`dive_spike`, then runs the existing role bootstrap and versioned migrations.
It does not remove the volume, modify `dive_validation`, terminate active
database connections or seed product data. Active connections prevent the drop;
stop the app and other database clients first. A failure stops the sequence and
`dev:fresh` does not start the app. Database recreation and migrations are not
one atomic operation; a later failure can leave the new database partially set up.

Run the script's non-destructive tests with:

```bash
node --test scripts/reset-local-database.test.mjs
```

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

Requirements live in `specs/`. Correct a disagreeing README or Notion page against the approved SPEC. A genuine contract contradiction requires an explicit owner decision; do not silently change the SPEC.
