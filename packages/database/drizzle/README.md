# Product migrations

Generated with Drizzle Kit from `src/iam-schema.ts`. Applied by `pnpm db:migrate` as `dive_migration`.

- Do not rewrite an applied file. Add a new migration.
- RLS, grants, and `SECURITY DEFINER` functions in `0000_bright_wasp.sql` after the generated tables are reviewed SQL, not Kit output.
- `sql/0001_mt_spike_harness.sql` is test-only and must not be added here.
