# Application technical audit — 2026-09-27

- **Scope:** `apps/api`, `apps/web`, `apps/worker`, packages, PostgreSQL, CI, tests, configuration, and SDD governance.
- **Nature:** dated, non-normative audit. Current product and architecture authority remains in `specs/`.
- **Initial result:** no critical vulnerability or demonstrated active cross-tenant leak; 8 high, 7 medium, and 1 low finding.

This record preserves the initial findings, current disposition, stable proof, and residual gaps. Detailed implementation behavior belongs to code and tests; completed remediation procedures remain available in Git history and the merged pull request.

## Findings and current disposition

| ID | Initial severity | Current disposition | Stable proof | Residual gap |
|---|---|---|---|---|
| `SEC-01` | High | Corrected: CI is read-only and does not commit or push | `.github/workflows/ci.yml` | Validate repository/branch settings outside the repository separately when needed |
| `DATA-01` | High | Open with compensating controls: `iam_app.tenant_contexts` still uses `NO FORCE ROW LEVEL SECURITY` | `packages/database/test/integration/iam-api.integration.test.ts` | Approve the table classification/threat model or redesign for literal `MT-REQ-004` conformance |
| `DATA-02` | High | Corrected: runtime role is checked and unsafe roles fail startup | `packages/database/test/integration/roles.integration.test.ts` | None for the implemented preflight |
| `REL-01` | High | Corrected for configurable PostgreSQL pool/statement/lock/idle deadlines | `packages/database/test/integration/operability.integration.test.ts` | Approve environment values and add pool wait/use/saturation metrics before production |
| `REL-02` | High | Corrected at the caller boundary: provider failures are bounded and 401/503 remain distinct | `packages/identity/src/clerk.spec.ts`; `apps/api/src/iam/iam.error-handling.spec.ts`; dashboard tests | Clerk SDK transport cancellation and production/provider-outage evidence remain open |
| `SEC-02` | High | Corrected for headers, exact CORS, conditional Swagger, and configured IP limiting | `apps/api/src/common/security/http-hardening.spec.ts` | Identity/tenant rate-limit policy still requires an approved decision |
| `QA-01` | High | Corrected: CI builds deployable applications | `.github/workflows/ci.yml` | Production deployment validation is outside this repository state |
| `OBS-01` | High | Corrected: vendor-neutral observability boundary and request correlation exist | `packages/observability/src/index.spec.ts`; `apps/api/src/common/observability/correlation-id.middleware.spec.ts` | End-to-end production telemetry is not demonstrated |
| `DATA-03` | Medium | Corrected: rollback failure destroys the pooled client | `packages/database/test/integration/pooling.integration.test.ts` | None for the tested transaction lifecycle |
| `SEC-03` | Medium | Partially corrected: secret scanning, dependency signal, SBOM, and read-only security workflow exist | `.github/workflows/security.yml` | CodeQL/dependency review remain unavailable under the current private-repository plan |
| `SEC-04` | Medium | Corrected for deterministic production configuration guards | `apps/api/src/common/config/environment.spec.ts`; `tenant-context.crypto.spec.ts` | No production deployment or secret-manager validation performed |
| `PERF-01` | Medium | Corrected for unsafe offsets and list-order indexes | catalog validation and migration integration tests | Representative `EXPLAIN (ANALYZE, BUFFERS)` and deep-page measurement remain open |
| `QA-02` | Medium | Corrected: API test discovery is limited to owned sources | `apps/api/vitest.config.ts` | None for discovery scope |
| `GOV-01` | Medium | Corrected: SPEC, ADR, and TRACE governance have separate validators and fixtures | `scripts/validate-spec-governance.test.mjs` | None for current artifact discovery |
| `ARCH-01` | Medium | Deferred by a `Proposed` decision: the temporary dashboard component will be replaced rather than refactored | this audit record | Replacement design and timing require their own approved decision |
| `DOC-01` | Low | Corrected: ADR and workspace agree on TypeScript `6.0.3` | `specs/architecture/adrs/ADR-DIVE-003.md`; `pnpm-workspace.yaml` | None |

## Historical validation

The initial audit recorded:

- `pnpm check` passing before the audited remediation series;
- a successful build with Node from `.nvmrc`;
- workspace tests passing, with the duplicated API discovery later corrected by `QA-02`;
- `pnpm audit --prod --audit-level high` reporting no known production-dependency vulnerability;
- no integration run during the initial audit because it would mutate the configured database.

The remediation record subsequently observed focused passing checks for:

- API HTTP/configuration controls;
- API and database typechecks;
- identity and webhook behavior;
- IAM operational error mapping;
- dashboard tenant-context behavior;
- PostgreSQL operability, migrations, runtime roles, pooling, and `DATA-01` compensating controls;
- SDD governance fixtures and validation.

Exact commands and run results belong to the remediation pull request and executable test suites. This audit does not claim current CI, production, browser automation, load, or external-provider results.

## Residual blockers and no-go gates

The following remain open and must not be inferred as resolved from passing local tests:

1. `DATA-01` literal forced-RLS conformance or an explicitly approved exception.
2. Production values and metrics for PostgreSQL operational limits.
3. Identity/tenant rate-limit decisions.
4. Clerk transport cancellation plus remaining real lifecycle/provider-failure evidence.
5. Representative catalog query-plan and deep-page measurements.
6. Production secret-manager, deployment, telemetry, backup/PITR, and restore validation.
7. `MT-COND-WORKER-001` before any real external outbox effect.
8. Privacy, support access, public capabilities, and other partial areas tracked by `TRACE-DIVE-MVP-001`.

## Source ownership

- Requirements and decisions: `specs/`.
- Coverage relationships and partial/open status: `specs/traceability/TRACE-DIVE-MVP-001.md`.
- Reproducible proof: tests and versioned workflows.
- Remaining IAM work: `docs/architecture/iam-vertical-follow-ups.md` until repository issues are available for migration.
- External Clerk sandbox result: `evidence/releases/iam-phase-2-revocation.md`.

Do not add per-finding evidence files for reproducible checks. Add separate evidence only for a new external, measured, manual, regulatory, or otherwise time-bound observation that tests cannot preserve.
