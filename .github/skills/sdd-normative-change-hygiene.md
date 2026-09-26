---
name: SDD / Normative change hygiene
when_to_use: When changing SPEC/ADR/TRACE, or when a PR introduces any new normative statement.
---

## Inputs
- Files/sections to change.
- Whether this is `Documented`, `Derived`, or `Proposed`.

## Procedure
1. Identify whether the change is normative.
2. If normative: label each new/changed statement as `Documented` / `Derived` / `Proposed`.
3. Update TRACE only for relationships/coverage pointers (never restate requirement text).
4. Update PR description: fill the provenance table + Validation.

## Validation
- Confirm Notion changes (if any) are navigation/status only.
- Confirm there are no silent new defaults/TTLs/states/invariants.
