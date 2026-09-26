# SDD, specifications, and traceability (baseline)

- **Status:** Ready to start
- **Version:** 0.2

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
