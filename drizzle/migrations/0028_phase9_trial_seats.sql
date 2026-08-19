-- Trial login seats: 10 (was 3). Raise existing trial rows that were still on the old cap.

ALTER TABLE "firm_licences" ALTER COLUMN "seats" SET DEFAULT 10;

UPDATE "firm_licences"
SET "seats" = 10, "updated_at" = now()
WHERE "edition" = 'trial' AND "seats" < 10;
