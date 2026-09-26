# Product profile — Dive centers (MVP)

- **Status:** Ready to start  
- **Version:** 0.3  
- **Reference market:** Spain  
- **Goal:** validate an end-to-end operable booking system (including minimal support capabilities) without implementing the advanced “trip operations” scope.

## 1) Adoption rule and normative sources

This product profile **adopts by reference** the cross-cutting multi-tenant baseline (architecture, IAM, security/privacy, operations, SDD method).

It does not duplicate those controls. It defines **dive-specific configuration**, domain extensions, and divergences.

Normative references (by topic):

- Multitenancy architecture pattern: `specs/foundation/multitenancy-architecture.md`
- IAM baseline: `specs/foundation/iam-baseline.md`
- Security / privacy / multi-jurisdiction baseline: `specs/foundation/security-privacy-baseline.md`
- Operations / quality / recovery baseline: `specs/foundation/operations-quality-recovery.md`
- SDD + specs + traceability baseline: `specs/foundation/sdd-specs-traceability.md`

**Divergence rule:** any future divergence from the baseline must be recorded as an ADR, including justification, risk, owner, and review date.  
If a contradiction is unresolved, the baseline prevails and product decisions are blocked until clarified.

## 2) Product hypotheses

- Initial problem: centers handle availability and bookings manually across phone/email/forms/messaging.
- Value proposition: publish availability, accept online bookings, keep a single calendar including manual bookings.
- **Tenant/provider:** the dive operator (company) owning activities, availability, bookings, and data.
- **Operational scope:** center/base within a tenant.
- Channels: embedded widget, hosted public booking page, internal dashboard.
- Customer identity: no account required in MVP; public flow + limited secure links.
- Data region: EU, unless explicitly approved via ADR + jurisdiction profile.

## 3) MVP decision

Core MVP capabilities:

- Configure booking services (“activities”) and scheduled occurrences (“slots”)
- Online booking from widget/hosted page
- Simple internal calendar + manual bookings from dashboard
- Secure cancellation
- Idempotent confirmations (outbox-based) without overselling

## 4) Explicitly out of scope (MVP)

- Trip operations: check-in, manifest, departure/return, incidents, closing
- Certifications/eligibility/emergency contacts/medical data
- Payments, deposits, invoicing, refunds
- Multi-provider marketplace / OTA distribution (future phase)
- Offline mode / sync

## 5) Walking skeleton gate (to start staging)

Before using real personal data or piloting, we must have evidence for:

- cross-cutting multi-tenant validation (RLS, pooling, context propagation)
- last-seat concurrency spike
- widget integration/security spike
- booking + IAM specs as normative contracts