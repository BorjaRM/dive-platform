# SPIKE-DIVE-002 — Eligibility and emergency data discovery

- **Status:** Deferred
- **Type:** regulatory and data discovery for the operations evolution
- **Gate:** does not block the booking MVP

## Question

What minimum data may and must a future trip-operations capability process in Spain to identify participants, check eligibility, and respond to an emergency without becoming a medical or document repository?

## Scope

Deferred with SPEC-DIVE-OPS-001. Before a **booking** pilot, a separate privacy review of contact, communications, consent, retention, and rights is still required; this spike does not perform that review.

## Decisions it must produce

- Strictly necessary identity and contact data
- Need, access, and retention of emergency contact
- Meaning of “check performed” and whether it infers health information
- Certification or experience facts that can be stored without document copies
- Explicitly forbidden or deferred data
- Roles authorized per datum, purpose, and trip state
- Export, rectification, restriction, erasure, audit, and backups

## Guardrails

- No real customer data
- No medical history design
- No diagnoses, questionnaire answers, or document images
- Distinguish law, contract, certifier standard, and local practice
- Record uncertainties; do not add fields “just in case”

## Closure outcomes

`Accepted`, `Accepted with conditions`, `Requires modification`, or `Rejected`, plus no-go conditions for activating operations.
