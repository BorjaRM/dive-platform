# Implementation increment workflow

This is the single workflow for product implementation work.

## Required flow

```text
Ready-to-start SPEC/ADR
  → implementation issue with one Development Brief
  → implementation branch
  → pull request that links and closes the issue
  → tests and concise Validation in the PR
  → merge
  → update TRACE or Notion only when their visible relationships/status changed
```

## One owner for each kind of information

| Information | Owner |
|---|---|
| Product behavior and technical contract | SPEC / ADR |
| Short end-to-end implementation flow and slice boundaries | Implementation issue |
| Code changes, tests run, observed results, risk, and rollback | Pull request |
| Coverage relationships | TRACE, only when they change |
| Visible navigation and status | Notion, only when they change |

The Development Brief lives **exactly once**, in the implementation issue created from `.github/ISSUE_TEMPLATE/implementation-increment.md`.

The pull request must use `Closes #<issue>` and must not copy the brief. It records implementation differences only. If implementation discovers a missing or contradictory decision, stop, record the open question in the issue, and use SDD Writer for the smallest SPEC/ADR change.

Documentation-only, normative-only, spike/evidence-only, and maintenance changes do not use an implementation issue unless they also deliver product behavior.

## Development Brief fields

The implementation issue contains:

- user story;
- short end-to-end flow;
- requirement, SPEC, ADR, and cross-cutting references;
- included and excluded scope;
- expected surfaces and authority boundary;
- planned tests and whether separate evidence is required;
- open questions.

It links existing technical criteria instead of repeating them.

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

### Verification plan
- Tests: catalog HTTP contract, time validation, migration/integration, and cross-tenant/center negative paths.
- Separate evidence required: No — tests are the proof. `SPIKE-DIVE-001` remains separate evidence for last-seat concurrency.

### Open questions
- None for the catalog walking skeleton; cursor pagination remains deferred by the owning contract.
```

The example is explanatory only. The referenced SPEC/ADR/TRACE in `main` remain authoritative.
