# ARCH-01 Decision

## Decision

**Proposed: explicit decision for this remediation.** ARCH-01 will not be
implemented as a refactor of `DashboardTenantContext`. The component is
transitional and is expected to be replaced, so extracting its responsibilities
now would create throwaway architecture and duplicate migration work.

## Scope and residual risk

This is a deferral decision, not a claim that the maintainability finding is
resolved. Until the replacement exists, the current component and its
characterization tests remain the maintained boundary. The replacement's
shape, ownership, and migration point are intentionally left open until that
work is defined.
