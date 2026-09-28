---
name: fill-pr-validation
description: Fill the pull request Validation section from commands actually run. Use when opening or updating a PR, or when Validation is empty or claims CI/e2e that was not run.
---

# Fill PR Validation

Use `.github/pull_request_template.md` and the proportionality rules in `docs/sdd/how-we-work.md`.

Follow publication permissions in `.github/copilot-instructions.md`. If opening/updating a PR is not authorized, return the validation record in chat; do not create a PR or a parallel evidence file just to satisfy this skill. During review, report gaps without editing or publishing unless explicitly authorized.

## Procedure

1. Inspect what can actually run: `package.json` scripts and `.github/workflows/`.
2. Run only checks relevant to changed paths and risk, plus required repository gates. `pnpm check` already includes typechecking; use a focused command first when it can falsify the changed behavior. Spec changes also need `node scripts/validate-spec-governance.mjs --all`. Reviewers run read-only checks, never auto-fix commands.
3. Write **Automated checks** as one concise line per command: command + observed PASS/FAIL/not run. Do not paste logs or claim GitHub Actions passed unless they did.
4. Write **Focused tests** as a stable test path or focused command. If the automated command already identifies the proof, say so instead of repeating it.
5. Write **Manual validation** only for an uncovered user-visible or operational path. Otherwise write `Not applicable`.
6. Link **Evidence** only for executed spikes, measurements, external-provider behavior, security/manual/regulatory review, or other time-bound proof that tests cannot preserve. Ordinary test output does not need an `evidence/` file.
7. List **Known gaps** directly. Use `not executed` instead of creating placeholder evidence.
8. Delete unused template comments and non-applicable boilerplate before review.

## Do not create

- copied CI logs or terminal transcripts;
- screenshots of passing tests;
- generated reports already retained by CI;
- evidence files that only say a command was not run;
- TRACE updates when the coverage relationship did not change.

## Exit criteria

- Validation is concise and reproducible from the PR text, or from the chat record when publication was not authorized.
- Stable test/evidence paths support the claims.
- No claimed infrastructure is absent from the repository.
