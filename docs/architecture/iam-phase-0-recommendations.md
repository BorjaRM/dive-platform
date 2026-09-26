# IAM Phase 0 recommendations

This is a non-normative record of decision preparation. The selected recommendations were approved in `ADR-DIVE-004` through `ADR-DIVE-007` on 2026-09-26. Those ADRs, not this document, are implementation authority.

## Goal

Close the decisions that block implementation of `DIVE-IAM-REQ-007..009`, `015..017`, `019..022`, and `025..026` without silently selecting states, TTLs, permissions, invariants, or acceptance criteria.

## Approved ADR outcomes

The recommendations were introduced as `Proposed` decisions and approved in these ADRs:

- `ADR-DIVE-004`: invitation and membership lifecycle.
- `ADR-DIVE-005`: public channels and opaque capability tokens.
- `ADR-DIVE-006`: provider-neutral assurance and support grants.
- `ADR-DIVE-007`: audit, purpose limitation, session, webhook, and revocation boundaries.

The ADRs, not this recommendation document, are the normative decision surface. Their open questions remain unresolved and do not authorize implementation defaults.

## Decision workflow

For each topic:

1. Confirm that the existing SPEC and baseline sources do not already determine the answer.
2. Select an option or record the topic as an open question.
3. Record provenance, exact sources, approver, and approval reference.
4. Update only the normative artifact that owns the decision and bump its version when meaning changes.
5. Update TRACE with relationships only after executable proof exists.

Do not combine approval of these decisions with promotion of `SPEC-DIVE-IAM-001` to `Review` or `Accepted`.

## Recommended decisions

### 1. Invitation lifecycle

**Related IDs:** `DIVE-IAM-REQ-017`, `022`, `024`, `025`.

**Proposed recommendation:** model invitations separately from active access. An invitation creates or references a `pending` tenant membership with explicit roles and center scopes. Acceptance must bind the authenticated `issuer + subject` to that intended membership before it can become `active`. Rejection, revocation, and expiry must never grant access.

**Why:** this preserves the existing membership model, keeps authorization dependent on active internal state, and avoids treating an emailed address or provider payload as identity proof.

**Approval needed:** allowed transitions; whether reinvitation reuses or replaces a pending membership; invitation expiry policy; who may revoke; behavior when the invitee already has an external identity.

**Recommended proof:** transition-table unit tests, cross-tenant acceptance denial, wrong-identity denial, center-scope validation, idempotent acceptance, and audit/outbox atomicity.

### 2. Public token model

**Related IDs:** `DIVE-IAM-REQ-007..009`, `026` and `DIVE-BOOK-REQ-023`.

**Proposed recommendation:** use high-entropy opaque bearer tokens. Persist only a one-way verifier plus purpose, resource reference, issue time, expiry, and consumption/revocation state. Use separate purposes for confirmation-read and cancellation. Never encode tenant IDs, internal roles, permissions, or unrelated resource identifiers in the client-visible token.

**Why:** opaque single-purpose credentials minimize disclosure, permit server-side revocation, and keep authorization data under platform control.

**Approval needed:** TTL per token purpose; whether confirmation-read is reusable until expiry; whether cancellation becomes consumed after first successful use; resend/rotation behavior; retention of expired verifier records.

**Recommended proof:** wrong-purpose, expired, revoked, consumed, tampered, replayed, other-booking, and cross-tenant negative tests. Record the approved TTL in the normative source before implementation.

### 3. Published public-channel authorization

**Related IDs:** `DIVE-IAM-REQ-007`, `008` and `DIVE-BOOK-REQ-004`, `017`, `037..041`.

**Proposed recommendation:** authorize a public request from one server-side channel record that resolves tenant, center, channel type, allowed activity scope, publication state, and origin policy. Treat all browser-supplied tenant, center, activity, slot, role, and permission values as selectors to validate against that record, never as authority.

**Why:** this follows ADR-DIVE-001 and keeps public capability resolution separate from dashboard IAM.

**Approval needed:** channel lookup key format; disabled-channel behavior; origin enforcement boundary; whether channel configuration changes revoke outstanding non-booking capabilities.

**Recommended proof:** unpublished/disabled channel denial, mismatched tenant/center/activity denial, origin-policy tests, and proof that no dashboard role or internal permission is returned.

### 4. Step-up assurance model

**Related IDs:** `DIVE-IAM-REQ-019`, `020`.

**Proposed recommendation:** add a vendor-neutral assurance context at the identity boundary rather than Clerk-specific fields in domain or application code. The context should distinguish authentication assurance and recency, while authorization policy decides when a capability requires step-up. MVP dashboard use remains allowed without mandatory MFA; privileged support remains read-only.

**Why:** this supports future MFA/step-up without a schema rewrite and preserves the identity-provider adapter boundary.

**Approval needed:** assurance levels used by the platform; which future capabilities require them; freshness semantics; whether assurance is evaluated from the session, an internal grant, or both.

**Recommended proof:** adapter contract tests using provider-neutral assurance fixtures and policy tests showing ordinary dashboard access is unaffected while unapproved privileged writes remain denied.

### 5. Support grant model

**Related IDs:** `DIVE-IAM-REQ-020`, `024`, `025`, `028`.

**Proposed recommendation:** represent support access as an internal, time-bounded grant separate from tenant memberships. A grant should identify the support actor, explicit tenant, approved read-only capability, justification, ticket/reference, issuer/approver where required, start, expiry, and revocation state. It must not bypass RLS or create a tenant role.

**Why:** support actors are platform principals, not tenant staff. A separate grant prevents accidental persistence of broad tenant membership and supports expiry and review.

**Approval needed:** who may create and approve grants; maximum duration; whether approval is always required; allowed read resources; emergency-access process; retention and after-the-fact review policy.

**Recommended proof:** missing/expired/revoked grant, wrong tenant, missing justification, prohibited write, RLS enforcement, and complete audit tests. Do not implement a duration until approved.

### 6. Session invalidation and revocation

**Related IDs:** `DIVE-IAM-REQ-016`, `021`, `022`.

**Proposed recommendation:** re-resolve active membership, roles, and scopes for every authorized application use case, retaining the current transaction-local recheck for sensitive mutations. Treat Clerk session validity as authentication only. Process verified webhooks as synchronization signals, not authorization facts, and make every handler idempotent.

**Why:** this preserves PostgreSQL as authorization source of truth and already provides next-request membership and role revocation for the current API slice.

**Approval needed:** caching policy, if any; session invalidation strategy; webhook event inventory; idempotency retention; behavior when Clerk is temporarily unavailable; measurement method for the five-minute requirement.

**Recommended proof:** membership disable, role removal, session expiry, logout, duplicate/out-of-order webhook, invalid signature, provider outage, and measured revocation-window tests.

### 7. Sensitive-operation audit envelope

**Related IDs:** `DIVE-IAM-REQ-015`, `020`, `021`, `025`.

**Proposed recommendation:** define one append-only audit envelope for sensitive authorization decisions. It should carry actor identity or safe actor category, explicit tenant, action, resource type and identifier when disclosure is allowed, result, stable reason code, purpose/justification where required, correlation ID, occurred-at time, and safe source metadata. Sensitive mutation state, audit, and outbox records should commit atomically.

**Why:** a common envelope makes allow/deny evidence consistent across memberships, customer-contact access, support, public capabilities, and webhooks without coupling domain code to a logging vendor.

**Approval needed:** authoritative action/reason catalogs; which allow decisions are sensitive; audit retention; visibility/export permissions; PII policy; treatment of failures before identity or tenant resolution; whether direct database updates are prohibited or audited by a database-owned path.

**Recommended proof:** allow/deny, pre-resolution failure, redaction, correlation, atomic rollback, immutable record, and direct app-role mutation tests.

### 8. Purpose-limited customer contact access

**Related IDs:** `DIVE-IAM-REQ-015`, `025`.

**Proposed recommendation:** require an explicit booking-operations purpose at the application use-case boundary and derive tenant, center, booking, and contact scope internally. Do not expose a generic contact lookup capability. Record the purpose and authorization outcome in the audit envelope.

**Why:** this narrows access to an observable business operation and avoids turning `customer_contact.read` into unrestricted directory access.

**Approval needed:** allowed purpose catalog; which booking states permit access; fields returned per role; export behavior; retention and masking expectations.

**Recommended proof:** valid booking-operation access, unrelated booking, wrong center, wrong tenant, disallowed purpose, excess-field, and audit tests.

### 9. External collaborator disabled state

**Related IDs:** `DIVE-IAM-REQ-014`, `023`.

**Proposed recommendation:** keep the role name reserved in the stable catalog but reject it in active authorization assignments for the first pilot. Existing or imported records carrying the role must fail closed and grant no capability.

**Why:** rejecting active assignment is easier to reason about than allowing a membership that appears active but can never act. Retaining fail-closed behavior also protects imported or stale records.

**Approval needed:** whether pending invitations may reference the role; migration behavior for existing active rows; operator-facing error behavior.

**Recommended proof:** assignment rejection, invitation rejection if selected, imported active-row fail-closed, mixed-role behavior, and unknown-role tests.

## Recommended decision artifacts

Use focused decision records rather than one large ADR when the owners or approval timing differ:

| Decision record | Topics | Primary IDs |
|---|---|---|
| IAM membership lifecycle | Invitation lifecycle and disabled external collaborator | `DIVE-IAM-REQ-014`, `017`, `022` |
| IAM public capabilities | Published channels and public token model | `DIVE-IAM-REQ-007..009`, `026` |
| IAM assurance and support | Step-up context and support grants | `DIVE-IAM-REQ-019`, `020`, `028` |
| IAM audit and revocation | Audit envelope, session invalidation, webhook behavior, purpose-limited contact access | `DIVE-IAM-REQ-015`, `016`, `021`, `022`, `025` |

These may become ADRs or approved SPEC sections. The owner should choose the normative home before approval to avoid duplicate authority.

## Phase 0 exit checklist

- Every approval-needed item above is approved or explicitly remains open.
- Every approved item has provenance and an exact approval reference.
- No implementation PR relies on an undecided TTL, transition, permission, or retention rule.
- `SPEC-DIVE-IAM-001` and affected ADR versions change only where meaning changes.
- TRACE contains relationships only and does not claim implementation evidence.
- Phase 1 test cases can be written from approved behavior without guessing.