ALTER TABLE "booking_app"."activities" ADD COLUMN "category_code" text;--> statement-breakpoint
ALTER TABLE "booking_app"."activities" ADD COLUMN "other_description" jsonb;--> statement-breakpoint
ALTER TABLE "booking_app"."activities" ADD CONSTRAINT "activities_category_code_known" CHECK (category_code IS NULL OR category_code IN ('introductory', 'guided_dive', 'course', 'snorkel', 'freediving', 'other'));--> statement-breakpoint
ALTER TABLE "booking_app"."activities" ADD CONSTRAINT "activities_other_description_matches_category" CHECK ((category_code IS NOT NULL AND category_code = 'other' AND COALESCE(jsonb_typeof(other_description) = 'object' AND jsonb_typeof(other_description -> base_locale) = 'string', false)) OR (category_code IS DISTINCT FROM 'other' AND other_description IS NULL));--> statement-breakpoint
GRANT UPDATE(category_code) ON TABLE booking_app.activities TO dive_app;--> statement-breakpoint
GRANT UPDATE(other_description) ON TABLE booking_app.activities TO dive_app;
