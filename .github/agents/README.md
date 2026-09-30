# Copilot agents (project-specific)

Workspace custom agents live here as `*.agent.md` files.

These agents target **VS Code + GitHub Copilot** (`target: vscode`). They are not maintained for Copilot cloud agent.

## Coordination (VS Code)

Start with Backend or Frontend and provide the implementation issue URL/number, or the explicit issue-free chat authorization and its bounded scope. **Documented:** [the workflow exception](../../docs/sdd/development-brief-template.md#explicit-chat-authorization) governs that alternative. The default chat does not run this workflow automatically. The user keeps control of phase changes; no coordinator agent or cloud setup is required.

Two mechanisms:

| Mechanism | Who decides | Use for |
|---|---|---|
| **Handoff** (`send: false`) | The agent explains why and asks; you select and submit | Change of phase or owner: Backend/Frontend, implementation/review, or a normative decision |
| **Subagent** (`agent` tool) | Backend/Frontend announces a bounded task and invokes an allowed specialist | Same-phase isolation or tests/evidence within the already authorized scope |

Do **not** build a free mesh. Reviewers and writers must not implement. Implementers must not silently draft or promote SPECs.

Allowed subagent calls:

- Backend → Tenancy, Test Engineer
- Frontend → Tenancy, Test Engineer

Everyone else: `agents: []` and no `agent` tool. No nested delegation. Backend, Frontend, SDD Writer, SDD Reviewer, PR Reviewer, and CI Engineer set `disable-model-invocation: true`; the allowlists above include only the two specialists. Do not add reviewers or other implementers to those allowlists to bypass a handoff.

### Delegation contract

Before calling a specialist, announce the task, reason, and permitted actions. Supply a self-contained assignment with:

- the issue URL/number or explicit chat authorization and bounded scope, plus relevant requirement IDs and exact SPEC/ADR paths or sections;
- the focused question or deliverable and relevant code/test paths;
- in/out boundaries, dependencies already decided, and known blockers;
- whether the task is read-only or may edit, with the allowed file surface;
- the expected checks and return format.

For issue-backed work, link the Development Brief; do not reproduce it in a separate artifact. For issue-free work, supply the explicit authorization and scope without creating a replacement brief. Do not assume a subagent inherits the conversation. If it cannot read the required issue or authorization context, it returns that blocker instead of reconstructing it.

The specialist returns: outcome (completed or blocked), findings or changed paths, commands and observed results, remaining risks, and open questions. It does not hand off or publish. The caller checks the result against the actual diff and tests; a subagent's conclusion is not proof. Keep one writer active; do not edit the same worktree while an editing specialist runs.

### Tools and checks

Profiles explicitly list tools. GitHub tools use the server ID configured in `.vscode/mcp.json`; Next.js tools use `next-devtools`. Check tool discovery in VS Code Chat Diagnostics after a server rename or reload. Missing tools are not permission to bypass role restrictions through the shell. If GitHub reading is unavailable, ask for access or the issue body in chat and disclose that it was not fetched live.

Read only relevant source sections and skill rules. Use existing focused checks, then applicable repository gates. `pnpm check` already includes typechecking. Reviewers must not run `pnpm check:fix` or other source-rewriting commands. The current CI does not guarantee brief completeness, populated Validation, or that this agent workflow ran; do not describe those as enforced gates.

## Principles (mandatory)

- **Source of truth:** `specs/`. Notion is navigation/status only.
- **Never restate requirements.** Reference exact files and IDs.
- **Provenance:** label normative statements `Documented`, `Derived`, or `Proposed`.
- **IAM and outbox** are stop conditions for implementers, not missing agents.
- **Tenant isolation is cross-cutting:** load `tenant-isolation-invariants`. Do not merge Backend with Tenancy.
- **Reuse and boundary hygiene is cross-cutting:** load `reuse-boundary-hygiene` when modules, helpers, contracts, adapters, exports, shared UI, or cross-feature imports change. Require an explicit reuse decision; do not require extraction without evidence. Boundary violations block completion.
- **Performance is cross-cutting:** DB, concurrency, API, worker/outbox, web/widget.
- **Implementation entry:** product work requires an issue with its single Development Brief or the workflow's explicit chat-authorization exception, plus applicable SPEC/ADR(s) and approved requirement IDs. Review/Accepted does not remove a contract's authority; unapproved subsections and blocking decisions remain gates.
- **Validation is proportional:** tests are the default proof; Test Engineer is an optional specialist when tests, Validation, or special evidence are missing.
- **Pause** on missing or contradictory behavior decisions; record an open question. Repair in-scope implementation defects using the established contract. Do not mistake tests still to be written for a reason to abandon the authorized task.

## Progressive reading

**Documented:** the [SDD baseline](../../specs/foundation/sdd-specs-traceability.md#artifact-versions) owns the user-approved reference and task-routing policy. Reading fewer unrelated documents does not remove constraints, role restrictions or approval gates.

1. Apply `.github/copilot-instructions.md`, this file's coordination contract and the active profile's role-specific requirements. Use the [task index](../../docs/README.md#find-the-task-owner) to locate the behavior owner.
2. For product or architecture work, read the applicable sections of `docs/sdd/how-we-work.md` and `specs/foundation/sdd-specs-traceability.md`. Read the target requirement IDs, their approval/provenance, relevant SPEC sections and governing ADR decisions; do not infer authority from an index.
3. Read only the affected TRACE ownership/map/coverage sections when locating IDs, checking authority or proof, or updating relationships. Load applicable cross-cutting skills and baselines for the surface touched. Follow another document only when it controls an unresolved contract or dependency.
4. Reuse context already read in the current task while it remains current. Expand reading for contradictory decisions or broader authorized scope, not to cover every document. Do not load full TRACE, all baselines or all SPECs by default.

Profiles list additional reading for their role; those lists are not instructions to load whole files unconditionally. Current references use stable paths/IDs. Historical approval and evidence references retain their pinned revision, PR, commit or date.

## Workflow (you are the coordinator)

The active agent implements, validates, and may use the two specialists. It asks before changing phase or owner; you advance through a confirmed handoff. A cross-surface issue or issue-free authorization retains the same bounded scope, not a copied brief per agent.

```text
SPEC change
  you → SDD Writer → handoff → SDD Reviewer
                              ↘ handoff → SDD Writer (fix provenance)

Ready-to-start implementation
  you → implementation issue + Development Brief
      → Backend or Frontend
          ↳ may subagent Tenancy (if isolation surface)
          ↳ may subagent Test Engineer (when focused proof needs help)
          ↳ confirmed handoff → Frontend / Backend for the remaining authorized surface
          ↳ direct handoff → PR Reviewer when validation is sufficient
          ↳ optional handoff → Test Engineer when tests, Validation, or special evidence are missing
                              → PR Reviewer
                          ↳ handoff → Backend / Frontend / Tenancy (fix findings)
                          ↳ handoff → SDD Reviewer (specs/** only)
                          ↳ then you hand off back to Reviewer
```

Pick **Backend** vs **Frontend** from the Reviewer buttons according to the finding paths. Do not expect the Reviewer to spawn implementers on its own.

## How to choose

| Agent | Use when |
|---|---|
| SDD Writer | Draft or minimally edit SPEC/ADR/TRACE with provenance. Does not promote status. |
| SDD Reviewer | Review SPEC/ADR/TRACE: provenance, status, TRACE coverage |
| PR Reviewer | Implementation diff/PR: classify findings grave/moderado/leve by impact; route by path; remit specs/** to SDD Reviewer |
| Backend | `apps/api`, `apps/worker`, domain/application services for approved requirement IDs |
| Frontend | `apps/web`, hosted page, iframe widget |
| Tenancy | RLS, query scoping, cross-tenant tests, suspected leaks; read-only or editing as assigned |
| Test Engineer | Validation commands, tests, spike evidence, honest gaps; not production behavior |
| CI Engineer | Incremental GitHub Actions around tooling that already exists |

## Handoffs (VS Code)

Handoff buttons use `send: false` (prompt is pre-filled; you submit). Before offering a handoff, the active agent states what is finished, what remains, the next agent's exact display name, and why that agent is needed. It asks whether to continue and waits. Even `send: true` would not create autonomous routing; keep it false.

Example: "Backend validation passed. The issue still includes the catalog UI. Continue with Frontend to implement that surface against the validated contract?" Do not ask for a handoff when the task is complete and no next step is needed. When running as a subagent, return to the caller instead of asking the user.

Typical flow:

1. **SDD Writer** → SDD Reviewer
2. **SDD Reviewer** → SDD Writer (fix provenance). If the change set is implementation-only, stop and use PR Reviewer.
3. **Implementers** → PR Reviewer when validation is sufficient; optionally → Test Engineer for missing tests, Validation, or special evidence; SDD Writer if a spec gap blocked coding; SDD Reviewer if `specs/**` changed
4. **PR Reviewer** → SDD Reviewer (specs), optionally Test Engineer (real proof/Validation gaps), or the matching implementer (**Backend**, **Frontend**, **Tenancy**, **CI Engineer**) to check and fix supported findings. Those are confirmed handoffs, not subagents: the Reviewer still does not implement.
5. **CI Engineer** → PR Reviewer

Corrections may challenge a finding with a reproducible test or exact source; they must not blindly implement an unsupported review claim. Each repair reruns the relevant check. If a cycle produces no new evidence or progress, stop and explain the unresolved disagreement rather than repeating handoffs.
