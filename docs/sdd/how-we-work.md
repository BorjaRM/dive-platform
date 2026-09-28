# Spec-Driven Development (How we work)

## Source of truth

| Kind | Lives in |
|---|---|
| Requirements, ADRs, spikes, TRACE | `specs/` |
| Implementation | code |
| Reproducible proof | tests |
| Non-reproducible or time-bound proof | `evidence/` when required |
| Context, navigation, status | Notion index pages |

Notion must not keep an editable copy of a SPEC. If Notion and GitHub disagree, GitHub wins.

## Change flow

1. Update the SPEC/ADR in `specs/` only when behavior or a decision changes.
2. Update TRACE only when an artifact relationship, status/version pointer, or coverage relationship changes.
3. Add or update executable tests.
4. Implement the minimum change.
5. Produce a separate evidence artifact only when the proof cannot be represented adequately by tests and the PR validation record.
6. Review and merge.
7. Update Notion status and links only when the visible status changed.

## Proportional documentation and evidence

Use the smallest durable artifact that proves the claim:

1. **Tests are the default evidence.** Link stable test paths and name the relevant requirement IDs. Do not copy test output into a new Markdown file.
2. **The PR is the validation record.** Record commands and observed results concisely. Do not commit CI logs, terminal transcripts, generated reports, or screenshots that GitHub Actions or the test runner already retains.
3. **Use `evidence/` selectively.** A separate artifact is justified for executed spikes, concurrency/isolation measurements, performance or security results, external-provider behavior, regulatory/manual review, incident proof, or another time-bound observation that tests cannot preserve.
4. **Do not create evidence for absence.** Write `not executed`, `not applicable`, or a known gap in the PR instead of creating a placeholder file.
5. **Prefer links over copies.** TRACE points to the owning test or evidence path; Notion points to `main`. Neither repeats requirement text, DTOs, field lists, test matrices, or PR history.
6. **Update before adding.** Extend the owning SPEC, ADR, test, README, or evidence artifact instead of creating a parallel summary.
7. **Delete generated intermediates.** Keep only the minimal reviewed result needed for later audit or reproduction; regenerate disposable reports from commands.

A change does not need all documentation layers. For an ordinary implementation PR, SPEC/ADR may remain unchanged, TRACE may remain unchanged, tests provide proof, and the PR `Validation` section records the run.

## Pull requests

The normative entry criteria are defined in `specs/foundation/sdd-specs-traceability.md`. A non-draft pull request should make its scope, motivation, affected requirements, implementation, tests, risk, and rollback impact clear. Draft pull requests are allowed for collaboration when their incomplete work and blockers are explicit.

Every pull request description must include a `Validation` section:

- **Automated checks:** commands run and their observed result.
- **Focused tests:** only the command or stable test path that exercises the changed behavior.
- **Manual validation:** only for paths not covered by automation; keep setup, expected, and observed concise.
- **Evidence:** link a separate artifact only when the proportionality rules above require one; otherwise write `Not applicable — tests are the proof`.
- **Known gaps:** skipped checks, limitations, and follow-up work.

Delete non-applicable boilerplate. A one-line subsection is sufficient when it is honest and reproducible. Do not claim integration, end-to-end, or CI validation until those tools are available and were run.

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
