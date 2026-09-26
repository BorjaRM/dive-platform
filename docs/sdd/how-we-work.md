# Spec-Driven Development (How we work)

## Source of truth

| Kind | Lives in |
|---|---|
| Requirements, ADRs, spikes, TRACE | `specs/` |
| Implementation | code |
| Proof | tests + `evidence/` |
| Context, navigation, status | Notion index pages |

Notion must not keep an editable copy of a SPEC. If Notion and GitHub disagree, GitHub wins.

## Change flow

1. Update the SPEC/ADR in `specs/`
2. Update TRACE
3. Add or update executable tests
4. Implement the minimum change
5. Produce evidence for spikes, isolation, or performance
6. Review and merge
7. Update Notion status and links only

## Definition of Ready / Done

See `specs/foundation/sdd-specs-traceability.md`.

Ready to start allows reversible implementation with synthetic data. Accepted is required before a real-data pilot unless an explicit exception is recorded.

## States

```text
Draft → Ready to start → Review → Accepted
                         ↘ Deferred
```
