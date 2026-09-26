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
| Backend/API Implementer | NestJS API/services for approved requirement IDs |
| Frontend/Web + Widget Engineer | `apps/web`, hosted page, iframe widget |
| Tenancy & Data Isolation | RLS, query scoping, cross-tenant tests |
| Test & Evidence | Validation commands, tests, spike evidence, honest gaps |
| CI/CD + Quality Automation | Incremental GitHub Actions around tooling that already exists |
