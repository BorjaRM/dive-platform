CREATE SCHEMA "booking_app";
--> statement-breakpoint
CREATE TABLE "booking_app"."activities" (
	"id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"center_id" uuid NOT NULL,
	"name" jsonb NOT NULL,
	"description" jsonb,
	"default_capacity" integer,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activities_tenant_id_id_pk" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "activities_status_known" CHECK (status IN ('Draft', 'Published', 'Disabled')),
	CONSTRAINT "activities_default_capacity_positive" CHECK (default_capacity IS NULL OR default_capacity > 0)
);
--> statement-breakpoint
CREATE TABLE "booking_app"."slots" (
	"id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"center_id" uuid NOT NULL,
	"activity_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"duration_minutes" integer NOT NULL,
	"capacity" integer NOT NULL,
	"status" text NOT NULL,
	"time_zone" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "slots_tenant_id_id_pk" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "slots_tenant_id_id_activity_id_unique" UNIQUE("tenant_id","id","activity_id"),
	CONSTRAINT "slots_duration_minutes_positive" CHECK (duration_minutes > 0),
	CONSTRAINT "slots_capacity_positive" CHECK (capacity > 0),
	CONSTRAINT "slots_status_known" CHECK (status IN ('Available', 'Full', 'Closed', 'Cancelled')),
	CONSTRAINT "slots_time_zone_nonempty" CHECK (btrim(time_zone) <> '')
);
--> statement-breakpoint
ALTER TABLE "iam_app"."centers" ADD COLUMN "time_zone" text;--> statement-breakpoint
SELECT set_config('app.tenant_id', '00000000-0000-0000-0000-000000000000', true);
--> statement-breakpoint
ALTER TABLE "booking_app"."activities" ADD CONSTRAINT "activities_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "iam_app"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_app"."activities" ADD CONSTRAINT "activities_tenant_id_center_id_centers_tenant_id_id_fk" FOREIGN KEY ("tenant_id","center_id") REFERENCES "iam_app"."centers"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_app"."slots" ADD CONSTRAINT "slots_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "iam_app"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_app"."slots" ADD CONSTRAINT "slots_tenant_id_center_id_centers_tenant_id_id_fk" FOREIGN KEY ("tenant_id","center_id") REFERENCES "iam_app"."centers"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_app"."slots" ADD CONSTRAINT "slots_tenant_id_activity_id_activities_tenant_id_id_fk" FOREIGN KEY ("tenant_id","activity_id") REFERENCES "booking_app"."activities"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activities_tenant_center_created_id_idx" ON "booking_app"."activities" USING btree ("tenant_id","center_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "activities_tenant_center_status_created_id_idx" ON "booking_app"."activities" USING btree ("tenant_id","center_id","status","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "slots_tenant_center_activity_starts_id_idx" ON "booking_app"."slots" USING btree ("tenant_id","center_id","activity_id","starts_at","id");--> statement-breakpoint
CREATE INDEX "slots_tenant_center_activity_status_starts_id_idx" ON "booking_app"."slots" USING btree ("tenant_id","center_id","activity_id","status","starts_at","id");