# SPIKE-DIVE-001 — Requirements

- **Status:** Draft

- **SPIKE-DIVE-001-REQ-001:** Confirmed, held, and blocked seats never exceed slot capacity.
- **SPIKE-DIVE-001-REQ-002:** Public and manual channels use the same transactional capacity rule.
- **SPIKE-DIVE-001-REQ-003:** Idempotent retries do not duplicate booking, seats, audit, or outbox.
- **SPIKE-DIVE-001-REQ-004:** Capacity-changing operations serialize on one explicit slot boundary.
- **SPIKE-DIVE-001-REQ-005:** Closure and cancellation have one observable order relative to booking.
- **SPIKE-DIVE-001-REQ-006:** Expiry and cancellation release or block seats exactly once.
- **SPIKE-DIVE-001-REQ-007:** Only committed transactions generate audit and outbox records.
- **SPIKE-DIVE-001-REQ-008:** Errors are stable and do not disclose internal or cross-tenant data.
- **SPIKE-DIVE-001-REQ-009:** Tests use real PostgreSQL concurrency with synchronization barriers.
- **SPIKE-DIVE-001-REQ-010:** The result records contention measurements and implementation limits.

## Completion rule

Every requirement must map to at least one executable test or an explicitly reviewed non-executable validation, plus evidence in `results.md` or the referenced evidence directory.
