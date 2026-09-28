# SPIKE-DIVE-004 — Results

- **Execution status:** Not executed
- **Decision:** Pending
- **Date:** Pending
- **Commit:** Pending
- **Clerk SDK version:** Pending
- **Environment:** Pending Clerk Development instance; no production data
- **Commands:** Pending

## Covered requirements

Pending execution.

## Safe observations

Pending execution. Do not record email addresses, passwords, secret keys, raw tickets, invitation URLs, bearer tokens, cookies, or unredacted provider responses.

## `ignoreExisting`

Pending execution. The documented baseline is not execution evidence:

- `false` defaults to rejecting an email with an existing invitation or application user;
- `true` permits invitation creation despite either condition.

## Identity and session matrix

| Identity/session state | Observed Clerk flow | Ticket consumed | Safe outcome |
|---|---|---|---|
| New identity, no session | Pending | Pending | Pending |
| Existing identity, no session | Pending | Pending | Pending |
| Existing identity, matching session | Pending | Pending | Pending |
| Different active session | Pending | Pending | Pending |

## Ticket and redirect handling

Pending execution.

## Reusable assets

Pending execution. List only committed harness/test/documentation paths.

## Limitations

Pending execution.

## Recommendation

No recommendation has been reached. This placeholder must not be interpreted as provider evidence, onboarding approval, or permission to create implementation increments.
