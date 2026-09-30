# SPIKE-DIVE-001 — Requirements

- **Status:** Draft

- **SPIKE-DIVE-001-REQ-001:** Confirmed, held, and blocked seats never exceed slot capacity (`DIVE-BOOK-REQ-003`).
- **SPIKE-DIVE-001-REQ-002:** Public and manual channels use the same transactional capacity rule (`DIVE-BOOK-REQ-026`).
- **SPIKE-DIVE-001-REQ-003:** Idempotent retries do not duplicate booking, seats, audit, or outbox (`DIVE-BOOK-REQ-028`).
- **SPIKE-DIVE-001-REQ-004:** Capacity-changing operations serialize on one explicit slot boundary (`DIVE-BOOK-REQ-029`).
- **SPIKE-DIVE-001-REQ-005:** Closure and cancellation have one observable order relative to booking (`DIVE-BOOK-REQ-030`, `DIVE-BOOK-REQ-031`).
- **SPIKE-DIVE-001-REQ-006:** Expiry and cancellation release or block seats exactly once (`DIVE-BOOK-REQ-032`).
- **SPIKE-DIVE-001-REQ-007:** Only committed transactions generate audit and outbox records (`DIVE-BOOK-REQ-045`).
- **SPIKE-DIVE-001-REQ-008:** Errors are stable and do not disclose internal or cross-tenant data (`DIVE-BOOK-REQ-006`).
- **SPIKE-DIVE-001-REQ-009:** Tests use real PostgreSQL concurrency with synchronization barriers.
- **SPIKE-DIVE-001-REQ-010:** The result records contention measurements and implementation limits.

## Completion rule

Every requirement maps to at least one executable test or an explicitly reviewed non-executable validation, plus evidence in `results.md` or `evidence/spikes/SPIKE-DIVE-001/`.

## Execution checkpoints

**Documented:** moved from the original execution-checkpoints document; execution status is unchanged.

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

## Requirement relationships

**Documented:** relationships only, not executed evidence. Tests or executed results must establish coverage when this spike is run.

| Spike requirement | Booking requirement |
| --- | --- |
| SPIKE-DIVE-001-REQ-001 | DIVE-BOOK-REQ-003 |
| SPIKE-DIVE-001-REQ-002 | DIVE-BOOK-REQ-026 |
| SPIKE-DIVE-001-REQ-003 | DIVE-BOOK-REQ-028 |
| SPIKE-DIVE-001-REQ-004 | DIVE-BOOK-REQ-029 |
| SPIKE-DIVE-001-REQ-005 | DIVE-BOOK-REQ-030, 031 |
| SPIKE-DIVE-001-REQ-006 | DIVE-BOOK-REQ-032 |
| SPIKE-DIVE-001-REQ-007 | DIVE-BOOK-REQ-045 |
| SPIKE-DIVE-001-REQ-008 | DIVE-BOOK-REQ-006 |
| SPIKE-DIVE-001-REQ-009 | — |
| SPIKE-DIVE-001-REQ-010 | — |
