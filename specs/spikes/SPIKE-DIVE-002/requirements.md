# SPIKE-DIVE-002 — Requirements

- **Status:** Deferred

- **SPIKE-DIVE-002-REQ-001:** Produce a processing inventory and data-category catalog for the operations evolution.
- **SPIKE-DIVE-002-REQ-002:** Separate legal, contractual, certifier, insurer, and practice rules.
- **SPIKE-DIVE-002-REQ-003:** Define allowed, forbidden, and deferred fields.
- **SPIKE-DIVE-002-REQ-004:** Define role × data × purpose access and masking.
- **SPIKE-DIVE-002-REQ-005:** Define retention, correction, export, restriction, deletion, audit, and backup handling.
- **SPIKE-DIVE-002-REQ-006:** Obtain dated local legal/privacy validation before real operations data is used.
- **SPIKE-DIVE-002-REQ-007:** Propose SPEC-DIVE-OPS-001 and SPEC-DIVE-IAM-001 updates; SPEC-DIVE-BOOKING-001 remains a negative boundary.

This spike is not evidence for the booking-MVP privacy gate.

## Execution checkpoints

**Documented:** moved from the original execution-checkpoints document; execution status is unchanged.

1. Processing inventory.
2. Legal vs contract vs practice distinction.
3. Allowed / forbidden / deferred catalog.
4. Role × data × purpose matrix.
5. Retention and rights flows.
6. Dated local legal review before real operations data.

Do not use this checklist as the booking-MVP privacy gate.

## Requirement relationships

**Documented:** relationships only, not executed evidence. Tests or executed results must establish coverage when this spike is run.

| Spike requirement | Related artifact |
| --- | --- |
| SPIKE-DIVE-002-REQ-001 | SPEC-DIVE-OPS-001 |
| SPIKE-DIVE-002-REQ-002 | security-privacy-baseline |
| SPIKE-DIVE-002-REQ-003 | SPEC-DIVE-OPS-001 |
| SPIKE-DIVE-002-REQ-004 | SPEC-DIVE-IAM-001 |
| SPIKE-DIVE-002-REQ-005 | security-privacy-baseline |
| SPIKE-DIVE-002-REQ-006 | legal review |
| SPIKE-DIVE-002-REQ-007 | OPS + IAM updates |
