ALTER TABLE "booking_app"."activities" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "booking_app"."activities" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "booking_app"."slots" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "booking_app"."slots" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY activities_isolation ON "booking_app"."activities"
  USING (tenant_id = current_setting('app.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);
--> statement-breakpoint
CREATE POLICY slots_isolation ON "booking_app"."slots"
  USING (tenant_id = current_setting('app.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);
--> statement-breakpoint
GRANT USAGE ON SCHEMA booking_app TO dive_app;
--> statement-breakpoint
REVOKE ALL ON booking_app.activities, booking_app.slots FROM dive_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE (name, description, default_capacity, status)
  ON booking_app.activities TO dive_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE (status)
  ON booking_app.slots TO dive_app;