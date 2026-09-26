ALTER TABLE "iam_app"."audit_records" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "iam_app"."outbox_events" ALTER COLUMN "created_at" SET DEFAULT now();