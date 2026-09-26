# SDD, specifications, and traceability (baseline)

## Source of truth

GitHub is the source of truth for:
- specs, ADRs, contracts, migrations, code, and tests

Notion is used for:
- context, navigation, and status tracking (not as a second editable copy of specs)

## Minimal spec template topics

ID, status/version/owner, goals, non-goals, actors, permissions, numbered requirements, invariants, edge cases, API/events/data, security/privacy, performance/observability, rollout/rollback, migration, open questions, expected evidence.

## DoR / DoD

Definition of Ready:
- no critical ambiguities
- verifiable criteria
- permissions/scopes defined
- data/API/event impacts identified
- security/privacy/ops reviewed

Definition of Done:
- requirements implemented
- tests updated
- migration/rollback documented when applicable
- telemetry/audit included
- conformance verified; divergences explicitly recorded