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
CLERK_REQUEST_TIMEOUT_MS=<positive-request-timeout>
DIVE_CLERK_SANDBOX_ACCOUNT_PORTAL_URL=https://<sandbox-instance>.accounts.dev
MIGRATION_DATABASE_URL=postgres://dive_migration:<password>@127.0.0.1:55432/dive_spike
SPIKE_ADMIN_DATABASE_URL=postgres://postgres:<password>@127.0.0.1:55432/dive_spike
SPIKE_APP_DATABASE_URL=postgres://dive_app:<password>@127.0.0.1:55432/dive_spike
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
`dive_migration` for existing product migrations, and the sandbox harness copies
`SPIKE_APP_DATABASE_URL` into `APP_DATABASE_URL` before booting Nest so the
normal `AppModule` provider still uses the standard `dive_app` role with no
test provider override.

The IAM harness provisions a synthetic BFF service credential in process and
overrides only the center-host configuration with loopback test origins. It
does not override Clerk authentication. Each authorized session first obtains
a handle through center bootstrap, then reuses that handle for protected reads
and revocation checks. Synthetic mappings and handles are removed with the
fixture. This verifies API admission, not a Next.js/browser BFF journey.

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
session revoked, checks that another token cannot be issued for that session,
then reuses the frozen JWT until the first `401` or the existing
`300000 ms` requirement boundary. The comparison is only against that existing
five-minute requirement; the harness does not define a token TTL, retry policy,
or new SLO. The first `401` must not precede the JWT's declared expiry, and a
fresh control session checks provider health without relying on an expired
control token. This updated expiry-based harness has not been executed as part
of the local implementation validation.

**Documented (runner implementation and [Clerk Backend API errors](https://clerk.com/docs/guides/development/errors/backend-api#session-not-found)):**
both runners accept only the SDK's `404/resource_not_found` response as
token-issuance refusal evidence. Timeouts, service-credential failures, rate
limits, server errors, unknown responses and successful issuance fail the check.
An active control session must obtain a cryptographically valid token with its
own `sid` and `sub`. That Backend API control checks issuance health only; its
token is not submitted for dashboard admission or treated as browser `azp` proof.
The actual refusal response after revocation remains to be verified in sandbox;
this stricter local assertion does not supply the pending activation evidence.

## Explicit gaps

Historical sandbox evidence demonstrates browser authentication and the former
request-time provider-session validation; it does not establish the new
[JWT validity policy](../../specs/iam/SPEC-DIVE-IAM-001.md#dashboard-jwt-validity-boundary).
The updated runner does not implement browser logout, natural provider-session
expiry, a webhook delivered by Clerk, or production traffic. `DIVE-IAM-REQ-021`
remains covered only by the existing local signed-webhook tests until a separate
delivery harness exists. Local JWT fixtures, HMAC webhook fixtures, mocks, and
deterministic providers remain contract tests only; they are not real Clerk
evidence.

## BFF browser sandbox runner

The separate opt-in runner at
`apps/api/test/bff.clerk.sandbox.e2e-spec.ts` targets
`DIVE-IAM-REQ-030..032`. It reuses the existing Playwright sign-in form helper
and sandbox preflight. Its existence is not evidence of an executed Clerk or
deployment check.

Before execution, run the real Next.js and API against the dedicated local
`dive_spike` PostgreSQL database on port `55432`, with roles and product
migrations prepared. Expose the authentication host, two canonical center
hosts and the API through trusted HTTPS ingress. Use valid trusted
certificates; the runner does not disable certificate or Clerk-origin checks.
The runner does not start servers, provision DNS/TLS, migrate the database or
modify deployment secrets. Do not point it at production or a database with
real data, and do not run destructive integration/reset commands concurrently.

Provide these values through an untracked environment or secret manager:

```text
DIVE_REAL_CLERK_BFF_E2E=1
CLERK_SECRET_KEY=sk_test_<sandbox-secret>
CLERK_WEBHOOK_SIGNING_SECRET=whsec_<sandbox-webhook-secret>
CLERK_ISSUER=https://<sandbox-instance>.clerk.accounts.dev
CLERK_AUTHORIZED_PARTIES=<exact-authentication-and-both-center-origins>
CLERK_REQUEST_TIMEOUT_MS=<positive-request-timeout>
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_<sandbox-publishable-key>
AUTHENTICATION_ORIGIN=https://<authentication-host>
CENTER_APP_BASE_DOMAIN=app.<test-domain>
BFF_API_ORIGIN=https://<api-host>
DIVE_BFF_SANDBOX_CENTER_A_ORIGIN=https://<unused-center-key-a>.app.<test-domain>
DIVE_BFF_SANDBOX_CENTER_B_ORIGIN=https://<unused-center-key-b>.app.<test-domain>
SPIKE_ADMIN_DATABASE_URL=postgres://postgres:<password>@127.0.0.1:55432/dive_spike
DIVE_CLERK_SANDBOX_USER_ID=user_<authorized-technical-user>
DIVE_CLERK_SANDBOX_USER_PASSWORD=<authorized-technical-user-password>
```

The running API and web must use the same sandbox Clerk instance and host
configuration, their existing required timeouts and tenant-context secrets,
and the approved BFF credential/verifier configuration. The browser runner
does not require the raw BFF service credential. The runtime web publishable
key must match the runner's Development key before the password is submitted.
The technical user must support password login with the existing sandbox-only
client-trust preflight. Both center keys and the user's external-identity
binding must be unused in this database; the runner refuses collisions rather
than replacing existing records. Existing center-entry tombstones are not
reassigned.

Install Chromium as above, then execute:

```bash
pnpm --filter @dive-center/api test:e2e:bff:clerk:sandbox
```

The runner is excluded from normal unit and synthetic API integration tests.
It creates an isolated tenant with two centers and an Owner technical identity,
plus a foreign tenant and center without membership for that identity,
then exercises the real application login and return to center A, dashboard
bootstrap, center-scoped lists, denied reads/writes of B and the foreign center, a successful catalog
settings mutation and its PostgreSQL result, navigation to B with the same
Clerk session, and dashboard logout with provider and handle revocation. The
entry-lifecycle scenario reloads with a retained handle after disablement,
checks that a fresh tab cannot bootstrap or issue another handle, and
reactivates the entry through the protected API. A separate scenario revokes a
real Clerk session while its dashboard is open, polls the fixed center BFF with
the frozen token until expiry within the existing `DIVE-IAM-REQ-016`, `022` boundary,
checks that the revoked session cannot issue another token, and verifies that
JWT authentication denial does not precede the token's declared expiry. It checks
the dashboard's return to login after reload. These scenarios are implemented
but are not provider evidence until executed successfully. The runner
checks browser product requests for direct-API bypass and service-credential
headers. Fixtures and the created session are cleaned up even after failure;
cleanup errors fail the run. No screenshots, traces, tokens, passwords or
session IDs are retained in the safe result output.

Remaining gaps include natural expiry, Clerk-delivered webhooks, TLS/ingress deployment
proof, service-credential rotation/emergency revocation and production traffic.
The deterministic Next/API integration suite retains its separate coverage,
including post-commit connection loss and timeout without mutation retry.
Do not update provider evidence or TRACE with successful coverage until this
real-provider command and cleanup have completed.

## Application invitation acceptance spike

Issue #70 adds a separate opt-in harness for `SPIKE-DIVE-004-REQ-001..010`.
It reuses the safety and browser-login patterns above but intentionally does not
boot the product API, prepare product PostgreSQL fixtures, call a product
bootstrap endpoint, or exercise the product routes. A test-only loopback server
owns the acceptance probe for the duration of the command. The spike remains
provider evidence and must not be confused with product E2E coverage.

Issue #72 subsequently implemented the product boundaries in
`apps/web/src/app/(application)/bootstrap/accept`, `apps/web/src/app/(application)/bootstrap/setup`, and
`apps/web/src/app/(application)/sign-in`, together with the PostgreSQL bootstrap commands and
the pre-tenant worker. Those paths are validated by local component, API,
database, and deterministic worker tests, but this isolated spike does not
exercise them.

Provide these additional values through an untracked local environment or
secret manager:

```text
DIVE_REAL_CLERK_INVITATION_E2E=1
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_<sandbox-publishable-key>
DIVE_CLERK_SANDBOX_NEW_USER_EMAIL=<disposable-technical-email>
DIVE_CLERK_SANDBOX_NEW_USER_PASSWORD=<disposable-technical-password>
```

The invitation harness also uses `CLERK_SECRET_KEY`,
`DIVE_CLERK_SANDBOX_ACCOUNT_PORTAL_URL`, and the two existing technical-user
ID/password pairs documented above. It does not require database URLs or the
webhook signing secret.

Before running:

1. Confirm the Clerk instance is Development and uses Invite-only access mode.
   Clerk Allowlist is not a substitute for Invite-only.
2. Confirm the two existing users are distinct technical identities and the
   disposable email has no application user.
3. Confirm email/password authentication is available and client-trust bypass
   is limited to the existing technical sandbox users.
4. Confirm the invitation quota is sufficient for the bounded matrix. Do not
   induce a real `429` by exhausting the instance quota.
5. Confirm no value is present in shell history, `.env.example`, git diff, or
   retained command output.

Store the invitation-specific ignored environment at
`tests/clerk-invitations/.env.test.local`, then run from the repository root:

```bash
pnpm test:clerk:invitations:sandbox
```

The command rejects missing opt-in, non-test keys, a non-Development account
portal origin, reused disposable users, and a non-Development Backend API
instance before running the matrix. The probe binds to `127.0.0.1` on an
operating-system-assigned port, serves an isolated React/Vite fixture using
Clerk Future hooks, applies a short-lived Clerk Testing Token only to browser
automation, sets `Referrer-Policy: no-referrer`, and blocks product bootstrap
endpoints. The invitation URL and `__clerk_ticket` remain in memory only.

The run covers `ignoreExisting` for an existing identity, new and existing
identities without sessions, matching and different active sessions,
Invite-only signup rejection with existing-user sign-in, ticket cleanup, and a
bounded revoke/reissue observation. Browser instrumentation records only safe
categories and detects the ticket outside the acceptance request, in a
referrer, or in browser output.

Every invitation left pending by the run is revoked, every session created by
the run is revoked, and every disposable user is deleted. Existing technical
users are never deleted. Failed cleanup fails the scenario. Clerk may retain
terminal invitation records when no deletion operation exists; those records
are not active invitations.

Natural seven-day expiry, a deliberately induced provider `429`, and the
canonical deployed authentication host remain explicit gaps for this spike.
Worker retry/reconciliation and product acceptance are implemented outside the
spike and have deterministic/local coverage, but no product E2E Clerk run has
yet exercised the deployed web, API, PostgreSQL, and worker together. Do not
update spike results, evidence, or traceability until the real-provider command
has completed and cleanup has passed.

## Product E2E Clerk status

The product E2E Clerk run is intentionally postponed until a preview or staging
deployment exists with an HTTPS canonical authentication host. The current
implementation requires the exact HTTPS redirect
`/bootstrap/accept`; weakening that validation for a plain local `pnpm dev`
run would not provide equivalent evidence.

When the deployed environment is available, add a separate opt-in product
runner that reuses this harness's preflight, browser instrumentation, resource
ledger, and cleanup. It must start from a real platform invitation, execute the
real web/API/worker flow, verify the atomic PostgreSQL result, and keep the
invitation URL and `__clerk_ticket` in memory only. It must remain excluded from
normal `pnpm test` and record the run as dated provider/deployment evidence.