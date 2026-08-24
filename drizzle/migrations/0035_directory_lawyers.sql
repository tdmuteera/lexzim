-- Directory lawyers (no login) + lawyer flag for responsible-attorney pickers.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_system_user" boolean NOT NULL DEFAULT true;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_lawyer" boolean NOT NULL DEFAULT false;

-- Practice roles are lawyers by default.
UPDATE users u
SET is_lawyer = true
FROM roles r
WHERE u.role_id = r.id
  AND r.code IN ('managing_partner', 'senior_associate', 'junior_associate');

-- Anyone already assigned as responsible lawyer stays selectable.
UPDATE users
SET is_lawyer = true
WHERE id IN (
  SELECT responsible_lawyer_id FROM clients WHERE responsible_lawyer_id IS NOT NULL
  UNION
  SELECT responsible_lawyer_id FROM matters WHERE responsible_lawyer_id IS NOT NULL
);

CREATE INDEX IF NOT EXISTS "users_firm_lawyer_idx"
  ON "users" ("firm_id", "is_lawyer", "is_active");
