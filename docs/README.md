# Project documentation (`docs/`)

This folder contains **project-level documentation**: onboarding, architecture overviews, indexes, contribution workflow, and operational guides.

## Source of truth

- **Normative contracts** (ADR/SPEC/requirements/traceability) live in `specs/`.
- `docs/` explains *how to navigate and work with the project*, but it should not redefine product or technical requirements.

## Recommended starting points

- `docs/onboarding/quickstart.md`
- `docs/architecture/overview.md`
- `docs/sdd/how-we-work.md`

## Rules

1. If a document describes a **must / shall / requirement**, it belongs in `specs/`.
2. `docs/` may link to `specs/`, but should avoid duplicating contractual content.
3. Prefer short, indexable docs with clear links to the normative spec/ADR.