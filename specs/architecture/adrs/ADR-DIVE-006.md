# ADR-DIVE-006 - Authentication assurance and support grants

- **Status:** Ready to start
- **Version:** 0.1
- **Date:** 2026-09-26
- **Decision date:** 2026-09-26
- **Deciders:** Product / Security / Architecture
- **Affected IDs:** `DIVE-IAM-REQ-019`, `020`, `024`, `025`, `028`

## Provenance

The decisions were introduced as `Proposed` from `SPEC-DIVE-IAM-001`, `specs/foundation/iam-baseline.md`, and `specs/foundation/security-privacy-baseline.md`. Product, Security, and Architecture explicitly approved all proposals on 2026-09-26; this ADR is now normative implementation authority. Its open questions remain outside the approved decision.

## Context

The MVP does not require MFA for ordinary dashboard users, but the identity boundary must support future step-up without a schema rewrite. Platform support access is privileged, read-only, time-bounded, justified, tenant-explicit, and audited. Support actors are not tenant staff and must not receive tenant roles or bypass RLS.

## Proposed decision

### Vendor-neutral assurance

- `IdentityProviderPort` returns a provider-neutral assurance context alongside `issuer + subject`.
- The context exposes `single_factor` or `multi_factor` assurance and the time at which that assurance was verified.
- Application authorization policy consumes assurance; domain code does not import Clerk claims or SDK types.
- Ordinary MVP dashboard authorization does not require multi-factor assurance.
- New assurance levels may be added through the identity adapter contract without changing membership storage.

### Support grants

- Support access is represented by an internal grant separate from tenant memberships.
- A grant identifies the support identity, explicit tenant, `support.tenant.read`, justification, ticket/reference, issuer, optional approver, start, expiry, revocation, and audit correlation.
- A grant has a maximum duration of 60 minutes and cannot be extended in place. Continued access requires a new grant.
- Activating a grant requires multi-factor assurance verified at or after grant issuance.
- Support authorization requires both a valid provider session and a valid internal grant on every request.
- Support reads use application use cases and tenant-scoped persistence. Grants do not bypass RLS.
- `support.tenant.write` does not exist in the MVP. Unknown or write-like support actions fail closed.

## Consequences

- Clerk remains an adapter and can be replaced without changing domain authorization types.
- Assurance is evaluated at request time while grants remain independently revocable.
- The support model can be implemented and tested before a support UI exists.
- Support activation with real data remains blocked until grant issuers, approval rules, and the resource allow-list are approved.

## Alternatives considered

- Store Clerk-specific MFA fields on memberships: rejected because it couples authorization storage to one provider.
- Give support actors tenant memberships: rejected because support is a platform capability, not tenant employment or collaboration.
- Long-lived or extendable support grants: rejected because short replacement grants produce clearer review and revocation boundaries.
- Allow support write operations with MFA: rejected because write support is outside MVP scope.

## Open questions

- The platform identity or control-plane capability allowed to issue and approve support grants is not yet specified.
- Whether every grant requires a distinct approver cannot be decided until the support operating model exists.
- The exact read-resource allow-list is not defined; no generic tenant-database read is authorized.
- Emergency or break-glass support is outside this decision and remains disabled.
- Audit and grant retention remain open pending operations and privacy policy.

## Acceptance criteria / evidence

- Assurance contract tests map provider fixtures without exposing provider SDK types outside the adapter.
- Ordinary dashboard authorization is unchanged by absence of MFA.
- Missing, stale, single-factor, expired, revoked, wrong-tenant, and write support attempts fail closed.
- Support access remains tenant-scoped under RLS and is audited with justification and expiry.
- Support-expiry tests demonstrate denial immediately after the grant expires.