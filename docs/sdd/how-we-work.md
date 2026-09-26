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

## Pull requests

The normative entry criteria are defined in `specs/foundation/sdd-specs-traceability.md`. A non-draft pull request should make its scope, motivation, affected requirements, implementation, tests, risk, and rollback impact clear. Draft pull requests are allowed for collaboration when their incomplete work and blockers are explicit.

Every pull request description must include a `Validation` section:

- **Automated checks:** commands run and their results, such as `pnpm check` and `pnpm test`.
- **Focused tests:** the command, fixture, or test case that exercises the changed behavior.
- **Manual validation:** setup, steps, expected result, and observed result for paths not covered by automation.
- **Evidence:** links to the required proof for spikes, isolation, performance, security, or other non-functional changes.
- **Known gaps:** skipped checks, limitations, and follow-up work.

Reviewers use this section to reproduce the change and verify that the evidence supports the affected requirements. Do not claim integration, end-to-end, or CI validation until those tools are available in the repository.

## Definition of Ready / Done

See `specs/foundation/sdd-specs-traceability.md`.

Ready to start allows reversible implementation with synthetic data. Accepted is required before a real-data pilot unless an explicit exception is recorded.


## Versions

Each normative artifact in `specs/` has its own `Version` header. Do not force every SPEC, ADR, and baseline onto the same number.

- Bump an artifact version only when that file’s meaning changes.
- `TRACE-DIVE-MVP-001` is the documentation map. Notion indexes must display that TRACE version (or “see TRACE”), never an independent Notion number.
- Notion pages may mirror the linked GitHub header. They must not invent a second version sequence.
- The reusable baseline currently lives in this repository at `specs/foundation/`. It is not extracted to a separate repo. The Spanish Notion Base remains a generic template; GitHub `specs/foundation/` is the executable copy for this product.

## States

```text
Draft → Ready to start → Review → Accepted
                         ↘ Deferred
```
