-- Per-person module ticks (P9-05). Backfill from the role matrix so menus do not drop.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "job_title" text;

CREATE TABLE IF NOT EXISTS "user_permissions" (
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "permission_id" uuid NOT NULL REFERENCES "permissions"("id") ON DELETE CASCADE,
  "firm_id" uuid NOT NULL REFERENCES "firms"("id") ON DELETE CASCADE,
  PRIMARY KEY ("user_id", "permission_id")
);

CREATE INDEX IF NOT EXISTS "user_permissions_firm_user_idx"
  ON "user_permissions" ("firm_id", "user_id");

INSERT INTO "user_permissions" ("user_id", "permission_id", "firm_id")
SELECT u.id, rp.permission_id, u.firm_id
FROM "users" u
INNER JOIN "role_permissions" rp ON rp.role_id = u.role_id
ON CONFLICT DO NOTHING;
