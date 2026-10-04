# Product migrations

Generated with Drizzle Kit from `src/product-schema.ts`. Applied by `pnpm db:migrate` as `dive_migration`.

- `0000_baseline.sql` is the pre-release product baseline. It includes the generated schema plus reviewed PostgreSQL-specific RLS, grants, triggers, and `SECURITY DEFINER` functions.
- **Documented (product-owner authorization, 2026-10-04):** during pre-release development, the baseline may be revised and consolidated while no shared or published database depends on its applied history. Once a shared or published database depends on it, treat it as immutable and add new migrations.
- The replaced history has no supported upgrade path. Recreate disposable databases created with an earlier baseline or journal; do not apply this baseline over them.
- Product migrations are forward-only. Roll back application code by deploying a compatible earlier version; for the center-entry `status` addition, that version ignores the additive column. Do not add a destructive down migration that removes lifecycle state or audit history.
- Keep the latest snapshot named by `meta/_journal.json`, the journal itself, and
	`src/product-schema.ts` aligned before generating the next migration.
- `sql/0001_mt_spike_harness.sql` is test-only and must not be added here.
