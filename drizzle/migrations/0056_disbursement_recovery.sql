-- Recover client costs already paid by the firm into the disbursement account or the float.
ALTER TABLE "disbursements"
  ADD COLUMN IF NOT EXISTS "recovered_cents" integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "disbursement_recoveries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "firm_id" uuid NOT NULL,
  "disbursement_id" uuid NOT NULL,
  "intake_id" uuid NOT NULL,
  "allocation_line_id" uuid,
  "amount_cents" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "disbursement_recoveries" ADD CONSTRAINT "disbursement_recoveries_firm_id_fk"
    FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "disbursement_recoveries" ADD CONSTRAINT "disbursement_recoveries_disbursement_id_fk"
    FOREIGN KEY ("disbursement_id") REFERENCES "public"."disbursements"("id") ON DELETE restrict;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "disbursement_recoveries" ADD CONSTRAINT "disbursement_recoveries_intake_id_fk"
    FOREIGN KEY ("intake_id") REFERENCES "public"."finance_payment_intakes"("id") ON DELETE restrict;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "disbursement_recoveries" ADD CONSTRAINT "disbursement_recoveries_allocation_line_id_fk"
    FOREIGN KEY ("allocation_line_id") REFERENCES "public"."finance_payment_allocation_lines"("id") ON DELETE restrict;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "disbursement_recoveries_firm_id_idx" ON "disbursement_recoveries" ("firm_id");
CREATE INDEX IF NOT EXISTS "disbursement_recoveries_intake_id_idx" ON "disbursement_recoveries" ("intake_id");
CREATE INDEX IF NOT EXISTS "disbursement_recoveries_disbursement_id_idx" ON "disbursement_recoveries" ("disbursement_id");
