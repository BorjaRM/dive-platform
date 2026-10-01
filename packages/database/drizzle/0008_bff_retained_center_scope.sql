ALTER POLICY center_entries_isolation ON iam_app.center_entries
USING (
  tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  OR (
    current_user = 'dive_migration'
    AND center_key = current_setting('app.center_entry_key', true)
  )
)
WITH CHECK (
  tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
);
--> statement-breakpoint
GRANT SELECT ON iam_app.center_entries TO dive_app;