# DOC-01 TypeScript version

## Correction

The effective workspace compiler version is `6.0.3`, supplied by the pnpm
catalog and resolved in `pnpm-lock.yaml`. ADR-DIVE-003 now documents that
existing configuration and no longer claims a `pnpm.overrides` entry that does
not exist. The repository README is aligned as well.

This correction changes documentation only; the package catalog, lockfile, and
installed dependency graph were not changed.

## Executable evidence

```text
pnpm exec tsc --version
pnpm why typescript
pnpm test:spec-governance
git diff --check
```
