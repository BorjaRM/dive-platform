---
name: sdd-normative-change-hygiene
description: Hygiene for SPEC, ADR, or TRACE edits and any new normative statement. Use when changing specs/**, statuses, defaults, invariants, or provenance.
---

# SDD / normative change hygiene

## Inputs

- Files/sections to change
- Provenance: `Documented`, `Derived`, or `Proposed`

## Procedure

1. Decide whether the change is normative (requirement, default, state, TTL, permission, invariant, interface, acceptance criterion).
2. Label each new/changed statement. `Documented` must link an exact source without changing meaning.
3. Keep `Derived` / `Proposed` in Draft. Do not set Ready to start, Review, or Accepted without explicit human confirmation.
4. Bump the artifact `Version` only if that file's meaning changed.
5. Update TRACE for relationships/coverage pointers only.
6. Fill the PR provenance table and Validation. Notion stays navigation/status.

## Exit criteria

- No unlabeled normative statement
- No silent default/TTL/state/permission/invariant
- Open questions listed

## Stop

Contradictory sources → open question, do not pick a value.
