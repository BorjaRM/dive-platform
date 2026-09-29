# SPIKE-DIVE-004 — Execution checkpoints

- **Status:** Executed 2026-09-29; closure criteria met with remaining out-of-scope gaps recorded in `results.md`

1. Reuse the safety model from the existing Clerk sandbox harness: explicit opt-in flag, `sk_test_` key, technical users only, sandbox origins only, no secrets in git or output.
2. Add a dedicated invitation probe rather than weakening the production `ClerkIdentityAdapter` or existing authentication tests.
3. Configure invite-only and an exact local/custom acceptance redirect in the Clerk Development instance; record configuration without secrets.
4. Existing identity: call `createInvitation()` with `ignoreExisting: false`; record safe status/category and clean up any pre-existing invitation needed for test isolation.
5. Existing identity: call with `ignoreExisting: true`; capture only the provider invitation ID needed for cleanup and open the emailed/generated acceptance URL without persisting the ticket.
6. New identity: create and accept an invitation through the same redirect, using a disposable technical address permitted by the sandbox setup.
7. Exercise no-session, matching-session, and different-session browser contexts. Record the Clerk state/operation needed for each path.
8. Confirm invite-only blocks an uninvited signup and does not block ordinary sign-in for the existing technical user.
9. On the acceptance probe, apply `Referrer-Policy: no-referrer`, consume the ticket with the Clerk SDK, replace browser history, and assert the next URL and retained artifacts contain no ticket.
10. Revoke all created sessions and invitations and delete disposable technical users when safe. A failed cleanup is a failed run and must be reported without exposing secrets.
11. Update `results.md`, `traceability.md`, and the existing sandbox-harness documentation with the command, environment class, safe observations, limitations, and recommendation.

The probe may call Clerk directly because it measures provider behavior. This does not authorize the product API to call Clerk synchronously; production delivery remains owned by the post-commit outbox worker.
