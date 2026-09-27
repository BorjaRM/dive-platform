---
name: traceability-first-implementation
description: Implement approved requirement IDs with tests and TRACE pointers. Use when implementing DIVE-* or MT-REQ-* IDs, or when a PR claims to satisfy a SPEC.
---

# Traceability-first implementation

## Inputs

- Requirement IDs
- Target SPEC and ADR(s)

## Procedure

1. Locate the exact requirement text in `specs/**`. Do not paraphrase it into new rules.
2. Confirm status is Ready to start (synthetic data) or that a spike is in scope. Do not implement Deferred `SPEC-DIVE-OPS-001`.
3. Identify the smallest slice that can fail a test, then implement.
4. Add tests in the same PR, named or annotated with the IDs.
5. Check IAM, tenant isolation, and outbox/idempotency stop conditions. Load `tenant-isolation-invariants` when the change touches persistence, queries, RLS, or tenant/center resolution. Escalate rather than inventing behavior.
6. Fill the PR with Implements / Decision / Tests / Evidence / Traceability (`TRACE-DIVE-MVP-001`).
7. Update TRACE only if coverage relationships changed. Never copy requirement text into TRACE.

## Exit criteria

- Listed IDs are implemented or explicitly out of scope
- Commands to run tests are in Validation
- Open questions are recorded; no silent defaults

## Stop

If an ID, source, or acceptance criterion is missing, record an open question and stop.
