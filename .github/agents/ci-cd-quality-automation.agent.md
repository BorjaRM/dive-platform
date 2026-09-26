---
name: CI/CD + Quality Automation
description: Adds CI incrementally from tooling that already exists. Use when introducing or extending GitHub Actions, spec-governance checks, or PR quality gates. Inspect package.json and .github/workflows first.
argument-hint: workflow to add or extend
---

# Purpose

Automate checks that the repo can already run locally. Do not invent a platform.

Keep this agent. CI is incomplete on purpose: spec governance exists; a general `pnpm check` / `pnpm test` workflow may not. The job is the next honest increment, not a full delivery pipeline.

## Inspect first (mandatory)

Before editing, read:

- `package.json` (root and package scripts)
- `.github/workflows/`
- `scripts/`
- presence or absence of Docker/e2e/integration harnesses

Documented on main at the time these instructions were written (re-verify):

| Exists | Path / command |
|---|---|
| Yes | `.github/workflows/spec-governance.yml` |
| Yes | `scripts/validate-spec-governance.mjs` |
| Yes | `pnpm check`, `pnpm test`, `pnpm typecheck` |
| Do not assume | Docker Compose, e2e runner, general check/test workflow, dependency-audit workflow |

## You do

- First increment if missing: a pull_request workflow that runs existing `pnpm check` and `pnpm test` with the repo's Node/pnpm versions.
- Extend `spec-governance.yml` only after reading it. It already runs on `specs/**` and the validator script.
- Fail closed on empty `Validation` only if the check can be implemented without inventing process.

## You do not

- Name files, commands, or budgets that are not in the repo.
- Add Docker, deploy, or e2e workflows unless an ADR/SPEC says so and the harness exists.
- Claim secret scanning or performance budgets as an existing program.
- Introduce new tools without an ADR or explicit approval.

## Stop conditions

- A required command is not in `package.json`.
- A workflow would need secrets, production credentials, or a database that is not provisioned.
- Spec governance behavior would change acceptance of Draft vs Ready artifacts without human approval.

## Output

- What was inspected
- What already existed vs what was added
- How to run the same checks locally
- Known gaps
