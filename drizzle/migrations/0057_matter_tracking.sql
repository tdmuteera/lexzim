-- Where a matter stands: a short note and the date it happens.
CREATE TABLE IF NOT EXISTS "matter_tracking_entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "firm_id" uuid NOT NULL,
  "matter_id" uuid NOT NULL,
  "summary" text NOT NULL,
  "happens_on" date NOT NULL,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "matter_tracking_entries" ADD CONSTRAINT "matter_tracking_entries_firm_id_fk"
    FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "matter_tracking_entries" ADD CONSTRAINT "matter_tracking_entries_matter_id_fk"
    FOREIGN KEY ("matter_id") REFERENCES "public"."matters"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "matter_tracking_entries" ADD CONSTRAINT "matter_tracking_entries_created_by_fk"
    FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "matter_tracking_firm_id_idx" ON "matter_tracking_entries" ("firm_id");
CREATE INDEX IF NOT EXISTS "matter_tracking_matter_created_idx" ON "matter_tracking_entries" ("matter_id", "created_at");
