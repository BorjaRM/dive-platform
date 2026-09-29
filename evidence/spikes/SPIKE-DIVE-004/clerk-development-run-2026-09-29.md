# SPIKE-DIVE-004 Clerk Development evidence

- **Date:** 2026-09-29
- **Source state:** Base commit `5939c62` plus the spike harness changes under review
- **Runtime:** Node.js 22.22.3
- **Provider SDK:** `@clerk/backend` 3.20.1; `@clerk/react` 6.17.2; `@clerk/testing` 2.2.39; ClerkJS hosted major version 6
- **Environment:** Clerk Development instance in Invite-only mode; technical identities only
- **Requirements:** `SPIKE-DIVE-004-REQ-001..010`
- **Coverage status:** Executed; all `SPIKE-DIVE-004-REQ-001..010` rows have observed results

## Executed command

From the repository root, with credentials supplied by the ignored workspace environment:

```bash
pnpm test:clerk:invitations:sandbox
```

Observed result: one test file and ten tests passed in 25.44 seconds. Cleanup completed without failing the run.

## Safe provider observations

- `ignoreExisting: false` rejected an invitation for an existing application identity; `true` created one with an in-memory URL.
- Invite-only rejected uninvited signup while ordinary existing-user sign-in remained available.
- The new-identity Future flow completed `signUp.ticket()`, its required password step, and `signUp.finalize()`, creating the disposable identity and an active session.
- The existing-identity Future flow completed `signIn.ticket()`, its required password factor, and `signIn.finalize()`, establishing a session for the existing identity.
- The custom password flow established matching and different active sessions. The probe classified the matching identity and denied the different identity neutrally with account switching available.
- The ticket was removed from the acceptance URL. Browser assertions detected no ticket in later requests, referrers, console output, page errors, or retained observations.
- A revoked invitation link was rejected and a replacement invitation reached the probe.
- No product bootstrap endpoint was invoked.

No credentials, technical-user identifiers, emails, tickets, invitation URLs, bearer tokens, cookies, provider error text, or unredacted responses are retained here.

## Remaining gaps

- Natural seven-day expiry, a real provider `429`, the canonical deployed authentication host, and the product bootstrap route were not exercised.
- Worker delivery, retry/reconciliation, PostgreSQL bootstrap authority, and tenant creation remain outside this provider measurement.