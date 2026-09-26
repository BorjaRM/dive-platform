---
name: Traceability-first implementation
when_to_use: When implementing any requirement IDs from TRACE.
---

## Inputs
- Requirement IDs (e.g. `DIVE-BOOK-REQ-025..032`).
- Target SPEC and ADR(s).

## Procedure
1. Locate the exact requirement text in `specs/**`.
2. Identify the smallest implementation slice that satisfies the acceptance criteria.
3. Add tests first (or in the same PR) mapping directly to the requirement IDs.
4. Implement. Keep commits aligned to traceable units.
5. Update PR description with:
   - Implements: <IDs>
   - Decision: <ADR>
   - Tests: <paths/commands>
   - Evidence: <evidence/> (if applicable)
   - Traceability: TRACE-DIVE-MVP-001

## Performance considerations
- Identify the hot path (DB/API/worker/web).
- Add at least one measurable check when feasible (timing, query plan note, contention test).
