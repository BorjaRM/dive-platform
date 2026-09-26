# Copilot agents (project-specific)

Workspace custom agents live here as `*.agent.md` files.

VS Code also detects plain `.md` in this folder; GitHub Copilot cloud agent expects `.agent.md`. Use the `.agent.md` suffix.

Omit `target` so an agent is available in VS Code and on GitHub Copilot cloud. Set `target: vscode` or `target: github-copilot` only to restrict it.

## Principles (mandatory)

- **Source of truth:** `specs/`. Notion is navigation/status only.
- **Never restate requirements.** Reference exact files and IDs.
- **Provenance:** label normative statements `Documented`, `Derived`, or `Proposed`.
- **IAM and outbox** are stop conditions for implementers, not missing v0 agents.
- **Performance is cross-cutting:** DB, concurrency, API, worker/outbox, web/widget.
- **Stop** on missing or contradictory inputs; record an open question.
- **No v0 subagents.** Do not add the `agent` tool. Implementers finish, then offer a **handoff** (user clicks). The Implementation PR Reviewer routes by path and skills; it does not invoke implementers.

## Required reading for all agents

- `docs/sdd/how-we-work.md`
- `specs/foundation/sdd-specs-traceability.md`
- `specs/traceability/TRACE-DIVE-MVP-001.md`
- Relevant SPEC/ADR/spike files for the task
- `.github/copilot-instructions.md`

## How to choose

| Agent | Use when |
|---|---|
| SDD Gatekeeper | SPEC/ADR/TRACE review, provenance, status, TRACE coverage |
| Implementation PR Reviewer | Implementation diff/PR: classify findings grave/moderado/leve; route by path; remit specs/** to Gatekeeper |
| Backend/API Implementer | NestJS API/services for approved requirement IDs |
| Frontend/Web + Widget Engineer | `apps/web`, hosted page, iframe widget |
| Tenancy & Data Isolation | RLS, query scoping, cross-tenant tests |
| Test & Evidence | Validation commands, tests, spike evidence, honest gaps |
| CI/CD + Quality Automation | Incremental GitHub Actions around tooling that already exists |

## Handoffs (VS Code)

Implementers expose handoff buttons (`send: false`) to **Implementation PR Reviewer** and **SDD Gatekeeper** (use Gatekeeper when `specs/**` changed). GitHub.com cloud agent ignores `handoffs`; agents still print the name in their output.

SDD Gatekeeper has no handoffs. Implementation PR Reviewer may hand off to Gatekeeper or Test and Evidence Engineer — not to implementers.
