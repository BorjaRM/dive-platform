# dive-platform — Copilot instructions

## Source of truth

Requirements, ADRs, spikes, and TRACE live in `specs/`. Implementation lives in code. Reproducible proof lives in tests. Use `evidence/` only for executed spikes, measurements, external-provider behavior, manual/regulatory review, or other time-bound proof that tests cannot preserve. Notion is navigation and status only.

Do not restate requirement text. Reference exact files and IDs (`DIVE-*`, `MT-REQ-*`, `MT-SPIKE-001`, `SPIKE-DIVE-001`, `SPIKE-DIVE-*-REQ-*`). Never write `SPIKE-001` in this repo; that ID is another product. If GitHub and Notion disagree, GitHub wins.

Do not create parallel summaries, copied test logs, placeholder evidence, or TRACE churn. Tests are the default evidence; the PR `Validation` section records commands and observed results. Follow `docs/sdd/how-we-work.md` for proportional documentation.

For each implementation issue or PR, use `docs/sdd/development-brief-template.md` to describe the short end-to-end increment. Copy the brief headings into the issue/PR; do not create a new SPEC or standalone brief file when existing requirement IDs already authorize the behavior.

Required reading before product or architecture work:

- `docs/sdd/how-we-work.md`
- `specs/foundation/sdd-specs-traceability.md`
- `specs/traceability/TRACE-DIVE-MVP-001.md`

## Custom agents (VS Code)

Workspace custom agents live in `.github/agents/`. Choose using `.github/agents/README.md`. Draft SPEC/ADR/TRACE with SDD Writer; review those artifacts with SDD Gatekeeper. IAM and outbox/worker still apply without a dedicated agent.

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
- App CI: `.github/workflows/ci.yml` (read-only validation with build, check, test, artifact checks, and a separate PostgreSQL 18 integration job)
- Root scripts in `package.json`: `pnpm check`, `pnpm check:fix`, `pnpm test`, `pnpm typecheck`
- Apps: `apps/web`, `apps/api`, `apps/worker`

Docker Compose + integration PostgreSQL exist for MT-SPIKE-001 (`infra/docker/postgres`, `pnpm test:integration`). Do not claim product e2e, deploy, or release infrastructure unless those files exist and the relevant checks were run.

## Cross-cutting constraints

- Tenant isolation is mandatory. No temporary RLS bypass. Use `.github/skills/tenant-isolation-invariants/SKILL.md` when changing persistence, queries, RLS, or tenant/center resolution.
- Keep `MT-REQ-*` separate from `DIVE-*` results.
- IAM (`specs/iam/SPEC-DIVE-IAM-001.md`) and outbox/worker (`ADR-DIVE-002`) apply even without a dedicated agent.
- `SPEC-DIVE-OPS-001` is Deferred; do not implement it in the walking skeleton.
- Performance is system-wide (DB, API, worker/outbox, web/widget). Do not invent numeric budgets.

## Engineering standards

- Use domain language in names. Keep functions and modules focused on one coherent responsibility.
- Preserve dependency direction: domain code must not import frameworks or vendor SDKs.
- Prefer composition and existing repository APIs. Introduce a pattern or abstraction only when it removes demonstrated duplication, isolates a real external dependency, or supports known variation.
- Preserve public contracts unless an approved requirement explicitly changes them.
- Test observable behavior and boundaries, not private implementation details. Scale coverage with the change's risk and blast radius.
- Refactor only the area needed to deliver the requested behavior; keep unrelated cleanup out of the change.

## Pull requests

Follow `.github/pull_request_template.md`. Every PR needs a concise `Validation` section. Draft PRs must state what is incomplete and are not merge approval.

Before pushing code, run `pnpm check:fix` then `pnpm check`. CI is read-only; typecheck and test failures are not auto-fixed.
