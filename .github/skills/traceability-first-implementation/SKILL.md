---
name: traceability-first-implementation
description: Implement approved requirement IDs with tests and TRACE pointers. Use when implementing DIVE-* or MT-REQ-* IDs, or when a PR claims to satisfy a SPEC.
---

# Traceability-first implementation

## Inputs

- Implementation issue for the increment
- Requirement IDs
- Applicable SPEC and ADR(s)

The implementation issue is the single owner of the Development Brief. Read the
brief from the issue; do not reproduce it in another artifact.

## Procedure

1. Confirm that the implementation issue matches the increment, contains the Development Brief, owns it as the only copy, and has no unresolved question or decision that blocks implementation.
2. Locate the exact requirement text in `specs/**`. Do not paraphrase it into new rules.
3. Confirm every required ID is `Ready to start` (synthetic data) or that a spike is in scope. Do not implement Deferred `SPEC-DIVE-OPS-001`.
4. Identify the smallest slice that can fail a test, then implement it within the brief.
5. Add tests in the same PR, named or annotated with the IDs.
6. Check IAM, tenant isolation, and outbox/idempotency stop conditions. Load `tenant-isolation-invariants` when the change touches persistence, queries, RLS, or tenant/center resolution. Escalate rather than inventing behavior.
7. Ensure the product PR includes `Closes #<issue>`, lists the implemented IDs, states only differences from the Development Brief, and records new open questions. Do not copy the brief into the PR.
8. Use proportional proof: reproducible tests are the default; the PR `Validation` section records commands and observed results; use `evidence/` only for non-reproducible, temporary, regulatory, manual, or external-provider results that tests cannot preserve.
9. Update TRACE only when coverage relationships change. Never copy requirement text into TRACE.

## Exit criteria

- The implementation issue, Development Brief, requirement IDs, and applicable SPEC/ADR(s) were checked
- Listed IDs are implemented or explicitly out of scope
- The PR links the issue with `Closes #<issue>` and does not duplicate the brief
- Tests and proportional Validation are recorded; any evidence path is justified
- Open questions are recorded; no silent defaults

## Stop

Stop product implementation and record an open question if:

- the implementation issue is missing or does not match the increment;
- a required ID, SPEC, ADR, or acceptance criterion is missing;
- the issue has no Development Brief;
- the brief contains an unresolved question or decision that affects implementation; or
- the Development Brief is duplicated in another artifact.
