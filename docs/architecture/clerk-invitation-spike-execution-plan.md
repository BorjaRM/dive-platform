# SPIKE-DIVE-004 invitation acceptance execution plan

This is a non-normative execution plan for [issue #70](https://github.com/BorjaRM/dive-platform/issues/70). The spike package under `specs/spikes/SPIKE-DIVE-004/`, `SPEC-DIVE-ONBOARDING-001`, and `ADR-DIVE-013` remain authoritative. This plan does not promote onboarding, authorize product bootstrap code, or change the PostgreSQL authority boundary.

## Ownership and workflow

- **Primary agent:** Test Engineer.
- **Implementation scope:** tests, test-only fixtures, runner configuration, operational documentation, executed spike results, traceability, and minimal safe external-provider evidence.
- **Excluded implementation:** product `/bootstrap/accept` or `/bootstrap/setup` routes, bootstrap grants, migrations, platform invitation APIs, worker delivery, tenant creation, and product UI.
- **Specialist delegation:** none. Test Engineer cannot delegate to another agent.
- **Review sequence:** SDD Reviewer for changes under `specs/**`, then PR Reviewer for the complete change. Each handoff requires user confirmation.

## Outcome

Execute `SPIKE-DIVE-004-REQ-001..010` against a Clerk Development instance and retain an opt-in regression harness that:

- measures the application-invitation behavior required by the issue;
- exercises a test-only `/bootstrap/accept` boundary without implementing the product route;
- records only safe provider observations;
- leaves no active invitation, session, or disposable user created by the run;
- produces an evidence-based recommendation without silently selecting new product behavior.

Closing this issue does not by itself make `SPEC-DIVE-ONBOARDING-001` or `ADR-DIVE-013` Ready to start.

## Approved execution decisions

### Test-only acceptance probe

Do not add `/bootstrap/accept` under `apps/web/src/app`. The harness will start an ephemeral loopback HTTP server and serve the exact `/bootstrap/accept` pathname for the duration of the focused test command.

The probe must:

- bind only to `127.0.0.1` on an operating-system-assigned port;
- pass the resulting full URL as the invitation `redirectUrl`;
- return `Referrer-Policy: no-referrer`;
- initialize Clerk with a test publishable key;
- consume `__clerk_ticket` through the supported Clerk browser API;
- call `history.replaceState()` before simulated navigation to `/bootstrap/setup`;
- reject or record any request to product bootstrap endpoints as a harness failure;
- exist only under test paths and never become a production import.

If the probe needs `@clerk/clerk-js`, declare it as a direct test dependency instead of relying on the transitive dependency from `@clerk/nextjs`.

### Invitation link

Use the `Invitation.url` returned by the Clerk Backend SDK. Treat it as an in-memory secret: never print, persist, snapshot, attach, or include it in an error. If Clerk does not return the URL, revoke the created invitation and fail with the safe category `invitation_url_unavailable`. Email inbox automation is out of scope.

### Invite-only configuration

The Clerk Development instance must be configured in Invite-only access mode (`sign_up_mode=restricted`) before execution. Do not substitute Clerk Allowlist for Invite-only and do not let the harness mutate global instance configuration.

The harness proves the effective configuration behaviorally:

- an uninvited identity cannot sign up;
- an existing application identity can still sign in.

### Cleanup semantics

Cleanup succeeds when:

- no invitation created by the run remains pending;
- every session created by the run is revoked;
- every disposable user created by the run is deleted;
- pre-existing technical users remain intact.

Accepted or otherwise terminal provider invitation records may remain when Clerk exposes no deletion operation. Record that limitation safely; do not treat a retained terminal record as an active invitation. Any active resource or failed cleanup makes the scenario fail.

### Lifecycle and rate-limit boundary

Include a bounded revocation/reissue observation: revoke one pending invitation, verify its link is unusable, then create and verify a replacement invitation. Do not exhaust the provider quota to force `429` and do not wait for natural seven-day expiry.

Record natural expiry and a real `429` response as explicit evidence gaps. Later product implementation must test worker handling of `Retry-After` deterministically. Before onboarding promotion, SDD review must decide whether documented provider behavior plus deterministic adapter/worker tests is sufficient or whether another time-bound provider run is required.

## Expected file surface

The exact helper split may follow local test conventions, but the intended surface is:

- add a private `tests/clerk-invitations` workspace containing the matrix, acceptance probe, React fixture, and dedicated Vitest configuration;
- expose explicit root commands while omitting a workspace `test` script so normal `pnpm test` cannot select the real-provider matrix;
- update `docs/architecture/iam-clerk-sandbox-harness.md` rather than adding another runbook;
- update `specs/spikes/SPIKE-DIVE-004/results.md` and `traceability.md` after execution;
- create `evidence/spikes/SPIKE-DIVE-004/` only after a real run and only when recording the time-bound provider observation.

Do not modify production application modules to make the probe reusable. Reuse `clerk.browser-session.ts` only where its existing sign-in contract matches. Keep invitation-specific behavior local unless demonstrated duplication justifies a test-only extraction.

## Phase 1: safety preflight

1. Confirm a dedicated Clerk Development instance and an `sk_test_` secret key.
2. Confirm a `pk_test_` publishable key for the acceptance probe.
3. Confirm Invite-only access mode and email/password strategies required by the technical identities.
4. Confirm the existing and different-session users are technical accounts with no personal data.
5. Prepare one disposable technical email for the new-identity scenario.
6. Confirm no required value is stored in `.env.example`, shell history, committed files, or command output.
7. Inspect pending invitations and disposable users before execution so cleanup can target only resources owned by the run.
8. Confirm sufficient invitation API quota for the bounded matrix without approaching the documented hourly limit.

The focused command must refuse to start provider calls unless an invitation-specific opt-in flag is set. It must validate the secret key, publishable key, account-portal origin, loopback redirect, and required technical identity inputs before creating any provider resource.

## Phase 2: harness construction

1. Add the invitation-specific runner and ensure normal `pnpm test` and synthetic API e2e do not select it.
2. Implement safe observation categories that contain no provider messages or sensitive values.
3. Implement a resource ledger for invitation IDs, session IDs, and disposable user IDs created by the run. IDs remain in memory and are used only for cleanup; persisted output uses safe categories or hashes only when needed.
4. Implement the ephemeral acceptance server and browser instrumentation.
5. Assert that the initial redirect is the only request allowed to contain `__clerk_ticket`.
6. Assert that subsequent URLs, history entries, request referrers, browser console output, page errors, and retained observations contain no ticket.
7. Reject calls to `/v1/me/tenant-bootstrap` and the platform bootstrap-invitation endpoints.
8. Implement cleanup in `finally` hooks so partial setup and failed assertions still trigger cleanup.

## Phase 3: provider execution matrix

| Scenario | Spike requirements | Minimum safe observation |
|---|---|---|
| Existing email, `ignoreExisting: false` | `SPIKE-DIVE-004-REQ-001` | success/error category and whether a resource was created |
| Existing email, `ignoreExisting: true` | `SPIKE-DIVE-004-REQ-001` | creation category, initial status, and URL availability |
| New identity, no session | `SPIKE-DIVE-004-REQ-002`, `006` | Clerk operation/state sequence, session outcome, and ticket cleanup |
| Existing identity, no session | `SPIKE-DIVE-004-REQ-003`, `006` | required sign-in/acceptance sequence and safe outcome |
| Matching active session | `SPIKE-DIVE-004-REQ-004`, `006` | continuation/denial state and absence of product completion |
| Different active session | `SPIKE-DIVE-004-REQ-004`, `006` | neutral denial, account-switch path, and absence of product completion |
| Uninvited signup and existing-user sign-in | `SPIKE-DIVE-004-REQ-005` | signup-blocked and sign-in-available categories |
| Revocation and replacement invitation | `SPIKE-DIVE-004-REQ-008`, `009` | old-link unusable, replacement-link usable, cleanup result |
| Harness opt-in and product-boundary guard | `SPIKE-DIVE-004-REQ-007`, `010` | refusal without opt-in and no product endpoint invocation |

Use a separate invitation for scenarios that consume or invalidate a ticket. Do not reuse a consumed link to infer another session-state result.

## Phase 4: observation then regression

Run the spike in two passes:

1. **Observation pass:** collect bounded safe categories and Clerk state transitions without assuming the unknown provider result.
2. **Regression pass:** encode the observed supported flow as assertions, rerun the complete matrix, and preserve the harness for later Clerk SDK or configuration changes.

If observations require a new product or architecture decision, stop. Record the question in `results.md` and return it to SDD Writer; do not make the product choice inside the test.

## Phase 5: documentation and evidence

After a successful real run:

1. Complete `results.md` with date, commit, Clerk SDK version, environment class, focused command, safe observations, limitations, cleanup result, and one evidence-based composition recommendation.
2. Replace pending entries in the spike `traceability.md` with exact stable test and evidence paths. Do not mark unsupported coverage.
3. Extend the existing Clerk sandbox runbook with invitation-specific environment inputs, preflight, command, cleanup, and known gaps.
4. Add one minimal evidence artifact containing only time-bound provider observations that tests cannot preserve. Do not copy logs, raw JSON, screenshots, tickets, URLs, emails, cookies, tokens, or provider error text.
5. Leave `SPEC-DIVE-ONBOARDING-001` and `ADR-DIVE-013` statuses unchanged. Update TRACE only for the stable test-path and execution-state relationship; a later normative review owns product requirement or status changes.

## Validation plan

Record only commands actually run and their observed results in the PR.

Expected checks:

```bash
pnpm test:clerk:invitations:sandbox
pnpm --filter @dive-center/api test
pnpm --filter @dive-center/api test:e2e
pnpm check
pnpm test
```

Validation must also confirm:

- the focused command refuses execution without its explicit opt-in flag;
- normal and synthetic test commands do not call Clerk or select the invitation sandbox test;
- no active provider resource owned by the run remains after success or failure;
- `git diff` and retained test output contain no sensitive values;
- every `SPIKE-DIVE-004-REQ-001..010` row maps to a passing scenario or an explicit reviewed limitation.

## Stop conditions

Stop provider execution and clean up immediately when:

- any key is not a Clerk test key;
- an origin is neither the expected Clerk Development origin nor loopback;
- the instance is not Invite-only;
- a personal identity or production data would be used;
- `Invitation.url` is absent;
- a ticket, credential, email, cookie, or unredacted provider response reaches output or retained artifacts;
- cleanup cannot remove an active invitation, session, or disposable user;
- the required flow needs production route code or a change to PostgreSQL authority;
- the observations contradict `SPEC-DIVE-ONBOARDING-001`, `ADR-DIVE-002`, or `ADR-DIVE-013`.

## Known gaps after issue completion

- Natural seven-day expiration is not executed.
- A real provider `429` is not deliberately induced.
- The canonical deployed authentication host is not exercised by the loopback probe.
- The product `/bootstrap/accept` route is not implemented.
- Worker delivery, retry, reconciliation, and pre-tenant persistence remain future product implementation.

These gaps must remain visible in `results.md` and PR Validation. They prevent this spike alone from being used as onboarding readiness or implementation evidence.

## Completion checklist

- The invitation sandbox command is explicit, opt-in, and excluded from normal tests.
- The provider matrix has been executed twice: observation and regression.
- Ticket/referrer/history protections are executable assertions.
- Cleanup passes for every created provider resource.
- The product and worker boundaries remain unchanged.
- Results, traceability, runbook, and minimal evidence are updated without copied logs.
- Remaining expiry, `429`, deployed-host, and product-route gaps are explicit.
- SDD Reviewer and PR Reviewer handoffs are proposed with user confirmation.