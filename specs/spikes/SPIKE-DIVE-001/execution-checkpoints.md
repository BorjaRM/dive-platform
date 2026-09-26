# SPIKE-DIVE-001 — Execution checkpoints

- **Status:** Draft / not executed

1. Minimal slot, booking, and idempotency-key model with a reversible migration.
2. Transactional `SELECT … FOR UPDATE` on the slot.
3. Positive last-seat test with two public actors.
4. Public vs manual last-seat test.
5. Multi-seat overflow test.
6. Idempotent retry test including audit and outbox.
7. Closure and cancellation races.
8. Pending expiry with concurrent workers.
9. Negative public-configuration manipulation.
10. Record contention metrics and keep-or-replace decision.

Stop if oversell is observed, if retries duplicate side effects, or if tests require persistence mocks.
