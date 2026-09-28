# SPIKE-DIVE-004 — Requirements

- **Status:** Draft

- **SPIKE-DIVE-004-REQ-001:** Record the actual Clerk Development result of `createInvitation()` for an existing application email with `ignoreExisting: false` and `true`, without treating provider error text as a product error contract.
- **SPIKE-DIVE-004-REQ-002:** Record the ticket and authentication state transitions for a newly invited identity through the exact custom redirect shape required by `DIVE-ONB-REQ-038`.
- **SPIKE-DIVE-004-REQ-003:** Record the ticket and authentication state transitions for an invited email that already belongs to a Clerk application identity, including the sign-in path required to continue.
- **SPIKE-DIVE-004-REQ-004:** Record matching-session and different-session behavior; the probe must demonstrate that a different signed-in identity can be denied neutrally and switched without claiming bootstrap completion.
- **SPIKE-DIVE-004-REQ-005:** Verify that invite-only prevents uninvited signup while ordinary sign-in for an existing identity remains available.
- **SPIKE-DIVE-004-REQ-006:** Verify that `__clerk_ticket` is removed by history replacement before navigation beyond the acceptance probe and is absent from durable logs, errors, traces, referrers, screenshots, and committed evidence.
- **SPIKE-DIVE-004-REQ-007:** Produce a reusable opt-in Clerk Development harness using technical users and sandbox-only secrets; normal test commands must not execute real-provider scenarios.
- **SPIKE-DIVE-004-REQ-008:** Clean up invitations, sessions, and temporary users created by the run, while recording only safe provider identifiers or hashes needed for reproducibility.
- **SPIKE-DIVE-004-REQ-009:** Recommend the smallest Clerk prebuilt/custom-flow composition supported by the observations and list any remaining limitation; the spike must not implement product bootstrap or change the PostgreSQL authority boundary.
- **SPIKE-DIVE-004-REQ-010:** Preserve the production delivery decision: API persistence commits first and `apps/worker` performs Clerk invitation creation/revocation from the pre-tenant outbox. Direct provider calls in the harness are measurement-only.

## Completion rule

Every requirement maps to an executable scenario or an explicit reviewed limitation in `results.md`. Provider behavior is evidence only after the opt-in harness has actually run against a Clerk Development instance.
