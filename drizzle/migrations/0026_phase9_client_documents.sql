-- Client file uploads may exist without a matter (P9 documents).

ALTER TABLE "documents" ALTER COLUMN "matter_id" DROP NOT NULL;
CREATE INDEX IF NOT EXISTS "documents_firm_client_idx" ON "documents" ("firm_id", "client_id");
