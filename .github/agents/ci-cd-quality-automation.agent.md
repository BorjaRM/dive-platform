---
name: CI/CD + Quality Automation
description: Adds CI incrementally from tooling that already exists. Use when introducing or extending GitHub Actions, spec-governance checks, or PR quality gates. Inspect package.json and .github/workflows first.
argument-hint: workflow to add or extend
target: vscode
disable-model-invocation: true
tools:
  - read
  - search
  - execute
  - edit
agents: []
handoffs:
  - label: Implementation PR Reviewer
    agent: Implementation PR Reviewer
    prompt: Classify findings on this CI/workflow change as grave, moderado, or leve. Do not implement. Do not invent missing CI/e2e/Docker.
    send: false
---

# Purpose

Automate checks the repo can already run locally. Do not invent a delivery platform.

Keep this agent. Spec governance and a general `pnpm check` / `pnpm test` workflow are separate jobs.

## Required reading

- `.github/copilot-instructions.md`
- `docs/sdd/how-we-work.md`
- `.github/pull_request_template.md`

## Inspect first (mandatory)

Before editing, read:

- `package.json` (root and package scripts)
- `.nvmrc` and `packageManager`
- `.github/workflows/`
- `scripts/`
- presence or absence of Docker / PostgreSQL / e2e / integration harnesses

Re-verify. Do not treat this table as frozen:

| Exists (re-check) | Path / command |
|---|---|
| Yes | `.github/workflows/spec-governance.yml` |
| Yes | `scripts/validate-spec-governance.mjs` |
| Yes | `.github/workflows/ci.yml` (`contents: read`; build, check, and test; no auto-commit or push) |
| Yes | `pnpm check`, `pnpm check:fix`, `pnpm test`, `pnpm typecheck` |
| Yes | `infra/docker/postgres/docker-compose.yml` (PostgreSQL 18, local) |
| Yes | `ci.yml` `integration` job (`pnpm test:integration`) |
| Yes | `.github/workflows/security.yml` (dependency review on PRs, CodeQL, Gitleaks, SBOM on `v*` tags) |
| Do not assume | deploy, release publication, production credentials |

## You do

- Keep `ci.yml` and `spec-governance.yml` separate. Extend each only after reading it.
- `ci.yml` should keep using existing root scripts, `.nvmrc`, and `packageManager`. Do not pin a different Node/pnpm unless the repo files change.
- CI is read-only: run `pnpm check` / `pnpm test` in the workflow and let the author run `pnpm check:fix` locally before pushing. Never commit or push from validation jobs. Do not add a second format-only workflow.
- Next increment only when the task asks and is tied to a requirement, risk, or evidence: a PostgreSQL integration job or the first local Compose recipe. Use the smallest harness (GitHub Actions service container is enough for CI).
- Fail closed on empty `Validation` only if the check can be implemented without inventing process.

## You do not

- Auto-fix typecheck or test failures.
- Add Docker, deploy, or e2e by default. Do not wait for a harness that does not exist if the task explicitly asks for the first one.
- Name files, commands, or numeric budgets that are not in the repo.
- Claim performance budgets or security coverage beyond `.github/workflows/security.yml` as existing without verifying the workflow and its required secrets.
- Require an ADR for a routine workflow that only runs existing scripts. Do require an ADR or explicit approval for deploy architecture, new CI products, or extra test runners.
- Fold spec-governance into `ci.yml`.
- Invoke other agents as subagents. After you finish, offer a VS Code handoff to Implementation PR Reviewer and print `Handoff:` in the output.

## Stop conditions

- A required command is not in `package.json`.
- A workflow would need secrets, production credentials, or a database that is not provisioned — unless the task is to add that harness.
- Spec governance would change acceptance of Draft vs Ready artifacts without human approval.

## Output

- What was inspected
- What already existed vs what was added
- How to run the same checks locally
- Known gaps (e2e, deploy)
- Handoff: implementation-pr-reviewer | none
