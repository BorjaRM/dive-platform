---
name: fill-pr-validation
description: Fill the pull request Validation section from commands actually run. Use when opening or updating a PR, or when Validation is empty or claims CI/e2e that was not run.
---

# Fill PR Validation

Use `.github/pull_request_template.md`.

## Procedure

1. Inspect what can actually run: `package.json` scripts and `.github/workflows/`.
2. Run the relevant commands. Typical existing root scripts: `pnpm check`, `pnpm test`, `pnpm typecheck`. Spec changes also need `node scripts/validate-spec-governance.mjs`.
3. Write **Automated checks** with command + observed result. Do not claim GitHub Actions passed unless they did.
4. Write **Focused tests** with the file or command that exercises the change.
5. Write **Manual validation** only for uncovered paths (setup, steps, expected, observed).
6. Link **Evidence** for spikes, isolation, performance, or security. If the spike is not executed, say so.
7. List **Known gaps** (no e2e, no Docker, skipped checks).

## Exit criteria

- Validation can be reproduced from the PR text
- No claimed infrastructure that is absent from the repo
