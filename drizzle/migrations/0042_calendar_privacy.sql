-- P10-12: Calendar privacy (private | firm | people), shares, per-user colour.
-- Existing diary rows are backfilled to firm so current visibility is preserved;
-- new events default to private.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "calendar_color" text;

ALTER TABLE "calendar_events" ADD COLUMN IF NOT EXISTS "visibility" text;

UPDATE "calendar_events" SET "visibility" = 'firm' WHERE "visibility" IS NULL;

ALTER TABLE "calendar_events" ALTER COLUMN "visibility" SET DEFAULT 'private';
ALTER TABLE "calendar_events" ALTER COLUMN "visibility" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "calendar_events_firm_visibility_idx"
  ON "calendar_events" ("firm_id", "visibility");

CREATE TABLE IF NOT EXISTS "calendar_event_shares" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "firm_id" uuid NOT NULL,
  "event_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "calendar_event_shares_firm_id_firms_id_fk"
    FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "calendar_event_shares_event_id_calendar_events_id_fk"
    FOREIGN KEY ("event_id") REFERENCES "public"."calendar_events"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "calendar_event_shares_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
);

CREATE UNIQUE INDEX IF NOT EXISTS "calendar_event_shares_event_user_uidx"
  ON "calendar_event_shares" ("event_id", "user_id");
CREATE INDEX IF NOT EXISTS "calendar_event_shares_firm_user_idx"
  ON "calendar_event_shares" ("firm_id", "user_id");
CREATE INDEX IF NOT EXISTS "calendar_event_shares_event_idx"
  ON "calendar_event_shares" ("event_id");
