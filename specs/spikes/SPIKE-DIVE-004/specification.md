# SPIKE-DIVE-004 — Clerk Application Invitation acceptance

- **Status:** Draft
- **Type:** onboarding provider-behavior spike
- **Hypothesis:** Clerk Application Invitations with a custom redirect can support invited bootstrap for both new and existing Clerk identities without exposing public signup or making Clerk authoritative for tenant creation.

## Question

What behavior does Clerk Development actually produce when `createInvitation()` targets a new identity, an existing application identity, a matching signed-in identity, or a different signed-in identity, and which Clerk prebuilt/custom-flow composition safely reaches `/bootstrap/setup`?

## Documented baseline

- Clerk documents that `ignoreExisting` defaults to `false`; invitation creation errors when the email already has an invitation or belongs to an existing application user.
- Clerk documents that `ignoreExisting: true` bypasses that creation error and creates an invitation anyway.
- Clerk adds `__clerk_ticket` to a configured custom redirect and documents ticket-based acceptance.
- Those sources do not establish the complete Application Invitation acceptance behavior for every existing-user and active-session state required by US-19.

Exact sources:

- [Clerk `createInvitation()`](https://clerk.com/docs/reference/backend/invitations/create-invitation)
- [Clerk application invitations](https://clerk.com/docs/guides/users/inviting)
- [Clerk custom Application Invitation flow](https://clerk.com/docs/guides/development/custom-flows/authentication/application-invitations)
- [Clerk invite-only access](https://clerk.com/docs/guides/secure/restricting-access)

## Decision boundary

The spike observes provider behavior; it does not define product authority. PostgreSQL remains authoritative for the bootstrap grant and the separation from ordinary tenant invitations.

Production invitation issuance remains asynchronous: the API commits the bootstrap grant and pre-tenant outbox command, and `apps/worker` calls Clerk after commit. Direct Clerk calls inside the spike are allowed only to isolate and measure provider behavior; they do not replace the worker boundary in `SPEC-DIVE-ONBOARDING-001` and `ADR-DIVE-013`.

## Scope

In scope:

- `ignoreExisting: false` and `true` for an existing Clerk application identity;
- new-identity and existing-identity invitation acceptance;
- no session, matching session, and different active session;
- invite-only interaction with ordinary sign-in;
- custom redirect to a local acceptance probe and safe `__clerk_ticket` cleanup;
- identifying the smallest Clerk component/custom-flow composition that satisfies the accepted state matrix;
- a reusable, opt-in Clerk Development harness derived from the existing IAM sandbox harness.

Out of scope:

- implementing bootstrap grants, database migrations, platform invitation APIs, worker delivery, tenant/center creation, or product UI;
- migrating ordinary tenant invitations to Clerk Application Invitations;
- waiting seven days to observe natural expiry;
- load testing, production traffic, or choosing new product defaults;
- treating Clerk Organization invitation behavior as evidence for Application Invitations.

## Reuse target

Extend the patterns in:

- `apps/api/test/iam.clerk.sandbox.e2e-spec.ts`;
- `apps/api/test/clerk.browser-session.ts`;
- `docs/architecture/iam-clerk-sandbox-harness.md`.

The executed probe should remain an opt-in regression harness after the spike. It may be rerun after Clerk SDK upgrades or invite-only configuration changes. Test-only shortcuts, technical credentials, raw tickets, invitation links, and temporary callback pages must not be promoted into product code.

## Required observations

1. Record the exact create result for an existing email with `ignoreExisting: false`.
2. Record the exact create result for the same class of email with `ignoreExisting: true`.
3. Follow a new-identity invitation through the custom redirect and record the Clerk flow/state required for completion.
4. Follow an existing-identity invitation without a session and record whether sign-in can consume or continue the invitation.
5. Open an invitation with a matching active session and record the resulting provider state.
6. Open it with a different active session and verify that the application can deny neutrally and offer account switching without completing bootstrap.
7. Verify that invite-only blocks uninvited signup while preserving ordinary sign-in for an existing user.
8. Verify that the ticket can be removed with history replacement before leaving the acceptance probe and is absent from retained output, logs, errors, traces, referrers, and committed evidence.

## Closure

The spike closes when every `SPIKE-DIVE-004-REQ-*` row has an observed result or an explicit provider limitation, the reusable harness and safe evidence are committed, and `results.md` recommends one Clerk flow composition without changing SPEC/ADR status silently.

A later normative PR decides whether the observations close the onboarding open questions and whether `SPEC-DIVE-ONBOARDING-001` and `ADR-DIVE-013` can be promoted to `Ready to start`.
