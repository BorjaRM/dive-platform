# SPEC-DIVE-IAM-SUPPORT-001 - Privileged read-only platform support

- **Status:** Ready to start
- **Version:** 0.1
- **Last reviewed:** 2026-09-30
- **Owner:** Product / Security
- **Approval reference:** Unchanged requirements and approval records extracted from SPEC-DIVE-IAM-001 at commit `86e9d97`; documentation split requested 2026-09-30. No new semantic approval or status promotion is inferred.

## Normative authority

**Documented:** owns only the requirements declared below, extracted verbatim from [SPEC-DIVE-IAM-001](SPEC-DIVE-IAM-001.md). Original Derived/Proposed classifications, sources and approvals are preserved. This file does not authorize unrelated contracts or infer conformance from implementation existence.

## Requirement provenance

| Requirement IDs | Provenance | Exact source | Decision status |
|---|---|---|---|
| `DIVE-IAM-REQ-020` | `Proposed` | PR #1 invitation, owner-lockout, MFA-readiness, and support-access decisions | Approved by product owner for MVP validation |

## Requirements

- **DIVE-IAM-REQ-020:** Platform support in MVP is read-only, time-bounded, justified, tenant-explicit, and audited. Write support is disabled until step-up/MFA exists.

## Boundary and verification

**Documented:** retain ADR-DIVE-006 and the IAM/security baselines for time bounds, purpose, tenant-explicit scope, audit and future step-up. Support is not a tenant role or a bootstrap-administration capability. Writes remain disabled. Test expiry, tenant mismatch, denied writes and audit. No new support duration, grant workflow or permission is selected by this extraction.
