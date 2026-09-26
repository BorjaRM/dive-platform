# SPEC-<ID> — <Title>

- **Status:** Draft | Ready to start | Review | Accepted | Deferred
- **Version:**
- **Owner:**
- **Last reviewed:**
- **Approved by:** Pending | <name / role>
- **Approval reference:** Pending | <PR / ADR / decision URL>

## Normative authority

State what this SPEC governs and which artifacts must reference it rather than redefine it.

## Provenance policy

Every normative requirement must declare its provenance and source.

| Provenance | Meaning | Approval rule |
|---|---|---|
| `Documented` | Faithful transcription or normalization without semantic change | May be normative when the exact source is linked |
| `Derived` | Logical consequence inferred from one or more documented decisions | Requires explicit human approval before `Ready to start` |
| `Proposed` | New behavior, value, default, state, invariant, permission, or decision | Remains non-normative in `Draft` until explicitly approved |
| `Open question` | Missing or contradictory information | Must not be represented as an approved requirement |

Rules:

1. Link an exact file, section, ADR, issue, PR, or commit for every `Documented` or `Derived` item.
2. Explain the derivation for every `Derived` item.
3. Keep `Proposed` decisions in the dedicated section below until approved. After approval, record the approver and approval reference before promoting them to requirements.
4. Do not invent defaults, TTLs, states, transitions, permissions, limits, invariants, or acceptance criteria to fill gaps.
5. AI-generated or AI-rewritten normative content must be disclosed in the pull request.
6. This SPEC cannot move to `Ready to start`, `Review`, or `Accepted` while it contains unapproved `Derived`/`Proposed` decisions or critical open questions.

## Goal

## Scope

### In scope

### Out of scope

## Model and definitions

## Requirements

Use one row per atomic requirement. A requirement is not complete without provenance and a source.

| ID | Normative requirement | Provenance | Source | Decision status |
|---|---|---|---|---|
| `<DOMAIN>-REQ-001` |  | `Documented` | `<exact URL and section>` | Approved |

For `Derived` requirements, add the derivation immediately below the table:

### Derivations

- **<DOMAIN>-REQ-NNN:** <reasoning from the linked documented sources>.

## Proposed decisions

These items are non-normative until explicitly approved.

| Proposal ID | Proposal | Rationale | Source / context | Decision owner | Status |
|---|---|---|---|---|---|
| `PROP-001` |  |  |  |  | Pending |

## Open questions

| Question ID | Question | Why it matters | Decision owner | Blocking |
|---|---|---|---|---|
| `Q-001` |  |  |  | Yes / No |

## States and invariants

## Edge cases and acceptance scenarios

## API, events, and data

## Security, privacy, isolation, and operations

## Performance and observability

## Errors, concurrency, and idempotency

## Migration, rollout, and rollback

## Tests and expected evidence

## Traceability

Link requirements to ADRs, contracts, implementation, tests, and evidence through the applicable TRACE artifact.
