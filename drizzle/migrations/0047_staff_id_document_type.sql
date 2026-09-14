-- Distinguish national ID vs passport on HR staff profiles.
ALTER TABLE "hr_staff_profiles"
  ADD COLUMN IF NOT EXISTS "id_document_type" text;
