# IAM Phase 2 synthetic revocation contract measurement

- **Date:** 2026-09-26
- **Runtime:** Node.js 22.22.3
- **Requirement:** `DIVE-IAM-REQ-016`
- **Decision:** `ADR-DIVE-007`
- **Environment:** local synthetic PostgreSQL 18 integration harness with deterministic/mocked identity-provider seams
- **Coverage status:** Partial for `DIVE-IAM-REQ-016` and `DIVE-IAM-REQ-022`

## Method

`apps/api/test/iam.e2e-spec.ts` records a monotonic timestamp immediately after the synthetic revocation boundary is established, performs the next authenticated dashboard request, and asserts that denial occurs within 300,000 ms. Membership and role changes execute against local PostgreSQL. Provider session termination uses a deterministic in-process identity-provider seam; it does not call a Clerk sandbox. The API has no authorization cache: every request invokes the configured identity provider and re-resolves membership, roles, and scopes.

Command:

```bash
pnpm --filter @dive-center/api exec node --env-file=../../.env.example ./node_modules/vitest/vitest.mjs run --config ./vitest.config.e2e.ts --disableConsoleIntercept test/iam.e2e-spec.ts
```

Observed passing samples:

| Revocation boundary | First denied request |
|---|---:|
| Role removal commit | 3.457 ms |
| Membership disable response/commit | 2.230 ms |
| Provider session termination | 1.449 ms |

These local samples demonstrate the application contract for request-time denial on the implemented dashboard route. They do not demonstrate Clerk session invalidation propagation, webhook delivery behavior, sandbox behavior, or production latency, and they are not a production budget or SLO. Real Clerk session integration remains required before `DIVE-IAM-REQ-016` or `DIVE-IAM-REQ-022` can move beyond Partial.