# SPIKE-DIVE-004 — Results

- **Execution status:** Executed; closure criteria met
- **Decision:** Spike concluded; the provider ticket-flow uncertainty is resolved, while product implementation remains subject to the Draft onboarding SPEC/ADR lifecycle
- **Date:** 2026-09-29
- **Source state:** Base commit `5939c62` plus the uncommitted spike harness changes under review
- **Clerk SDK version:** `@clerk/backend` 3.20.1; `@clerk/react` 6.17.2; `@clerk/testing` 2.2.39; ClerkJS hosted major version 6
- **Environment:** Clerk Development instance in Invite-only mode; technical identities only; no production data
- **Command:** `pnpm test:clerk:invitations:sandbox` from the repository root

## Covered requirements

- `SPIKE-DIVE-004-REQ-001`: observed both `ignoreExisting` branches.
- `SPIKE-DIVE-004-REQ-002`: the new-identity ticket flow completed sign-up and established a session.
- `SPIKE-DIVE-004-REQ-003`: the existing-identity ticket flow completed sign-in and established a session for the existing identity.
- `SPIKE-DIVE-004-REQ-004`: matching and different active sessions were established through the same-origin custom flow and classified without product completion.
- `SPIKE-DIVE-004-REQ-005`: uninvited signup was rejected while ordinary existing-user sign-in remained available.
- `SPIKE-DIVE-004-REQ-006`: the probe removed `__clerk_ticket` and the browser assertions detected no retained URL, referrer, console, or page-error disclosure.
- `SPIKE-DIVE-004-REQ-007`: the reusable real-provider harness remained opt-in and isolated from normal test selection.
- `SPIKE-DIVE-004-REQ-008`: invitations, sessions, and the disposable identity were cleaned after every scenario; cleanup failure would fail the run.
- `SPIKE-DIVE-004-REQ-009`: the supported Future API composition and remaining non-ticket limitations are recorded below.
- `SPIKE-DIVE-004-REQ-010`: the test-only probe did not invoke a product bootstrap endpoint or change the PostgreSQL/outbox authority boundary.

## Safe observations

- One file and ten tests passed in 25.44 seconds during the final provider run.
- `ignoreExisting: false` rejected invitation creation for the existing application identity.
- `ignoreExisting: true` created an invitation and returned an in-memory URL.
- Invite-only rejected an uninvited signup; an existing technical identity completed ordinary sign-in.
- New-identity invitation acceptance completed with `signUp.ticket()`, the required password step, and `signUp.finalize()`.
- Existing-identity invitation acceptance completed with `signIn.ticket()`, the required password factor, and `signIn.finalize()`.
- Same-origin ordinary password sign-in completed with `signIn.create()` followed by `signIn.finalize()`.
- Matching and different active identities remained distinguishable at the acceptance probe. The different identity was denied neutrally and account switching was available.
- A revoked link was rejected and a replacement invitation reached the probe.
- No product bootstrap boundary was invoked. The final cleanup completed without an active resource owned by the run.

## `ignoreExisting`

- `false`: provider rejection; no invitation created by the scenario.
- `true`: invitation created and URL available in memory for the test.

Provider error text is deliberately not retained as a product contract.

## Identity and session matrix

| Identity/session state | Observed Clerk flow | Ticket consumed | Safe outcome |
|---|---|---|---|
| New identity, no session | `signUp.ticket()` → required password step → `signUp.finalize()` | Future ticket operation completed | New identity and active session created; ticket removed |
| Existing identity, no session | `signIn.ticket()` → required password factor → `signIn.finalize()` | Future ticket operation completed | Existing identity signed in; ticket removed |
| Existing identity, matching session | Same-origin custom sign-in established the expected active identity before the invitation opened | No product completion attempted | Matching identity observed; ticket removed |
| Different active session | Same-origin custom sign-in established a distinct active identity before the invitation opened | Acceptance denied without product completion | Neutral denial and account switching available; ticket removed |

## Ticket and redirect handling

The initial acceptance request was the only request allowed to contain `__clerk_ticket`. The probe used history replacement before any simulated setup navigation. Browser request, referrer, console, page-error, URL, and retained-observation checks found no ticket outside that boundary.

Ticket removal is demonstrated for every acceptance attempt. The new-identity and existing-identity no-session rows also demonstrate successful Clerk Future ticket operations and finalized sessions. The active-session rows demonstrate safe classification without product bootstrap completion; the different-session row additionally demonstrates neutral denial and account switching.

## Reusable assets

- `tests/clerk-invitations/test/iam.clerk-invitations.sandbox.e2e-spec.ts`
- `tests/clerk-invitations/test/clerk-invitation-probe.ts`
- `tests/clerk-invitations/test/fixtures/clerk-invitation-react/`
- `tests/clerk-invitations/vitest.config.ts`
- `docs/architecture/iam-clerk-sandbox-harness.md`
- `evidence/spikes/SPIKE-DIVE-004/clerk-development-run-2026-09-29.md`

## Limitations

- Natural seven-day expiration was not executed.
- A real provider `429` was not induced.
- The canonical deployed authentication host was not exercised; the probe used an ephemeral loopback origin.
- Product bootstrap routes, grants, persistence, worker delivery, and reconciliation were not implemented or exercised.

## Recommendation

**Derived from the executed provider observations:** use application-owned custom flows with the Clerk Future API. Ordinary login uses `signIn.create()` followed by `signIn.finalize()`. Invitation acceptance remains a separate `/bootstrap/accept` controller: use `signUp.ticket()` plus the required password step and `signUp.finalize()` for a new identity; use `signIn.ticket()` plus the required password factor and `signIn.finalize()` for an existing identity. Preserve neutral account switching for a different active identity. Invite-only remains the provider access mode. Clerk Testing Tokens are automation-only and must not enter product code.

**Proposed, non-normative implementation change:** replace the dashboard's `<RedirectToSignIn />` coupling with application navigation to `/sign-in/[[...sign-in]]`, then implement and test that route as a custom Clerk flow. The route must remain ordinary login only and must not expose signup or bootstrap controls. This proposal does not change `DIVE-ONB-REQ-037` and requires product implementation/review outside this spike.

The provider sequence no longer blocks a future product acceptance controller. Product implementation still requires the applicable onboarding SPEC/ADR lifecycle and implementation brief. This conclusion does not promote `SPEC-DIVE-ONBOARDING-001` or `ADR-DIVE-013`.
