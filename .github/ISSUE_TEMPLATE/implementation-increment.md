---
name: Implementation increment
description: Implement one coherent Ready-to-start product slice from existing requirement IDs.
title: ""
assignees: []
---

## Development brief

<!-- This issue is the single owner of the short implementation flow. The PR must link this issue with `Closes #...` and must not copy the brief. -->

### User story

As a [role], I want [observable capability], so that [business value].

### Flow

1. [Entry condition and actor context.]
2. [Main user/system action.]
3. [Authoritative server-side decision or write.]
4. [Observable successful result.]
5. [Relevant failure/denial outcome, by reference if already specified.]

### Contract references

- **Implements:** `DIVE-...`
- **Decisions:** `ADR-...`
- **Source:** `SPEC-...`
- **Cross-cutting:** `MT-REQ-...` | None

### Scope

- **In:** [smallest coherent behavior delivered by this increment]
- **Out:** [adjacent behavior deliberately excluded]

### Surfaces and ownership

- **UI/API/worker/database:** [expected paths or components]
- **Authority remains in:** [server/domain/PostgreSQL/external provider as documented]

### Recommended execution

<!-- Select project agents from `.github/agents/README.md`. This guidance is non-normative and does not replace the contract references, agent required reading, or stop conditions. -->

- **Primary agent:** [one project agent responsible for this implementation slice]
- **Specialist handoff:** None | [allowed specialist agent and the condition that triggers the handoff]
- **Optional validation handoff:** None | Test and Evidence Engineer — [specific test, Validation, or special-evidence gap]
- **Review handoff:** Implementation PR Reviewer | SDD Gatekeeper for `specs/**` only

### Verification plan

- **Tests:** [stable test paths or planned focused checks]
- **Separate evidence required:** No — tests are the proof | [reason and target evidence path]

### Open questions

- None | [missing or contradictory decision that blocks implementation]

## Ready check

- [ ] Every implemented behavior maps to Ready-to-start requirement IDs.
- [ ] The flow adds no silent state, permission, invariant, default, limit, API/event contract, error rule, or acceptance criterion.
- [ ] In/out scope is small enough for one coherent PR.
- [ ] The primary implementation agent and any conditional specialist handoffs were identified from `.github/agents/README.md`.
- [ ] Applicable IAM, tenant-isolation, outbox/idempotency, privacy, and concurrency stop conditions were identified.
- [ ] No blocking open question remains.
