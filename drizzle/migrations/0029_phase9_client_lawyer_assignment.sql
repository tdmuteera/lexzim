-- Client-level lawyer assignment (P9 follow-up).

ALTER TABLE "clients"
ADD COLUMN IF NOT EXISTS "responsible_lawyer_id" uuid REFERENCES "users"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "clients_responsible_lawyer_idx"
ON "clients" ("responsible_lawyer_id");
