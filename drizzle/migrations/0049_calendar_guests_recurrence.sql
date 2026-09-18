-- Calendar guests (external / client notify), recurrence, postpone tracking.
ALTER TABLE "calendar_events" ADD COLUMN IF NOT EXISTS "recurrence_rule" text;
ALTER TABLE "calendar_events" ADD COLUMN IF NOT EXISTS "recurrence_until" timestamptz;
ALTER TABLE "calendar_events" ADD COLUMN IF NOT EXISTS "series_id" uuid;
ALTER TABLE "calendar_events" ADD COLUMN IF NOT EXISTS "postponed_from" timestamptz;
ALTER TABLE "calendar_events" ADD COLUMN IF NOT EXISTS "notify_client" boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "calendar_events_firm_series_idx"
  ON "calendar_events" ("firm_id", "series_id");

CREATE TABLE IF NOT EXISTS "calendar_event_guests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "firm_id" uuid NOT NULL,
  "event_id" uuid NOT NULL,
  "email" text NOT NULL,
  "display_name" text,
  "source" text NOT NULL DEFAULT 'external',
  "notify" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "calendar_event_guests_firm_id_firms_id_fk"
    FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "calendar_event_guests_event_id_calendar_events_id_fk"
    FOREIGN KEY ("event_id") REFERENCES "public"."calendar_events"("id") ON DELETE cascade ON UPDATE no action
);

CREATE UNIQUE INDEX IF NOT EXISTS "calendar_event_guests_event_email_uidx"
  ON "calendar_event_guests" ("event_id", lower("email"));
CREATE INDEX IF NOT EXISTS "calendar_event_guests_firm_event_idx"
  ON "calendar_event_guests" ("firm_id", "event_id");
