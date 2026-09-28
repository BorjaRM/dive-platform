---
name: reuse-boundary-hygiene
description: Prevent boundary erosion and require evidence-based reuse decisions. Use when adding, moving, or reviewing modules, services, repositories, helpers, contracts, adapters, public exports, shared UI, or cross-feature imports; or when duplicating authorization, tenant scope, transactions, validation, idempotency, outbox, or provider logic.
---

# Reuse and boundary hygiene

Force the inspection and justification, not reuse itself. Reuse must preserve
ownership and semantics; boundary protection is mandatory.

## Procedure

1. Identify the behavior owner and the public contract or entry point that
   callers should use.
2. Search the repository for the same responsibility, existing consumers, and
   established modules, tokens, primitives, or UI components before adding a
   new abstraction or export.
3. Choose and record one outcome:
   - reuse the existing owner because semantics and lifecycle match;
   - keep behavior local because similarity is incidental or variation is not
     demonstrated;
   - extract a shared abstraction because real duplication, an external
     dependency, or known variation justifies it.
4. Check every affected boundary:
   - dependency direction remains valid;
   - features consume public providers or contracts, never another feature's
     internal implementation files;
   - domain code does not import frameworks, persistence, or vendor SDKs;
   - trusted authorization or scope objects are not accompanied by duplicate
     tenant, actor, center, or resource authority arguments;
   - transport and presentation layers do not become authorization or domain
     decision owners;
   - transaction, tenant context, idempotency, audit, and outbox guarantees
     remain explicit and atomic where their existing contract requires it;
   - public contracts and exports do not change without approved authority.
5. Test observable behavior through the owning public boundary. Add a negative
   boundary test when the change could permit a forbidden dependency,
   contradictory authority, cross-scope access, duplicate side effect, or
   partial commit.

## Review rules

- Do not extract solely because two blocks look similar or share a line count.
- Do not create generic helpers that hide authorization, tenant scoping,
  transaction ownership, idempotency, audit, or outbox behavior.
- Repeated security or transaction mechanics are not harmless local
  duplication: route them through the established trusted primitive or report
  the missing owner.
- A new abstraction must reduce demonstrated duplication, isolate a real
  external dependency, or support known variation. Future flexibility alone is
  not evidence.
- Prefer a small local implementation over a new shared API when ownership or
  semantics differ.

## Stop conditions

Stop and repair or report the issue when:

- a change bypasses an owning public boundary or imports feature internals;
- authority can be supplied through contradictory trusted and untrusted inputs;
- reuse would weaken tenant isolation, authorization, transactionality,
  idempotency, audit, or outbox guarantees;
- a public contract or dependency direction must change without approved
  authority; or
- the proposed shared abstraction depends on an unapproved product decision.

## Output

- Reuse decision: reused | kept local | extracted, with the concrete evidence
- Boundary checks performed and any violations
- Public behavior or negative-boundary tests run
- Remaining gaps or decisions that require approval