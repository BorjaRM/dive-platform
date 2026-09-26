# Copilot agents (project-specific)

This folder defines *project-scoped* agents for GitHub Copilot.

## Principles (mandatory)

- **Source of truth:** Requirements/ADRs/spikes/TRACE live in `specs/`. Notion is navigation/status only.
- **Never restate requirements** outside `specs/`. Reference exact files and requirement IDs instead.
- **Provenance:** Any normative statement must be explicitly marked as `Documented`, `Derived`, or `Proposed`.
- **Performance is cross-cutting:** treat performance as a system concern (DB, concurrency, API, worker, and web).
- **Stop conditions:** if inputs are missing/contradictory, record an open question and escalate.

## Required reading for all agents

- `docs/sdd/how-we-work.md`
- `specs/traceability/TRACE-DIVE-MVP-001.md`
- Relevant SPEC/ADR files for the task.
