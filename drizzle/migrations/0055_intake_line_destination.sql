-- Split receipts: each allocation line may go to its own destination.
-- Null means the line uses the intake's destination (all rows created before this migration).
ALTER TABLE "finance_payment_allocation_lines"
  ADD COLUMN IF NOT EXISTS "destination" text,
  ADD COLUMN IF NOT EXISTS "trust_account_id" uuid REFERENCES "trust_accounts"("id") ON DELETE RESTRICT;
