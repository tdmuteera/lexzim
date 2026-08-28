-- Phase 10 P10-09: employee spine, next of kin, test-user flag, salary stubs.

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "is_test_user" boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN "users"."is_test_user" IS
  'When true, system login is not treated as an employee (no HR profile required).';

ALTER TABLE "hr_staff_profiles"
  ADD COLUMN IF NOT EXISTS "employee_number" text,
  ADD COLUMN IF NOT EXISTS "id_passport" text,
  ADD COLUMN IF NOT EXISTS "work_location" text,
  ADD COLUMN IF NOT EXISTS "job_category" text,
  ADD COLUMN IF NOT EXISTS "nok_full_name" text,
  ADD COLUMN IF NOT EXISTS "nok_relationship" text,
  ADD COLUMN IF NOT EXISTS "nok_phone1" text,
  ADD COLUMN IF NOT EXISTS "nok_phone2" text,
  ADD COLUMN IF NOT EXISTS "nok_address" text,
  ADD COLUMN IF NOT EXISTS "nok_email" text,
  ADD COLUMN IF NOT EXISTS "nok_occupation" text,
  ADD COLUMN IF NOT EXISTS "nok_declared_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "nok_received_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "nok_filed_by_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
  ADD COLUMN IF NOT EXISTS "gross_salary_cents" integer,
  ADD COLUMN IF NOT EXISTS "net_salary_cents" integer;

-- Seed NOK from legacy emergency contact when empty.
UPDATE "hr_staff_profiles"
SET
  "nok_full_name" = COALESCE("nok_full_name", "emergency_contact_name"),
  "nok_phone1" = COALESCE("nok_phone1", "emergency_contact_phone")
WHERE "emergency_contact_name" IS NOT NULL OR "emergency_contact_phone" IS NOT NULL;

-- Backfill HR profile stubs for active system logins that are not test users.
INSERT INTO "hr_staff_profiles" (
  "id",
  "firm_id",
  "user_id",
  "full_name",
  "email",
  "job_title",
  "is_active",
  "created_at",
  "updated_at"
)
SELECT
  gen_random_uuid(),
  u."firm_id",
  u."id",
  u."full_name",
  u."email",
  u."job_title",
  u."is_active",
  NOW(),
  NOW()
FROM "users" u
WHERE u."is_system_user" = true
  AND u."is_test_user" = false
  AND NOT EXISTS (
    SELECT 1 FROM "hr_staff_profiles" p
    WHERE p."firm_id" = u."firm_id" AND p."user_id" = u."id"
  );
