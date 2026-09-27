ALTER TABLE "booking_app"."activities" ADD CONSTRAINT "activities_tenant_center_id_unique" UNIQUE("tenant_id","center_id","id");--> statement-breakpoint
ALTER TABLE "booking_app"."slots" DROP CONSTRAINT "slots_tenant_id_id_activity_id_unique";--> statement-breakpoint
ALTER TABLE "booking_app"."slots" DROP CONSTRAINT "slots_time_zone_nonempty";--> statement-breakpoint
ALTER TABLE "booking_app"."slots" DROP CONSTRAINT "slots_tenant_id_activity_id_activities_tenant_id_id_fk";
--> statement-breakpoint
DROP INDEX "booking_app"."activities_tenant_center_created_id_idx";--> statement-breakpoint
DROP INDEX "booking_app"."activities_tenant_center_status_created_id_idx";--> statement-breakpoint
DROP INDEX "booking_app"."slots_tenant_center_activity_starts_id_idx";--> statement-breakpoint
DROP INDEX "booking_app"."slots_tenant_center_activity_status_starts_id_idx";--> statement-breakpoint
ALTER TABLE "booking_app"."slots" ADD CONSTRAINT "slots_tenant_id_center_id_activity_id_activities_tenant_id_center_id_id_fk" FOREIGN KEY ("tenant_id","center_id","activity_id") REFERENCES "booking_app"."activities"("tenant_id","center_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activities_center_status_created_id_idx" ON "booking_app"."activities" USING btree ("tenant_id","center_id","status","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "slots_activity_status_starts_id_idx" ON "booking_app"."slots" USING btree ("tenant_id","center_id","activity_id","status","starts_at","id");--> statement-breakpoint
ALTER TABLE "booking_app"."slots" DROP COLUMN "time_zone";--> statement-breakpoint