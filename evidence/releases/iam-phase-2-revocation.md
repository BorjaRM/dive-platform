# IAM Phase 2 revocation contract measurement

- **Date:** 2026-09-27
- **Runtime:** Node.js 22.22.3
- **Requirements:** `DIVE-IAM-REQ-004`, `DIVE-IAM-REQ-016`, `DIVE-IAM-REQ-022`
- **Decision:** `ADR-DIVE-007`
- **Environment:** local synthetic PostgreSQL 18 integration harness plus Clerk Development sandbox
- **Coverage status:** Partial; Clerk browser authentication and provider session revocation demonstrated, natural expiry/logout/webhook delivery remain open

## Method

`apps/api/test/iam.e2e-spec.ts` records a monotonic timestamp immediately after the synthetic revocation boundary is established, performs the next authenticated dashboard request, and asserts that denial occurs within 300,000 ms. Membership and role changes execute against local PostgreSQL. Provider session termination uses a deterministic in-process identity-provider seam. The opt-in `apps/api/test/iam.clerk.sandbox.e2e-spec.ts` uses the production `AppModule`, real Clerk Development Account Portal sessions, real Clerk session/user fetches, and real Clerk Backend API session revocation. The API has no authorization cache: every request invokes the configured identity provider and re-resolves membership, roles, and scopes.

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

These local samples demonstrate the application contract for request-time denial on the implemented dashboard route. They are not a production budget or SLO. The local samples and the real sandbox run together do not demonstrate natural session expiry, browser logout, Clerk-delivered webhook behavior, or production latency.

## Clerk Development sandbox run

Command:

```bash
pnpm --filter @dive-center/api test:e2e:clerk:sandbox
```

Observed result on 2026-09-27: one test file and two tests passed in 16.65 seconds. `REAL-AUTH` authorized the fixture member and denied the control user with `403`; `REAL-SESSION-REVOKE` authorized the request before real Clerk revocation and observed the first `401` afterward. The run used the final `azp` validation and bounded polling backoff. Output and evidence contain no credentials, tokens, emails, passwords, or raw webhook bodies.

This is evidence for the exercised Clerk authentication and provider-session-revocation paths only. It does not close browser logout, natural session expiry, Clerk-delivered webhook/retry behavior, or production traffic.