# Spec-Driven Development (How we work)

This is the working agreement for implementing features.

## Source of truth

- Requirements and contracts: `specs/`
- Implementation: code
- Proof: tests + reproducible evidence (`evidence/`)

## Change flow (PR-based)

1. Update the relevant SPEC/ADR in `specs/`
2. Update traceability (`specs/traceability/...`)
3. Add or update executable tests
4. Implement the minimum change to satisfy the spec
5. Produce reproducible evidence when applicable (spikes, performance, isolation)
6. Review and merge

## Definition of Ready / Done

Use the baseline in `specs/foundation/sdd-specs-traceability.md`.