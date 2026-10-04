# dive-platform — Copilot instructions

## Source of truth

Requirements, ADRs, spikes, and TRACE live in `specs/`. Implementation lives in code. Reproducible proof lives in tests. Use `evidence/` only for executed spikes, measurements, external-provider behavior, manual/regulatory review, or other time-bound proof that tests cannot preserve. Notion is navigation and status only.

Do not restate requirement text. Reference exact files and IDs (`DIVE-*`, `MT-REQ-*`, `MT-SPIKE-001`, `SPIKE-DIVE-001`, `SPIKE-DIVE-*-REQ-*`). Never write `SPIKE-001` in this repo; that ID is another product. If GitHub and Notion disagree, GitHub wins.

Use roles rather than personal names when attributing decisions, approvals or instructions in documentation. Preserve source links, dates and approval semantics.

**Documented -- Documentation wording:** product-owner direction on 2026-09-30 requires describing the idea, decision or proposal discussed rather than reproducing chat messages verbatim. Never quote or transcribe the user's chat wording in documents, including provenance and approval records. Preserve the source reference, role, date, scope and approval meaning through an accurate paraphrase; do not turn a question or proposal into approval.

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
- **Documented:** for current and future dashboard/center-facing work, consult `DIVE-IAM-REQ-030..032`, the confirmed authorization-capability/application-scope policy, the selected [simple BFF](../specs/iam/SPEC-DIVE-IAM-DASHBOARD-001.md#simple-bff-contract), [omission-prevention controls](../specs/iam/SPEC-DIVE-IAM-DASHBOARD-001.md#avoiding-route-omissions) and remaining implementation questions. Apply the [shared agent guidance](agents/README.md#principles-mandatory) authorized by the product-owner documentation request on 2026-09-30. Respect the selected contract and open deployment decisions; do not claim that required runtime/CI controls already exist. Do not infer application-wide coverage from catalog-only tests or an enabled administrative surface from future architectural capability. The SPEC owns the rules; do not copy them into agent profiles.
- `SPEC-DIVE-OPS-001` is Deferred; do not implement it in the walking skeleton.
- Performance is system-wide (DB, API, worker/outbox, web/widget). Do not invent numeric budgets.
- **Proposed, explicitly authorized in chat on 2026-10-04:** every new or altered PostgreSQL `SECURITY DEFINER` function must set an explicit safe `search_path`, revoke `EXECUTE` from `PUBLIC`, grant execution only to the named runtime role, and include an integration assertion for those privileges. This is security implementation guidance, not a product contract.

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

### Maintainable frontend styling

**Proposed, explicitly approved:** product-owner authorization in chat on 2026-09-30 to require minimal globals, responsibility-based CSS Modules, semantic tokens, reusable primitives and explicit variants in frontend design, implementation and review. This is engineering guidance, not a new product contract.

Apply these rules to new or changed styling in `apps/web` and shared frontend UI:

- **Minimal globals:** keep global CSS limited to framework imports, resets/base styles, typography and shared token definitions. Do not add feature selectors, component layouts or control-state rules to global styles.
- **CSS Modules by responsibility:** keep feature layouts and specialized presentation in the owning feature's CSS Modules; shared visual rules belong with their UI owner. Use composition when reuse is demonstrated. Choose boundaries by responsibility, not file size; do not create a module for every trivial fragment or import another feature's internal styles.
- **Semantic tokens:** use existing semantic tokens for reusable colors, typography, spacing, radii and control dimensions instead of duplicating literals. Override tokens at the owning area root for intentional visual differences. Keep feature-specific decorative values local when no reusable meaning exists; do not build a generic theme framework for hypothetical redesigns.
- **Reusable primitives:** inspect and reuse existing controls and shared states before adding markup or styles. Keep hover, focus, disabled and invalid states with the primitive owner; preserve native semantics, accessible labels, attributes, events and refs. Keep primitives local to the web app unless actual cross-app consumers justify `packages/ui`; apply the existing reuse and boundary criteria rather than forcing extraction.
- **Explicit variants:** express supported visual differences through named, typed variants such as size, tone or emphasis, not arbitrary `className`/`style` overrides, unrelated boolean flags or dynamically constructed CSS class names. Map domain states to visual variants inside the owning feature; primitives must not decide domain behavior.

Before completing frontend implementation or review, explicitly check all five rules in the touched slice. Repair in-scope violations before declaring completion; reviewers report concrete paths, impact and the smallest proportionate alternative. Report any remaining violation or unavailable validation rather than claiming compliance. Exceptions require explicit user authorization.

Keep styling separate from session, authorization, state and data ownership so later redesigns do not require flow changes. Tailwind is already available for local layout utilities; it does not replace these rules or authorize a wholesale migration or redesign. Use focused behavior/accessibility tests and the existing build for affected consumers and CSS composition; claim visual verification only when it was actually performed.

#### Units, spacing and responsive

**Proposed, explicitly approved:** product-owner authorization in chat on 2026-09-30 for relative units, shared typography roles, content/container-based responsive layouts and a spacing scale with 8-point layout steps and 4-point half steps. Apply this engineering guidance alongside the five styling rules above.

- Use `rem` for typography, spacing, radii and content/control dimensions that should follow user font preferences. Do not fix the root font size to force pixel equivalence. Keep `px` for precise borders, outlines and justified graphic details; use percentages, `fr` and intrinsic sizing for layout. Prefer padding and minimum sizes over fixed heights around text.
- Read the existing [spacing tokens](../apps/web/src/app/globals.css) before changing spacing. Each `--space-*` index represents a 4-point step expressed in `rem` (`--space-2: 0.5rem`, equivalent to 8px only with a 16px root). Non-zero `gap`, `row-gap`, `column-gap`, margin and padding must reference `var(--space-*)`, or a semantic control-padding token whose definition references that scale, rather than inline numeric `px`/`rem` values. Zero and intrinsic values such as `auto` remain valid. Apply the same rule to feature overrides and responsive rules. Prefer multiples of 8 for layout; half steps of 4 are available for compact controls. Normalize touched values deliberately, not by blindly rounding every dimension. Do not add a token for every old literal or introduce Sass/mixins solely for spacing. Use `calc()` only for a meaningful relation to existing tokens, not an arbitrary new spacing scale. Justify any off-scale spacing or decorative alignment exception at its owner and obtain explicit user authorization.
- Reuse semantic typography tokens and shared CSS Module roles for labels, helper text and section headings. Keep margins and layout with the consumer, not typography roles. Do not create a component or mixin per font size. Keep text sizes stable in `rem` within each responsive mode; do not interpolate font sizes with viewport/container units.
- Start with a usable narrow layout. Prefer Grid/Flex, wrapping, `minmax()`, `min-width: 0` and intrinsic sizing before breakpoints. Use container queries when reusable presentation depends on its available width; retain a usable base layout without query support. Use media queries for page-level structural changes. Keep thresholds few and content-driven, reuse existing thresholds where the content fits, and keep conditions with the owning CSS Module; ordinary CSS variables do not work directly in media/container conditions.
- Check units, spacing, typography and responsive behavior before completion or review. Run focused consumer tests and the existing production CSS build. When authorized and available, verify narrow/intermediate/wide viewports, zoom or larger default fonts, long text, overflow and accessible controls. Report any unperformed visual check explicitly; a successful build or DOM test is not responsive/visual proof. Exceptions require explicit user authorization.
- **Documented:** consult the [browser compatibility note](../apps/web/README.md#browser-compatibility) when selecting frontend CSS features or reviewing compatibility. Distinguish build-time CSS Modules composition from runtime CSS/browser support and the framework baseline. Do not infer legacy-browser support from `composes`, editor Custom Data, a base layout, or passing build/DOM tests. Ask for the supported browser/version matrix when compatibility is in scope rather than inventing targets or silently adding dependencies/polyfills.

## Pull requests

Follow `.github/pull_request_template.md`. An issue-backed product implementation PR links and closes its implementation issue. Under the explicit chat-authorized exception, record the authorization, requirement IDs and validation instead; do not invent an issue or `Closes` reference. Every PR needs a concise `Validation` section. Draft PRs must state what is incomplete and are not merge approval.

Before pushing code, run `pnpm check:fix` then `pnpm check`. CI is read-only; typecheck and test failures are not auto-fixed.
