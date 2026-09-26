# IAM vertical follow-ups

This is a non-normative implementation note. `SPEC-DIVE-IAM-001` remains the normative source. No new requirement, permission, state, TTL, or acceptance criterion is introduced here.

## Resolved in the current change

- **Documented: `DIVE-IAM-REQ-018`.** PostgreSQL now protects the last active `tenant_owner` with a trigger and tenant advisory lock. The integration test exercises a direct `dive_app` update inside a rollback-only transaction.
- **Traceability:** `TRACE-DIVE-MVP-001` now points to `SPEC-DIVE-IAM-001` version `0.4` and records the implemented slice as partial coverage.

## Follow-ups

These are implementation follow-ups for requirements already defined in `SPEC-DIVE-IAM-001`; they are not new product decisions.

| Priority | IDs | Follow-up | Reason it remains open |
|---|---|---|---|
| High | `DIVE-IAM-REQ-004`, `021`, `022` | Replace `RejectingIdentityProvider` with the Clerk facade, verified webhook handling, session expiry, logout, and membership-disable behavior. | The runtime provider is still a rejecting adapter; current e2e tests inject a deterministic test provider. |
| High | `DIVE-IAM-REQ-007..009`, `026` | Implement published-channel authorization and opaque, single-purpose public tokens. | No public capability or token endpoint exists in this vertical. |
| High | `DIVE-IAM-REQ-025` | Define and enforce audit behavior for every sensitive authorization outcome, including requests that fail before membership resolution and direct membership mutations. | The current service audits the membership-disable use case, but the database role can still update a non-last membership status without producing the service audit/outbox pair. |
| Medium | `DIVE-IAM-REQ-015..017`, `019`, `020` | Add purpose-limited contact access, invitation lifecycle, future step-up fields, and read-only time-bounded support access. | No API, schema, or evidence covers these flows yet. |
| Medium | `DIVE-IAM-REQ-010..014`, `023` | Complete the role x permission x scope matrix beyond `center.read` and `membership.disable`. | The current mapping is intentionally limited to the first two API operations. |
| Medium | `DIVE-IAM-REQ-016`, `028` | Add revocation-window measurement and support-expiry tests/evidence. | Current tests verify next-request membership revocation but do not measure the five-minute window or support expiry. |

## Validation note

`pnpm test:integration`, `pnpm test`, and `pnpm check` pass in the current environment. The isolated API build remains blocked by an `ERR_REQUIRE_CYCLE_MODULE` from the Nest/Angular toolchain under local Node `22.13.0`; the repository engine requires Node `>=22.22.3`.