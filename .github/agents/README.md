# Copilot agents (project-specific)

Workspace custom agents live here as `*.agent.md` files.

These agents target **VS Code + GitHub Copilot** (`target: vscode`). They are not maintained for Copilot cloud agent.

## Coordination (VS Code)

Custom agents do not auto-route from the default Copilot chat agent. Pick one from the Agents dropdown, or click a **handoff** after a response.

Two mechanisms:

| Mechanism | Who decides | Use for |
|---|---|---|
| **Handoff** (`send: false`) | You click the button | Phase change: write SPEC → gate → implement → evidence → review |
| **Subagent** (`agent` tool) | The active agent may invoke a **whitelisted** specialist | Same-phase specialist: isolation or tests/evidence |

Do **not** build a free mesh. Reviewers and writers must not implement. Implementers must not silently draft or promote SPECs.

Allowed subagent calls:

- Backend/API Implementer → Tenancy and Data Isolation Engineer, Test and Evidence Engineer
- Frontend/Web + Widget Engineer → Tenancy and Data Isolation Engineer, Test and Evidence Engineer
- Tenancy and Data Isolation Engineer → Test and Evidence Engineer

Everyone else: `agents: []` and no `agent` tool. SDD Writer, SDD Gatekeeper, Implementation PR Reviewer, and CI/CD + Quality Automation set `disable-model-invocation: true` so they are not invoked as subagents.

## Principles (mandatory)

- **Source of truth:** `specs/`. Notion is navigation/status only.
- **Never restate requirements.** Reference exact files and IDs.
- **Provenance:** label normative statements `Documented`, `Derived`, or `Proposed`.
- **IAM and outbox** are stop conditions for implementers, not missing agents.
- **Tenant isolation is cross-cutting:** load `tenant-isolation-invariants`. Do not merge Backend/API Implementer with Tenancy and Data Isolation Engineer.
- **Performance is cross-cutting:** DB, concurrency, API, worker/outbox, web/widget.
- **Stop** on missing or contradictory inputs; record an open question.

## Required reading for all agents

- `docs/sdd/how-we-work.md`
- `specs/foundation/sdd-specs-traceability.md`
- `specs/traceability/TRACE-DIVE-MVP-001.md`
- Relevant SPEC/ADR/spike files for the task
- `.github/copilot-instructions.md`

## How to choose

| Agent | Use when |
|---|---|
| SDD Writer | Draft or minimally edit SPEC/ADR/TRACE with provenance. Does not promote status. |
| SDD Gatekeeper | Review SPEC/ADR/TRACE: provenance, status, TRACE coverage |
| Implementation PR Reviewer | Implementation diff/PR: classify findings grave/moderado/leve; route by path; remit specs/** to Gatekeeper |
| Backend/API Implementer | `apps/api`, `apps/worker`, domain/application services for approved requirement IDs |
| Frontend/Web + Widget Engineer | `apps/web`, hosted page, iframe widget |
| Tenancy & Data Isolation | RLS, query scoping, cross-tenant tests, suspected leaks |
| Test & Evidence | Validation commands, tests, spike evidence, honest gaps |
| CI/CD + Quality Automation | Incremental GitHub Actions around tooling that already exists |

## Handoffs (VS Code)

Handoff buttons use `send: false` (prompt is pre-filled; you submit). Agents also print `Handoff:` in their output.

Typical flow:

1. **SDD Writer** → SDD Gatekeeper
2. **SDD Gatekeeper** → SDD Writer (fix provenance). If the change set is implementation-only, stop and use Implementation PR Reviewer.
3. **Implementers** → Tenancy (if isolation surface) → Test and Evidence → Implementation PR Reviewer; SDD Writer if a spec gap blocked coding; SDD Gatekeeper if `specs/**` changed
4. **Implementation PR Reviewer** → SDD Gatekeeper or Test and Evidence — not to implementers
5. **CI/CD + Quality Automation** → Implementation PR Reviewer
