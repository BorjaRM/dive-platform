# SPIKE-DIVE-002 — Eligibility and emergency data discovery

- **Status:** Deferred
- **Hypothesis:** A purpose-limited model can support operational eligibility and emergency handling using minimal structured facts, explicit retention, and no medical answers or document images.

## Question

What minimum data may and must a future trip-operations capability process in Spain without becoming a medical or document repository?

## Scope

Regulatory and data discovery for the deferred operations evolution. It does not block the booking MVP.

## Method

Implement the smallest representative slice, execute deterministic positive and negative scenarios against real infrastructure where applicable, record commands and environment, and store reproducible evidence without real personal data.

## Required scenarios

1. Inventory processing purposes and data categories.
2. Distinguish law, contract, certification rules, insurer requirements, and local practice.
3. Define allowed, forbidden, and deferred fields.
4. Define role × data × purpose access and masking.
5. Define retention, correction, export, restriction, deletion, audit, and backup handling.
6. Obtain dated local legal/privacy validation before real data is used.

## Dependencies

- specs/domain/SPEC-DIVE-OPS-001.md
- specs/iam/SPEC-DIVE-IAM-001.md
- specs/foundation/security-privacy-baseline.md

## Closure outcomes

`Accepted`, `Accepted with conditions`, `Requires modification`, or `Rejected`. A conclusion requires committed tests and reproducible evidence; this document alone is not evidence.
