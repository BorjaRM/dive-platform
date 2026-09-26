# dive-platform — Copilot instructions

## Source of truth

Requirements, ADRs, spikes, and TRACE live in `specs/`. Implementation lives in code. Proof lives in tests and `evidence/`. Notion is navigation and status only.

Do not restate requirement text. Reference exact files and IDs (`DIVE-*`, `MT-REQ-*`, `MT-SPIKE-001`, `SPIKE-DIVE-001`, `SPIKE-DIVE-*-REQ-*`). Never write `SPIKE-001` in this repo; that ID is another product. If GitHub and Notion disagree, GitHub wins.

Required reading before product or architecture work:

- `docs/sdd/how-we-work.md`
- `specs/foundation/sdd-specs-traceability.md`
- `specs/traceability/TRACE-DIVE-MVP-001.md`

## Provenance

Any new or changed normative statement must be labeled:

- `Documented`: exact existing source; meaning unchanged
- `Derived`: explained from sources; remains Draft until explicit approval
- `Proposed`: new decision; non-normative until approved

Missing or contradictory information is an open question. Do not silently pick defaults, TTLs, states, permissions, invariants, or acceptance criteria.

Do not promote a SPEC or ADR to Ready to start, Review, or Accepted without explicit human confirmation.

## Tooling honesty

Inspect the repository before claiming CI, Docker, e2e, or integration infrastructure.

Verify before use (do not treat this list as frozen):

- Spec CI: `.github/workflows/spec-governance.yml` and `scripts/validate-spec-governance.mjs`
- App CI: `.github/workflows/ci.yml` (same-repo PRs apply `pnpm check:fix`, then `pnpm check` and `pnpm test`; separate `integration` job with PostgreSQL 18)
- Root scripts in `package.json`: `pnpm check`, `pnpm check:fix`, `pnpm test`, `pnpm typecheck`
- Apps: `apps/web`, `apps/api`, `apps/worker` (starters; topology is not fully provisioned)

Docker Compose + integration PostgreSQL exist for MT-SPIKE-001 (`infra/docker/postgres`, `pnpm test:integration`). Do not claim e2e or product migrations unless those files exist.

## Cross-cutting constraints

- Tenant isolation is mandatory. No temporary RLS bypass.
- Keep `MT-REQ-*` separate from `DIVE-*` results.
- IAM (`specs/iam/SPEC-DIVE-IAM-001.md`) and outbox/worker (`ADR-DIVE-002`) apply even without a dedicated agent.
- `SPEC-DIVE-OPS-001` is Deferred; do not implement it in the walking skeleton.
- Performance is system-wide (DB, API, worker/outbox, web/widget). Do not invent numeric budgets.

## Pull requests

Follow `.github/pull_request_template.md`. Every PR needs a `Validation` section. Draft PRs must state what is incomplete and are not merge approval.

Before pushing code, run `pnpm check:fix` then `pnpm check`. Same-repo PRs also get Biome applied by CI; typecheck and test failures are not auto-fixed.
