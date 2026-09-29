-- Finance depth: source links, reversal relationships and idempotency on money movements.
-- gl_journal_entries.source_id carried composite keys (e.g. "disb-<uuid>") that do not fit uuid.
ALTER TABLE "gl_journal_entries" ALTER COLUMN "source_id" TYPE text USING "source_id"::text;

ALTER TABLE "trust_ledger_entries"
  ADD COLUMN IF NOT EXISTS "source_type" text,
  ADD COLUMN IF NOT EXISTS "source_id" text,
  ADD COLUMN IF NOT EXISTS "invoice_id" uuid,
  ADD COLUMN IF NOT EXISTS "requisition_id" uuid,
  ADD COLUMN IF NOT EXISTS "intake_id" uuid,
  ADD COLUMN IF NOT EXISTS "transfer_group_id" uuid,
  ADD COLUMN IF NOT EXISTS "counterparty_client_id" uuid,
  ADD COLUMN IF NOT EXISTS "reversal_of_id" uuid,
  ADD COLUMN IF NOT EXISTS "reversed_by_id" uuid,
  ADD COLUMN IF NOT EXISTS "reversal_reason" text,
  ADD COLUMN IF NOT EXISTS "authorised_by" uuid,
  ADD COLUMN IF NOT EXISTS "authorisation_note" text,
  ADD COLUMN IF NOT EXISTS "idempotency_key" text;

DO $$ BEGIN
  ALTER TABLE "trust_ledger_entries" ADD CONSTRAINT "trust_ledger_invoice_id_fk"
    FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "trust_ledger_entries" ADD CONSTRAINT "trust_ledger_requisition_id_fk"
    FOREIGN KEY ("requisition_id") REFERENCES "public"."finance_requisitions"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "trust_ledger_entries" ADD CONSTRAINT "trust_ledger_intake_id_fk"
    FOREIGN KEY ("intake_id") REFERENCES "public"."finance_payment_intakes"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "trust_ledger_entries" ADD CONSTRAINT "trust_ledger_counterparty_client_fk"
    FOREIGN KEY ("counterparty_client_id") REFERENCES "public"."clients"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "trust_ledger_entries" ADD CONSTRAINT "trust_ledger_reversal_of_fk"
    FOREIGN KEY ("reversal_of_id") REFERENCES "public"."trust_ledger_entries"("id") ON DELETE restrict;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "trust_ledger_entries" ADD CONSTRAINT "trust_ledger_reversed_by_fk"
    FOREIGN KEY ("reversed_by_id") REFERENCES "public"."trust_ledger_entries"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "trust_ledger_entries" ADD CONSTRAINT "trust_ledger_authorised_by_fk"
    FOREIGN KEY ("authorised_by") REFERENCES "public"."users"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "trust_ledger_client_idx" ON "trust_ledger_entries" ("firm_id", "client_id");
CREATE INDEX IF NOT EXISTS "trust_ledger_source_idx" ON "trust_ledger_entries" ("firm_id", "source_type", "source_id");
CREATE INDEX IF NOT EXISTS "trust_ledger_transfer_group_idx" ON "trust_ledger_entries" ("transfer_group_id");
CREATE UNIQUE INDEX IF NOT EXISTS "trust_ledger_reversal_of_uid"
  ON "trust_ledger_entries" ("reversal_of_id") WHERE "reversal_of_id" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "trust_ledger_firm_idempotency_uid"
  ON "trust_ledger_entries" ("firm_id", "idempotency_key") WHERE "idempotency_key" IS NOT NULL;

ALTER TABLE "fee_payments"
  ADD COLUMN IF NOT EXISTS "client_id" uuid,
  ADD COLUMN IF NOT EXISTS "matter_id" uuid,
  ADD COLUMN IF NOT EXISTS "intake_id" uuid,
  ADD COLUMN IF NOT EXISTS "reversal_of_id" uuid,
  ADD COLUMN IF NOT EXISTS "reversed_by_id" uuid,
  ADD COLUMN IF NOT EXISTS "reversal_reason" text,
  ADD COLUMN IF NOT EXISTS "idempotency_key" text;

DO $$ BEGIN
  ALTER TABLE "fee_payments" ADD CONSTRAINT "fee_payments_client_id_fk"
    FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "fee_payments" ADD CONSTRAINT "fee_payments_matter_id_fk"
    FOREIGN KEY ("matter_id") REFERENCES "public"."matters"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "fee_payments" ADD CONSTRAINT "fee_payments_intake_id_fk"
    FOREIGN KEY ("intake_id") REFERENCES "public"."finance_payment_intakes"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "fee_payments" ADD CONSTRAINT "fee_payments_reversal_of_fk"
    FOREIGN KEY ("reversal_of_id") REFERENCES "public"."fee_payments"("id") ON DELETE restrict;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "fee_payments" ADD CONSTRAINT "fee_payments_reversed_by_fk"
    FOREIGN KEY ("reversed_by_id") REFERENCES "public"."fee_payments"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "fee_payments_client_idx" ON "fee_payments" ("firm_id", "client_id");
CREATE UNIQUE INDEX IF NOT EXISTS "fee_payments_reversal_of_uid"
  ON "fee_payments" ("reversal_of_id") WHERE "reversal_of_id" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "fee_payments_firm_idempotency_uid"
  ON "fee_payments" ("firm_id", "idempotency_key") WHERE "idempotency_key" IS NOT NULL;

ALTER TABLE "finance_requisitions"
  ADD COLUMN IF NOT EXISTS "trust_entry_id" uuid,
  ADD COLUMN IF NOT EXISTS "reversed_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "reversed_by" uuid,
  ADD COLUMN IF NOT EXISTS "reversal_reason" text;

DO $$ BEGIN
  ALTER TABLE "finance_requisitions" ADD CONSTRAINT "finance_requisitions_trust_entry_fk"
    FOREIGN KEY ("trust_entry_id") REFERENCES "public"."trust_ledger_entries"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "finance_requisitions" ADD CONSTRAINT "finance_requisitions_reversed_by_fk"
    FOREIGN KEY ("reversed_by") REFERENCES "public"."users"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "finance_payment_intakes"
  ADD COLUMN IF NOT EXISTS "reversed_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "reversed_by" uuid,
  ADD COLUMN IF NOT EXISTS "reversal_reason" text;

DO $$ BEGIN
  ALTER TABLE "finance_payment_intakes" ADD CONSTRAINT "finance_payment_intakes_reversed_by_fk"
    FOREIGN KEY ("reversed_by") REFERENCES "public"."users"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "disbursements"
  ADD COLUMN IF NOT EXISTS "trust_entry_id" uuid,
  ADD COLUMN IF NOT EXISTS "requisition_id" uuid;

DO $$ BEGIN
  ALTER TABLE "disbursements" ADD CONSTRAINT "disbursements_trust_entry_fk"
    FOREIGN KEY ("trust_entry_id") REFERENCES "public"."trust_ledger_entries"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
