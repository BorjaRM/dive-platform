# IAM Phase 2 provider-session revocation evidence

- **Date:** 2026-09-27
- **Runtime:** Node.js 22.22.3
- **Requirements:** `DIVE-IAM-REQ-004`, `DIVE-IAM-REQ-016`, `DIVE-IAM-REQ-022`
- **Decision:** `ADR-DIVE-007`
- **Environment:** local synthetic PostgreSQL 18 integration harness plus Clerk Development sandbox
- **Coverage status:** Partial; Clerk browser authentication and provider session revocation demonstrated, natural expiry/logout/webhook delivery remain open

## Clerk Development sandbox run

Command:

```bash
pnpm --filter @dive-center/api test:e2e:clerk:sandbox
```

Observed result on 2026-09-27: one test file and two tests passed in 16.65 seconds. `REAL-AUTH` authorized the fixture member and denied the control user with `403`; `REAL-SESSION-REVOKE` authorized the request before real Clerk revocation and observed the first `401` afterward. The run used the final `azp` validation and bounded polling backoff. Output and evidence contain no credentials, tokens, emails, passwords, or raw webhook bodies.

This retained record covers only the exercised Clerk authentication and
provider-session-revocation paths. Browser logout, natural session expiry,
Clerk-delivered webhook/retry behavior, and production traffic remain open.