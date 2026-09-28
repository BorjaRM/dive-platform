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
| `traceability-first-implementation` | Implementing requirement IDs from an implementation issue |
| `tenant-isolation-invariants` | Persistence, queries, RLS, `tenant_id`, or tenant/center resolution |
| `reuse-boundary-hygiene` | Adding or reviewing modules, helpers, contracts, adapters, public exports, shared UI, or cross-feature imports |
| `sdd-normative-change-hygiene` | Changing SPEC/ADR/TRACE |
| `fill-pr-validation` | Writing or reviewing the PR Validation section |
| `cross-cutting-performance-checklist` | Touching DB, API, worker/outbox, or web/widget |
| `vercel-react-best-practices` | Writing, reviewing, or refactoring React/Next.js code in `apps/web` |
| `vercel-composition-patterns` | Designing or refactoring reusable React component APIs in `apps/web` |
| `web-design-guidelines` | Reviewing UI, accessibility, design, or UX in `apps/web` |

For product implementation, the Development Brief lives only in the
implementation issue and the PR uses `Closes #<issue>`. Validation is
proportional: reproducible tests are the default proof, and Test Engineer is
optional rather than a required phase for every increment.

## Third-party skills

The Vercel skills are vendored and pinned. See [`THIRD_PARTY.md`](./THIRD_PARTY.md) for provenance, scope, precedence, and update instructions.
