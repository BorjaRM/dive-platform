# dive-platform — Copilot instructions

## Source of truth

Requirements, ADRs, spikes, and TRACE live in `specs/`. Implementation lives in code. Reproducible proof lives in tests. Use `evidence/` only for executed spikes, measurements, external-provider behavior, manual/regulatory review, or other time-bound proof that tests cannot preserve. Notion is navigation and status only.

Do not restate requirement text. Reference exact files and IDs (`DIVE-*`, `MT-REQ-*`, `MT-SPIKE-001`, `SPIKE-DIVE-001`, `SPIKE-DIVE-*-REQ-*`). Never write `SPIKE-001` in this repo; that ID is another product. If GitHub and Notion disagree, GitHub wins.

Use roles rather than personal names when attributing decisions, approvals or instructions in documentation. Preserve source links, dates and approval semantics.

Do not create parallel summaries, copied test logs, placeholder evidence, or TRACE churn. Tests are the default evidence; the PR `Validation` section records commands and observed results. Follow `docs/sdd/how-we-work.md` for proportional documentation.

Product implementation normally follows: approved SPEC/ADR → implementation issue created from `.github/ISSUE_TEMPLATE/implementation-increment.md` → implementation PR with `Closes #<issue>`. The Development Brief lives only in the issue. The PR must not copy it. **Documented:** an explicit bounded chat authorization may waive the issue/brief entry gate under [the workflow exception](../docs/sdd/development-brief-template.md#explicit-chat-authorization); do not create an issue against that instruction. Approved contracts, blocking decisions, tests, isolation, handoff and publication gates remain mandatory.

Before product or architecture work, use the [task index](../docs/README.md#find-the-task-owner). Read the applicable sections of `docs/sdd/how-we-work.md` and `specs/foundation/sdd-specs-traceability.md`, then the owning SPEC requirement IDs and relevant ADRs. Consult only the affected ownership, artifact-map or coverage sections of TRACE; do not load all specs, baselines or the full TRACE by default. Follow dependencies only when the task crosses their boundary. Mandatory constraints and approval gates still apply.

Reference current documents by path and requirement ID without repeating versions. Retain pinned revisions, PRs, commits or dates for historical approval and evidence. Headers and TRACE own current versions; the reference policy lives in `specs/foundation/sdd-specs-traceability.md#artifact-versions`.

## Custom agents (VS Code)

Workspace custom agents live in `.github/agents/`. Choose using `.github/agents/README.md`. Draft SPEC/ADR/TRACE with SDD Writer; review those artifacts with SDD Reviewer. IAM and outbox/worker still apply without a dedicated agent.

### Supervised coordination

Documented: the user-approved configuration is VS Code only, with confirmation before handoffs and bounded same-phase delegation.

- Follow the coordination and delegation contract in `.github/agents/README.md`.
- Before any handoff, summarize the result, name the next agent, explain the reason and remaining scope, and ask whether to continue. Keep `send: false` and wait for the user to select and submit the handoff; a printed `Handoff:` is a recommendation, not execution or consent.
- Only Backend and Frontend may delegate, directly to Tenancy or Test Engineer within the authorized slice. Announce the task, reason, and read-only or edit scope before invoking a specialist. Routine in-scope delegation does not require another confirmation. Never use a subagent to bypass a phase-change confirmation.
- A subagent returns its findings, changes, checks, and blockers to its caller. It cannot delegate again, initiate a handoff, or publish remotely. Keep one writer active in the shared worktree.
- Missing or contradictory product decisions require a pause and a concrete question. Failing tests and defects with an established contract should be repaired within scope; do not escalate every repair as a new product decision. Declaring a difference from the brief does not authorize a scope expansion.
- Do not create a branch, commit, push, open a PR, publish comments, or merge unless the user explicitly authorizes that operation. An implementation issue is not blanket publication permission. When publication is not authorized, report validation in chat without creating a duplicate brief or evidence file.
- Reviewer terminal access is for inspection and existing checks only, never file rewrites, auto-fix, commits, or shell-based workarounds for denied actions. Tool lists are not a filesystem sandbox; command approvals remain necessary.

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
- Reuse inspection and boundary protection are mandatory when adding or moving modules, services, repositories, helpers, contracts, adapters, public exports, shared UI, or cross-feature imports. Use `.github/skills/reuse-boundary-hygiene/SKILL.md`. Force the search and justification, not extraction; boundary violations block completion.
- Keep `MT-REQ-*` separate from `DIVE-*` results.
- IAM (`specs/iam/SPEC-DIVE-IAM-001.md`) and outbox/worker (`ADR-DIVE-002`) apply even without a dedicated agent.
- **Documented:** for current and future dashboard/center-facing work, consult `DIVE-IAM-REQ-030..032`, the confirmed authorization-capability/application-scope policy, and the recorded implementation questions in [SPEC-DIVE-IAM-DASHBOARD-001](../specs/iam/SPEC-DIVE-IAM-DASHBOARD-001.md). Respect the current Documented product restriction and the open enforcement contracts; the SPEC distinguishes those from the derived Draft verification guidance. Do not infer application-wide coverage from catalog-only tests or an enabled administrative surface from future architectural capability. The SPEC owns the rules; do not copy them into agent profiles.
- `SPEC-DIVE-OPS-001` is Deferred; do not implement it in the walking skeleton.
- Performance is system-wide (DB, API, worker/outbox, web/widget). Do not invent numeric budgets.

## Engineering standards

- Use domain language in names. Keep functions and modules focused on one coherent responsibility.
- Preserve dependency direction: domain code must not import frameworks or vendor SDKs.
- Prefer composition and existing repository APIs. Introduce a pattern or abstraction only when it removes demonstrated duplication, isolates a real external dependency, or supports known variation.
- Before adding a shared abstraction or public export, identify the behavior owner and existing consumers. Record whether the change reused an owner, stayed local, or extracted shared behavior and why.
- Preserve public contracts unless an approved requirement explicitly changes them.
- Test observable behavior and boundaries, not private implementation details. Scale coverage with the change's risk and blast radius.
- Refactor only the area needed to deliver the requested behavior; keep unrelated cleanup out of the change.

### Readability and simplicity

**Proposed, explicitly approved:** product-owner authorization on 2026-09-30 for readable agent-generated code and readability-aware review. This is implementation guidance, not a new product contract.

- Prefer code whose intent, control flow and state ownership are easy to follow. When correctness and required performance are equivalent, choose the simpler implementation; fewer lines, effects, hooks, components or files are not goals by themselves.
- Make decision priorities explicit with guard clauses, ordered `if` statements or `switch` when they clarify the behavior. Avoid chained ternaries for lifecycle, authentication, authorization or scope decisions; a simple two-way ternary remains appropriate.
- Use names that distinguish requested values, validated values, operation state and derived presentation state. Keep authoritative state in one place; do not add mirrored state just to make a conditional shorter.
- Keep small decisions local. Introduce a focused helper or component only when its name and boundary make the caller easier to understand or satisfy the existing reuse criteria. Do not replace a dense expression with scattered trivial abstractions or a large hook that merely hides it.
- Keep cleanup, cancellation, stale-result protection and security boundaries visible. Use advanced React patterns only for a concrete lifecycle or performance need, not as a stylistic default; simplicity does not justify weakening those guarantees.
- Before completing implementation or review, check readability separately from behavior: can a reader follow state precedence, transitions and side effects without reconstructing hidden rules? Report concrete maintenance risks with a proportionate alternative. Passing tests alone do not establish maintainability.

## Pull requests

Follow `.github/pull_request_template.md`. An issue-backed product implementation PR links and closes its implementation issue. Under the explicit chat-authorized exception, record the authorization, requirement IDs and validation instead; do not invent an issue or `Closes` reference. Every PR needs a concise `Validation` section. Draft PRs must state what is incomplete and are not merge approval.

Before pushing code, run `pnpm check:fix` then `pnpm check`. CI is read-only; typecheck and test failures are not auto-fixed.
