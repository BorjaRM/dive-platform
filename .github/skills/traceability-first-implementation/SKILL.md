---
name: traceability-first-implementation
description: Implement approved requirement IDs with tests and TRACE pointers. Use when implementing DIVE-* or MT-REQ-* IDs, or when a PR claims to satisfy a SPEC.
---

# Traceability-first implementation

## Inputs

- Implementation issue for the increment, or explicit chat authorization under the workflow exception
- Requirement IDs
- Applicable SPEC and ADR(s)

When an implementation issue exists, it is the single owner of the Development Brief. Read the brief from the issue; do not reproduce it in another artifact. **Documented:** [explicit chat authorization](../../../docs/sdd/development-brief-template.md#explicit-chat-authorization) may waive the issue/brief entry gate for one bounded slice; use its authorized scope without creating a replacement issue or brief.

Documented sources: `docs/sdd/development-brief-template.md`, `.github/ISSUE_TEMPLATE/implementation-increment.md`, and `.github/copilot-instructions.md` own the entry fields, authority, and supervised execution rules below.

Classify the task first. Product behavior requires the implementation issue unless the workflow's explicit chat exception applies; maintenance, documentation-only work, and behavior-preserving refactors do not acquire that requirement merely because this skill was loaded. For a review, verify and report gaps without editing product code.

## Procedure

1. Identify the entry context: read the issue and its single Development Brief, or verify the explicit issue-free chat authorization and bounded scope. For issue-backed work, check all brief fields: user story, short end-to-end flow, contract/cross-cutting references, In/Out scope, expected surfaces and behavior authority, test/evidence plan, and open questions. For chat-authorized work, resolve the approved IDs, In/Out scope, affected surfaces and verification plan without inventing a brief. Reject unresolved placeholders or blocking decisions in either route.
2. Locate the exact requirement text in `specs/**`. Do not paraphrase it into new rules.
3. Verify the exact IDs and decisions against the readiness/lifecycle rules in `specs/foundation/sdd-specs-traceability.md`. A ready document header does not approve a Draft subsection. Ready to start permits reversible work with synthetic data, not a real-data pilot. Do not reject an approved requirement merely because it has advanced to Review or Accepted. Do not implement Deferred `SPEC-DIVE-OPS-001`.
4. Identify the smallest slice that can fail a test, then implement it within the issue brief or explicitly authorized chat scope.
5. Add tests in the same PR, named or annotated with the IDs.
6. Check IAM, tenant isolation, and outbox/idempotency stop conditions. Load `tenant-isolation-invariants` for persistence, queries, RLS, or tenant/center resolution. Repair established-contract defects and failed tests within scope; pause on missing or contradictory decisions. Use the supervised delegation/handoff contract in `.github/agents/README.md`, never a subagent to bypass confirmation.
7. When a product PR exists or publication is explicitly authorized, include implemented IDs, scope differences and new open questions. Issue-backed work includes `Closes #<issue>`; issue-free work records the role/date and explicit chat authorization instead, without a fake closure reference. Otherwise report local changes and validation in chat without creating a PR. A declared scope difference does not authorize additional work; ask before expanding the authorized scope.
8. Use proportional proof: reproducible tests are the default; the PR `Validation` section records commands and observed results; use `evidence/` only for non-reproducible, temporary, regulatory, manual, or external-provider results that tests cannot preserve.
9. Update TRACE only when coverage relationships change. Never copy requirement text into TRACE.

## Exit criteria

- The issue/brief or explicit chat authorization, requirement IDs, and applicable SPEC/ADR(s) were checked
- Listed IDs are implemented, or incomplete work is clearly reported; any scope reduction requires explicit approval
- An existing or authorized PR closes the real issue or records the issue-free authorization, without duplicating a brief; local-only delivery records validation in chat
- Tests and proportional Validation are recorded; any evidence path is justified
- Open questions are recorded; no silent defaults

## Stop

Stop product implementation and record an open question if:

- the implementation issue is missing without the explicit chat exception, or does not match the increment;
- a required ID, SPEC, ADR, or acceptance criterion is missing;
- the issue-backed route has no Development Brief;
- the issue brief or chat-authorized scope contains an unresolved question or decision that affects implementation; or
- the Development Brief is duplicated in another artifact.
