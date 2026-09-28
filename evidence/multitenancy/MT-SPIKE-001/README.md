# MT-SPIKE-001 Isolation Evidence

This record keeps only the current application-audit findings. `MT-REQ-*`
results remain separate from product `DIVE-*` results; the complete scenario
matrix remains in `specs/multitenancy/MT-SPIKE-001-traceability.md`.

## Finding status

| Finding | Stable proof | Result |
|---|---|---|
| `DATA-01` — `tenant_contexts` is not forced RLS | `packages/database/test/integration/iam-api.integration.test.ts` | Compensating command controls are tested for authorized A/B issuance, cross-tenant rejection, direct app-role denial, and cross-identity resolution denial. Literal forced-RLS conformance remains unresolved. |
| `DATA-02` — runtime role was not verified | `packages/database/test/integration/roles.integration.test.ts` | Restricted runtime role and negative role conditions are tested. |
| `DATA-03` — rollback failure can return a bad client to the pool | `packages/database/test/integration/pooling.integration.test.ts` | Failed rollback destroys the client and the next checkout receives a different backend PID. |

## Known gaps

- `DATA-01` still requires an approved SDD decision before literal forced-RLS
	conformance can be claimed.
- HTTP/API boundary isolation, worker delivery, cache/files/search/export,
	deletion/restore, support access, and noisy-neighbor limits remain
	conditional or deferred under `MT-SPIKE-001`.
