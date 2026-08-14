ALTER TABLE "calendar_events" ADD COLUMN IF NOT EXISTS "client_id" uuid REFERENCES "clients"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "calendar_events_client_id_idx" ON "calendar_events" ("firm_id", "client_id");
