# SPIKE-DIVE-004 — Traceability

| Spike requirement | Onboarding relationship | Test / probe | Evidence |
|---|---|---|---|
| SPIKE-DIVE-004-REQ-001 | DIVE-ONB-REQ-038, 044 | `tests/clerk-invitations/test/iam.clerk-invitations.sandbox.e2e-spec.ts` (`ignoreExisting` matrix) | `evidence/spikes/SPIKE-DIVE-004/clerk-development-run-2026-09-29.md` |
| SPIKE-DIVE-004-REQ-002 | DIVE-ONB-REQ-038 | `tests/clerk-invitations/test/iam.clerk-invitations.sandbox.e2e-spec.ts` (new identity) | Completed Future sign-up flow in the dated provider evidence |
| SPIKE-DIVE-004-REQ-003 | DIVE-ONB-REQ-038, 041 | `tests/clerk-invitations/test/iam.clerk-invitations.sandbox.e2e-spec.ts` (existing identity without session) | Completed Future sign-in flow in the dated provider evidence |
| SPIKE-DIVE-004-REQ-004 | DIVE-ONB-REQ-038, 041 | `tests/clerk-invitations/test/iam.clerk-invitations.sandbox.e2e-spec.ts` (matching/different active sessions) | `evidence/spikes/SPIKE-DIVE-004/clerk-development-run-2026-09-29.md` |
| SPIKE-DIVE-004-REQ-005 | DIVE-ONB-REQ-037 | `tests/clerk-invitations/test/iam.clerk-invitations.sandbox.e2e-spec.ts` (Invite-only) | `evidence/spikes/SPIKE-DIVE-004/clerk-development-run-2026-09-29.md` |
| SPIKE-DIVE-004-REQ-006 | DIVE-ONB-REQ-038 | `tests/clerk-invitations/test/clerk-invitation-probe.ts`; browser security assertions in the invitation matrix | `evidence/spikes/SPIKE-DIVE-004/clerk-development-run-2026-09-29.md` |
| SPIKE-DIVE-004-REQ-007 | ADR-DIVE-013 | dedicated opt-in Vitest configuration and command | Passing focused command; excluded from normal/synthetic suites |
| SPIKE-DIVE-004-REQ-008 | ADR-DIVE-013 | per-scenario provider-resource cleanup in the invitation matrix | Passing run; no cleanup failure |
| SPIKE-DIVE-004-REQ-009 | DIVE-ONB-REQ-036, 038, 041 | `specs/spikes/SPIKE-DIVE-004/results.md` recommendation and limitations | Concluded with the Future API composition demonstrated |
| SPIKE-DIVE-004-REQ-010 | DIVE-ONB-REQ-013, 044; ADR-DIVE-002 | test-only product-boundary guard and direct-provider measurement boundary | Passing run; no product bootstrap endpoint invoked |

The spike provides external-provider evidence. It does not itself promote onboarding requirements or demonstrate tenant-bootstrap implementation.
