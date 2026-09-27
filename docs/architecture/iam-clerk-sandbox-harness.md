# Clerk sandbox evidence harness

This is an opt-in evidence harness for the partial IAM coverage of
`DIVE-IAM-REQ-004`, `DIVE-IAM-REQ-016`, and `DIVE-IAM-REQ-022`. It is
operational documentation, not a change to the
normative SPEC or ADR status. The harness uses the production `AppModule` and
the real `ClerkIdentityAdapter`; it does not override the identity provider and
does not use a Clerk double.

## Required environment

Provide these values only through an untracked local environment or a secret
manager. Do not add them to `.env.example` or commit them:

```text
DIVE_REAL_CLERK_E2E=1
CLERK_SECRET_KEY=sk_test_<sandbox-secret>
CLERK_WEBHOOK_SIGNING_SECRET=whsec_<sandbox-webhook-secret>
CLERK_ISSUER=https://<sandbox-instance>.clerk.accounts.dev
CLERK_AUTHORIZED_PARTIES=https://<sandbox-instance>.accounts.dev
DIVE_CLERK_SANDBOX_ACCOUNT_PORTAL_URL=https://<sandbox-instance>.accounts.dev
MIGRATION_DATABASE_URL=postgres://dive_migration:<password>@127.0.0.1:55432/dive_spike
SPIKE_ADMIN_DATABASE_URL=postgres://postgres:<password>@127.0.0.1:55432/dive_spike
APP_DATABASE_URL=postgres://dive_app:<password>@127.0.0.1:55432/dive_spike
DIVE_CLERK_SANDBOX_USER_ID=user_<authorized-technical-user>
DIVE_CLERK_SANDBOX_USER_PASSWORD=<authorized-technical-user-password>
DIVE_CLERK_SANDBOX_CONTROL_USER_ID=user_<control-technical-user>
DIVE_CLERK_SANDBOX_CONTROL_USER_PASSWORD=<control-technical-user-password>
```

`DIVE_REAL_CLERK_E2E=1` is mandatory. The two Clerk users must be technical
sandbox users without personal data. The first user is bound by the harness to
an active synthetic tenant-owner membership. The second user is bound to a
synthetic identity without a membership and is used as the authorization
control. The harness creates a synthetic tenant and center, then removes all
fixtures after each test.

All three database URLs must target the local `dive_spike` database exposed on
port `55432`; the harness rejects other hosts, ports, database names, query
strings, fragments, or unexpected usernames before connecting. The admin URL
uses `postgres` for fixture setup and cleanup, the migration URL uses
`dive_migration` for existing product migrations, and Nest receives
`APP_DATABASE_URL` using the normal `dive_app` role through the normal
`AppModule` provider, with no test provider override.

## Security preflight

1. Confirm the Clerk instance is a non-production sandbox and both user IDs are
   technical accounts.
2. Confirm the issuer and authorized party are exact canonical origins and the
   secret values are not in shell history, `.env.example`, test output, or git
   diff.
3. Confirm both technical users have `bypass_client_trust` enabled only in this
   Development instance; otherwise Clerk will require an email challenge that
   cannot be automated without weakening the evidence boundary.
4. Confirm the database URLs target the synthetic sandbox database and that the
   runtime URL uses the normal `dive_app` role.
5. Review the working tree before and after the run. The harness does not write
   tokens, secret keys, webhook secrets, emails, passwords, or raw request bodies.

## Explicit execution

Install Chromium once, then run from the repository root after exporting the variables above:

```bash
pnpm --filter @dive-center/api exec playwright install chromium
```

```bash
pnpm --filter @dive-center/api test:e2e:clerk:sandbox
```

The command without the flag fails before starting Nest with a clear refusal.
The normal `pnpm test` and synthetic `pnpm --filter @dive-center/api test:e2e`
exclude this file. An invocation without complete credentials also fails before
fixture creation.

The harness creates a fresh Chromium context for each user, signs in through
the Clerk Development Account Portal, and obtains the token from the browser's
real Clerk session. It then validates that token with the production
`ClerkIdentityAdapter`; it does not create the session with Backend API because
that path does not emit the required `azp` claim. The safe JSON emitted after a
successful run contains only monotonic timestamps, status codes, hashed session
identifiers, attempts, elapsed revocation time, and result labels.
`REAL-AUTH` checks an authorized request for the fixture member and a denied
request for the control user. `REAL-SESSION-REVOKE` checks an authorized
request before `sessions.revokeSession`, confirms that Clerk reports the
session revoked, then requests until the first `401` or the existing
`300000 ms` requirement boundary. The comparison is only against that existing
five-minute requirement; the harness does not define a token TTL, retry policy,
or new SLO.

## Explicit gaps

The current sandbox run demonstrates browser authentication and provider
session revocation. It does not implement browser logout, natural session
expiry, a webhook delivered by Clerk, or production traffic. `DIVE-IAM-REQ-021`
remains covered only by the existing local signed-webhook tests until a separate
delivery harness exists. Local JWT fixtures, HMAC webhook fixtures, mocks, and
deterministic providers remain contract tests only; they are not real Clerk
evidence.