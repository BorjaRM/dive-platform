# Product migrations

Generated with Drizzle Kit from `src/product-schema.ts`. Applied by `pnpm db:migrate` as `dive_migration`.

- `0000_baseline.sql` is the pre-release product baseline. It includes the generated schema plus reviewed PostgreSQL-specific RLS, grants, triggers, and `SECURITY DEFINER` functions.
- The baseline replaced the disposable migration history after confirmation that no database or data needed an upgrade path. Treat it as immutable from this point and add new migrations.
- Keep the latest snapshot named by `meta/_journal.json`, the journal itself, and
	`src/product-schema.ts` aligned before generating the next migration.
- `sql/0001_mt_spike_harness.sql` is test-only and must not be added here.
