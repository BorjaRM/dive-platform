# SDD, specifications, and traceability (baseline)

- **Status:** Ready to start
- **Version:** 0.3

## Source of truth

GitHub is the source of truth for specs, ADRs, contracts, migrations, code, tests, and evidence.

Notion is used for context, navigation, and status. Notion must not keep a second editable copy of a spec.

```text
requirement → spec → ADR/contract/migration → code → test → pull request → evidence
```

## Change flow

1. Modify the SPEC or ADR on a branch.
2. Open a pull request with justification and impact.
3. Review product, architecture, data, security, privacy, and operations.
4. Update contracts, migrations, and tests.
5. Merge and implement.
6. Verify conformance and update Notion status only.

## Pull request criteria

A non-draft pull request is ready for review when:

- The scope and motivation are clear, with links to the applicable SPEC, ADR, contract, or issue.
- The affected requirements, TRACE entries, contracts, migrations, and evidence are identified.
- The implementation and all applicable unit, integration, contract, isolation, and operational tests are included.
- Applicable checks pass, or the pull request explicitly records the failing check and its reason.
- Security, privacy, data, operations, rollback, and compatibility impact are addressed when applicable.
- The pull request description records how to validate the change, including commands, manual steps, expected results, and known limitations.

Draft pull requests may be opened earlier for collaboration, but they must state what is incomplete and must not be treated as approval to merge.

## Pull request validation record

Every pull request description includes a `Validation` section with:

1. Automated commands run and their results, for example `pnpm check` and `pnpm test`.
2. Focused test commands or fixtures needed to exercise the changed behavior.
3. Manual or acceptance steps, including setup, input, expected result, and observed result when automation does not cover the path.
4. Evidence links for spikes, isolation, performance, security, or other required proof.
5. Known gaps, skipped checks, and follow-up work.

Reviewers validate the change using this record and confirm that the evidence supports the affected requirements before approving the pull request.


## Artifact versions

Provenance: `Proposed` until this change is approved and merged. Source: product decision to unify documentary versions without extracting the baseline to another repository.

Rules:

1. Version numbers are per artifact, not global.
2. The documentation-map version is `TRACE-DIVE-MVP-001`. Notion must not keep a parallel map version.
3. Foundation baselines remain in `specs/foundation/` of this product repository until a later ADR extracts them.
4. Templates must include a `Version` field for SPECs and ADRs.

## Spec lifecycle

`Draft → Ready to start → Review → Accepted` with `Deferred` as an alternative.

- **Draft:** problem, scope, actors, open questions.
- **Ready to start:** enough numbered requirements to begin reversible implementation with synthetic data.
- **Review:** complete contract under validation.
- **Accepted:** approved obligatory source.
- **Deferred:** retained design outside the active scope.

Ready to start does **not** authorize real personal data or a pilot.

## Minimal spec topics

ID, title, status, version, owner, date, context, goals, non-goals, actors, permissions, numbered requirements, states, invariants, edge cases, Given/When/Then or equivalent scenarios, API, events, data, security, privacy, isolation, performance, observability, errors, migration, rollout, rollback, open questions, expected evidence.

## Definition of Ready

- No critical ambiguities
- Verifiable numbered requirements
- Permissions and scopes defined
- States and invariants explicit
- Data, API, and event impact identified
- Concurrency and idempotency when they apply
- Security, privacy, operations, and dependencies reviewed

## Definition of Done

- Numbered requirements implemented
- Unit, integration, contract, isolation, and operational tests that apply
- Migration reversible or rollback documented
- Telemetry and audit
- Contracts and documentation updated
- Conformance verified; divergences recorded

## Product sequence

1. Close blocking PRD/profile decisions
2. Run spikes for the highest technical, operational, and regulatory risks
3. Build a walking skeleton
4. Expand usable vertical slices
5. Pilot with no-go criteria

## Traceability

Every functional PR identifies requirements, ADRs, tests, evidence, and TRACE updates. Cross-cutting `MT-REQ-*` stay separate from product `DIVE-*` results.
