# SPEC-DIVE-ONBOARDING-GUIDANCE-001 - Deferred guided onboarding

- **Status:** Deferred
- **Version:** 0.1
- **Last reviewed:** 2026-09-30
- **Owner:** Product / Security / Frontend Architecture
- **Approval reference:** Unchanged requirements and approval records extracted from SPEC-DIVE-ONBOARDING-001 at commit `86e9d97`; documentation split requested 2026-09-30. No new semantic approval or status promotion is inferred.

## Normative authority

**Documented:** owns only the requirements declared below, extracted verbatim from [SPEC-DIVE-ONBOARDING-001](SPEC-DIVE-ONBOARDING-001.md). Original Derived/Proposed classifications, sources and approvals are preserved. This file does not authorize unrelated contracts or infer conformance from implementation existence.

## Requirement provenance

| Requirement IDs | Provenance | Exact source | Decision status |
|---|---|---|---|
| `DIVE-ONB-REQ-027..DIVE-ONB-REQ-034` | `Proposed` | Original PR #36 guidance proposal; product confirmation 2026-09-29 deferring guided onboarding | **Approved for deferral:** excluded from current US-19 implementation authority; a future story must decide whether guidance is needed, in which flows, and with which presentation approach |

## Requirements

- **DIVE-ONB-REQ-027:** **Deferred.** Guided onboarding is not required for the current simple bootstrap form. A future story must decide whether guidance is needed and which product flows justify it.

- **DIVE-ONB-REQ-028:** **Deferred.** No tour library, including Driver.js, renderer abstraction, or product integration is selected or required for current US-19.

- **DIVE-ONB-REQ-029:** **Deferred.** No guide-specific browser persistence contract is selected or required for current US-19.

- **DIVE-ONB-REQ-030:** **Deferred.** No guide replay, dismissal, completion, or version-update behavior is selected or required for current US-19.

- **DIVE-ONB-REQ-031:** **Deferred.** No guide content catalog, content port, or future CMS boundary is selected or required for current US-19.

- **DIVE-ONB-REQ-032:** **Deferred.** No guide-specific analytics events or analytics port are selected or required for current US-19.

- **DIVE-ONB-REQ-033:** **Deferred.** Guidance-specific accessibility acceptance is deferred with the guidance capability. The simple bootstrap form remains subject to the normal product accessibility requirements.

- **DIVE-ONB-REQ-034:** **Deferred.** No independent guidance rollout control is required for current US-19; bootstrap provisioning retains its own approved rollout control.

## Future decision boundary

**Documented:** guidance was explicitly deferred 2026-09-29. These IDs preserve the decision history, not current implementation scope. A future approved story must decide need, flows and presentation before choosing a renderer, persistence, content, analytics or rollout mechanism. The simple bootstrap form remains subject to normal localization and accessibility requirements. No empty results or guide implementation plan is required.
