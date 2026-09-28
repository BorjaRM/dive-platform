# Development brief — implementation increment

Use this brief in a GitHub issue or pull request when implementing an already approved slice. It explains the end-to-end flow without creating a second SPEC.

Do not create a separate copy of this file for every task. Copy only the template headings into the issue or PR and replace the guidance. Link the owning requirement IDs and decisions instead of repeating their technical criteria.

## When to use

Use this brief when:

- the behavior is already authorized by a Ready-to-start SPEC/ADR;
- one issue or PR implements a coherent, testable increment;
- another agent needs enough flow context to implement or review the slice.

Do not use it to introduce a new state, permission, invariant, default, limit, API contract, event contract, error rule, or acceptance criterion. Record that gap as an open question and hand it to SDD Writer.

## Template

```md
## Development brief

### User story
As a [role], I want [observable capability], so that [business value].

### Flow
1. [Entry condition and actor context.]
2. [Main user/system action.]
3. [Authoritative server-side decision or write.]
4. [Observable successful result.]
5. [Relevant failure/denial outcome, by reference if already specified.]

### Contract references
- Implements: `DIVE-...`
- Decisions: `ADR-...`
- Source: `SPEC-...`
- Cross-cutting: `MT-REQ-...` or `None`

### Scope
- In: [smallest coherent behavior delivered by this increment]
- Out: [adjacent behavior deliberately excluded]

### Surfaces and ownership
- UI/API/worker/database: [paths or components expected to change]
- Authority remains in: [server/domain/PostgreSQL/external provider as documented]

### Verification
- Tests: [stable test paths or planned focused checks]
- Separate evidence required: `No — tests are the proof` | [reason and target evidence path]

### Open questions
- None | [missing or contradictory decision that blocks implementation]
```

## Example — US-08 catalog increment

```md
## Development brief

### User story
As an authorized center manager, I want to configure activities and schedule slots, so that the center has availability that later public-booking slices can publish.

### Flow
1. The authenticated user enters one center application with a valid tenant context.
2. The user creates a Draft activity for that authorized center.
3. The user publishes the activity after the required localized fields are valid.
4. The user schedules a slot on the Published activity.
5. The API returns center-scoped catalog results; unauthorized or out-of-scope selectors follow the existing non-disclosing contract.

### Contract references
- Implements: `DIVE-BOOK-REQ-049..057`
- Decisions: `ADR-DIVE-001`, `ADR-DIVE-008`, `ADR-DIVE-014`
- Source: `SPEC-DIVE-BOOKING-001`
- Cross-cutting: applicable `MT-REQ-*` isolation checks remain separate

### Scope
- In: authenticated catalog API, persistence, lifecycle commands, pagination, center isolation, and tests.
- Out: catalog-management UI, public availability, booking creation, calendar, and last-seat proof.

### Surfaces and ownership
- UI/API/worker/database: `apps/api/**`, `packages/database/**`; no product UI in this increment.
- Authority remains in: API/domain/PostgreSQL authorization and tenant-scoped persistence.

### Verification
- Tests: catalog HTTP contract, time validation, migration/integration, and cross-tenant/center negative paths.
- Separate evidence required: No — tests are the proof. `SPIKE-DIVE-001` remains separate evidence for last-seat concurrency.

### Open questions
- None for the catalog walking skeleton; cursor pagination remains deferred by the owning contract.
```

The example is explanatory only. The referenced SPEC/ADR/TRACE in `main` remain authoritative.
