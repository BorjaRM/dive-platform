# IAM open work

This is a compact, non-normative tracker. `SPEC-DIVE-IAM-001`, applicable booking requirements, ADRs, and TRACE remain authoritative. No requirement, permission, state, TTL, retry limit, retention period, scheduler cadence, or acceptance criterion is introduced here.

Move each row to a GitHub issue when issue creation is available. Each coherent Ready-to-start implementation slice then gets its own Development Brief; do not implement this tracker as one PR.

## Remaining product slices

| Priority | IDs | Open slice | Boundary |
|---|---|---|---|
| High | `DIVE-IAM-REQ-007..009`, `026` | Published-channel authorization and opaque, single-purpose public capabilities | No public capability or token endpoint is demonstrated yet |
| High | `DIVE-IAM-REQ-015`, `025` | Purpose-limited customer-contact access and audit for later booking operations | Existing proof covers membership/invitation paths only |
| Medium | `DIVE-IAM-REQ-019`, `020`, `028` | Provider step-up contract and read-only, tenant-explicit, time-bounded support access with expiry proof | Support access remains unimplemented |

## ADR-DIVE-008 operational follow-ups

| Priority | Owner / slice | Open work | Current boundary |
|---|---|---|---|
| High | Platform / worker | Schedule revoked-context cleanup | SQL command exists; credentials, cadence, retry, alerting, and metrics are not approved |
| High | Web / release | Validate the real identity-provider and deployed dashboard/API boundary | Focused web tests exist; production lifecycle validation does not |
| Medium | Product / Security | Decide whether active handles need maximum-age or idle expiry | Current contract selects no independent active-handle TTL and no automatic eviction |
| Medium | API / Test | Prove rate/live-handle limits under concurrent issuance | Current coverage is sequential |
| Medium | API / Performance | Measure listing, issuance, resolution, query plans, pool use, and latency | No cache, new index, batching rule, or numeric budget is approved |
| Medium | Identity / Release | Complete real Clerk browser/session lifecycle evidence | Existing sandbox proof covers authentication and explicit provider revocation only |
| Low | Security / Database | Revisit a dedicated webhook role after process separation | Role remains Proposed and unimplemented |

## Open decisions and evidence gaps

- Confirm the supported Clerk step-up contract before support grants consume assurance fields.
- Validate natural session expiry, browser logout, Clerk-delivered webhook/retry behavior, and provider-failure behavior.
- Define operational recovery after external identity deletion when tenant ownership is affected.
- Approve retention/deletion rules for audit, security events, webhook inbox records, and idempotency records.
- Keep webhook retry/exhaustion provider-owned unless a later approved contract introduces application policy.

## Rules

- Do not select a missing value or policy in this file.
- Close normative decisions through the owning SPEC/ADR with provenance.
- Create a separate implementation issue only after its blocking decisions are closed.
- Record commands and results in the implementing PR; do not append historical validation here.
