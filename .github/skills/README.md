# Copilot skills (project-specific)

Each skill is a directory with `SKILL.md`.

- `name` in frontmatter must be lowercase kebab-case and **match the directory name**.
- `description` must say what the skill does **and when to use it** (this is the auto-load trigger).
- Invalid names fail silently.

Do not restate requirements; reference `specs/**` and IDs.
Do not claim CI/e2e/Docker unless present.
Skills auto-load from `description`; `/skill-name` also works. That does not add extra user turns.

## Skills

| Directory | Use when |
|---|---|
| `traceability-first-implementation` | Implementing requirement IDs |
| `sdd-normative-change-hygiene` | Changing SPEC/ADR/TRACE |
| `fill-pr-validation` | Writing or reviewing the PR Validation section |
| `cross-cutting-performance-checklist` | Touching DB, API, worker/outbox, or web/widget |
