# ADR-DIVE-003 — Monorepo workspace layout and TypeScript tooling

- **Status:** Ready to start
- **Version:** 0.2
- **Decision date:** 2026-09-26

## Context

ADR-DIVE-002 chose a TypeScript monorepo with pnpm workspaces, Turborepo, and Biome. The first scaffold mixed `create-turbo`, `create-next-app`, and `nest new` defaults. That produced two incompatible TypeScript bases, Turbo tasks that did not match package scripts, nested lockfiles, demo UI from the starter, and mixed package names (`@repo/*` vs `@dive-center/*`).

Workspace packages still need their own `package.json` and a thin `tsconfig.json`. The defect was duplicated compiler options and tasks, not the existence of per-package manifests.

## Decision

- **One TypeScript source:** `@dive-center/typescript-config`. Root `tsconfig.json` only extends it and sets `"files": []` so a root `tsc` does not compile the tree.
- **Per-package `tsconfig.json`:** extend the shared preset (`node-library`, `nestjs`, `nextjs`, or `react-library`) and override only `rootDir`, `outDir`, `include`, and app-specific `paths`/`types`.
- **Per-package `package.json`:** required for pnpm/Turbo. Scope every app and library as `@dive-center/<name>`.
- **Library emit:** internal packages compile to `dist/` so Nest can import them with NodeNext. Do not add `workspace:*` edges until a package actually imports another.
- **Turbo tasks:** `build`, `dev`, `typecheck`, `test`. `build` caches `dist/**` and `.next/**`. Biome runs at the repository root (`pnpm lint`, `pnpm format`, `pnpm check:fix`), not as a per-package Turbo task.
- **TypeScript version:** `6.0.3` via the pnpm catalog.
- **Empty packages:** keep the current `@dive-center/*` shells as reserved boundaries. Do not add more empty packages. Do not collapse domain/application/contracts/database. Identity, email, i18n, observability, config, testing, and ui stay stubs until they have a real port or consumer.
- **UI kit:** `@dive-center/ui` is a stub. Starter demo components are removed. Recreate shared UI when dashboard and widget actually share components.
- **Lint/format:** Biome only. No ESLint/Prettier config packages.

## Version provenance

- **Documented:** `6.0.3` is the effective TypeScript version in the pnpm
	catalog and lockfile. This ADR now reflects the existing workspace
	configuration; no additional compiler policy or override is introduced.

## Consequences

- `pnpm build`, `pnpm typecheck`, and `pnpm dev` use the same script names in every workspace package that implements them.
- Apps can depend on compiled libraries without ad-hoc path mapping.
- Adding a package later means: manifest, thin tsconfig, shared preset, and a consumer. No second compiler policy.
- Nested `apps/web/pnpm-lock.yaml` / `pnpm-workspace.yaml` are forbidden.

## Alternatives considered

- Single root `tsconfig` for the whole tree: rejected; Next, Nest, and Node libraries need different `module`/`jsx`/decorator settings.
- Source-only exports without `dist/`: simpler for Next, but Nest's `tsc` build would not compile workspace TypeScript outside `apps/api`.
- Deleting empty packages in this increment: deferred. The reserved names match the intended hexagonal cut; deleting them now would churn TRACE/docs without shrinking runtime surface.

## Acceptance criteria

- One shared TypeScript preset is extended by every app and library
- Turbo `build` caches both Next and `dist/` outputs
- `pnpm lint` and `pnpm typecheck` are the documented quality commands
- No nested package manager lockfile under `apps/`
- Package names are consistently `@dive-center/*`
