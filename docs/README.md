# Project documentation (`docs/`)

Project-level documentation: onboarding, architecture overviews, and working agreements.

## Source of truth

- **Normative contracts** live in `specs/`.
- `docs/` explains how to navigate the project and must not redefine requirements.
- Current implementation work belongs in GitHub issues and pull requests rather than parallel evidence registers.

## Starting points

- [Local setup](onboarding/quickstart.md)
- [Architecture overview](architecture/overview.md)
- [Production database access](operations/production-database-access.md)
- [Requirement owners and coverage](../specs/traceability/TRACE-DIVE-MVP-001.md)
- [Clerk sandbox harness](architecture/iam-clerk-sandbox-harness.md)
- [Working agreement](sdd/how-we-work.md)

## Find the task owner

Select the matching row, then read the relevant sections and requirement IDs in its owner. Follow only the dependencies needed for the task. This is navigation, not a copy of contracts, approvals, statuses or versions; the linked artifact is authoritative.

| Task | Start here | Follow when applicable |
|---|---|---|
| Requirements, approvals, documentation or PR workflow | [Working agreement](sdd/how-we-work.md) | [SDD baseline](../specs/foundation/sdd-specs-traceability.md); [TRACE](../specs/traceability/TRACE-DIVE-MVP-001.md) ownership, map or coverage section affected by the change |
| Core booking lifecycle or staff commands | [Booking](../specs/booking/SPEC-DIVE-BOOKING-001.md) | Its requirement ownership map and linked decisions for the affected IDs |
| Activity catalog, commercial fields, center public profile, editing, pagination or center time zone | [Catalog](../specs/booking/SPEC-DIVE-BOOKING-CATALOG-001.md) | [Catalog decisions](../specs/architecture/adrs/ADR-DIVE-014.md); [Booking](../specs/booking/SPEC-DIVE-BOOKING-001.md) for accepted conditions/history |
| Public booking creation or idempotent response | [Public booking](../specs/booking/SPEC-DIVE-BOOKING-PUBLIC-001.md) | [Public-create decisions](../specs/architecture/adrs/ADR-DIVE-010.md); [Capability security](../specs/architecture/adrs/ADR-DIVE-005.md) |
| Public confirmation, policy-conditioned cancellation or resend | [Capabilities](../specs/booking/SPEC-DIVE-BOOKING-CAPABILITIES-001.md) | [Capability security](../specs/architecture/adrs/ADR-DIVE-005.md); [Booking](../specs/booking/SPEC-DIVE-BOOKING-001.md) for accepted conditions/history |
| Embeddable booking widget | [Widget](../specs/booking/SPEC-DIVE-BOOKING-WIDGET-001.md) | [Widget spike](../specs/spikes/SPIKE-DIVE-003/specification.md) |
| Scheduling, recurrence, date-free bookings or calendar | [Scheduling](../specs/booking/SPEC-DIVE-BOOKING-SCHEDULING-001.md) | [Scheduling direction](../specs/architecture/adrs/ADR-DIVE-015.md) |
| Identity, memberships, roles or permissions | [IAM](../specs/iam/SPEC-DIVE-IAM-001.md) | [IAM baseline](../specs/foundation/iam-baseline.md) and the permission matrix for the affected operation |
| Dashboard context or center-entry hosts | [IAM dashboard](../specs/iam/SPEC-DIVE-IAM-DASHBOARD-001.md) | [Dashboard credentials](../specs/architecture/adrs/ADR-DIVE-008.md); [Center entry](../specs/architecture/adrs/ADR-DIVE-017.md) |
| Ordinary tenant invitations or support access | [IAM invitations](../specs/iam/SPEC-DIVE-IAM-INVITATIONS-001.md) or [Support](../specs/iam/SPEC-DIVE-IAM-SUPPORT-001.md) | The selected owner's linked decisions; bootstrap invitations have a different owner below |
| Tenant bootstrap, setup or invitation administration | [Onboarding](../specs/onboarding/SPEC-DIVE-ONBOARDING-001.md) | [Administration](../specs/onboarding/SPEC-DIVE-ONBOARDING-ADMIN-001.md); [Bootstrap decisions](../specs/architecture/adrs/ADR-DIVE-013.md) |
| Bootstrap invitation delivery or generic outbox/worker changes | [Bootstrap delivery](../specs/onboarding/SPEC-DIVE-ONBOARDING-DELIVERY-001.md) for that flow; [Outbox/worker architecture](../specs/architecture/adrs/ADR-DIVE-002.md) otherwise | [Clerk delivery](../specs/architecture/adrs/ADR-DIVE-004.md); [Clerk harness](architecture/iam-clerk-sandbox-harness.md) for provider-specific checks |
| Persistence, tenant isolation or MT activation conditions | [Multitenancy baseline](../specs/foundation/multitenancy-architecture.md) | [Adoption profile](../specs/multitenancy/adoption-profile.md); [MT spike requirements](../specs/multitenancy/MT-SPIKE-001-requirements.md), keeping MT results separate from product results |
| Trial access or public product landing | [Trial](../specs/commercial/SPEC-DIVE-TRIAL-001.md) or [Marketing](../specs/marketing/SPEC-DIVE-MARKETING-001.md) | [Trial direction](../specs/architecture/adrs/ADR-DIVE-016.md) or [Public-host decisions](../specs/architecture/adrs/ADR-DIVE-012.md), respectively |
| Guided onboarding or operational-domain evolution | [Guidance](../specs/onboarding/SPEC-DIVE-ONBOARDING-GUIDANCE-001.md) or [Operations](../specs/domain/SPEC-DIVE-OPS-001.md) | The selected artifact's status and authorization before proposing implementation |
| Implementation validation or conformance review | Affected requirement IDs in the owning SPEC | Their relevant [TRACE](../specs/traceability/TRACE-DIVE-MVP-001.md) coverage rows and existing tests; [PR validation](sdd/how-we-work.md#pull-requests) |

For cross-cutting security, privacy, isolation, reuse and performance, load the applicable repository skills and baselines only for the affected surface. Selecting a row does not remove mandatory constraints or approve work.

Current references use the document link and requirement ID without repeating its version. Historical approval or evidence references retain their pinned revision, PR, commit or date. See [Versions](sdd/how-we-work.md#versions).
