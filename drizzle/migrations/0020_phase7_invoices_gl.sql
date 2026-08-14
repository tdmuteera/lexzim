-- Phase 7 P7-06: Invoice enhancements, receipt numbers, GL links

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS discount_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_pct real,
  ADD COLUMN IF NOT EXISTS retainer_applied_cents integer NOT NULL DEFAULT 0;

ALTER TABLE invoice_lines
  ADD COLUMN IF NOT EXISTS firm_service_id uuid REFERENCES firm_services(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS revenue_gl_account_id uuid REFERENCES gl_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS invoice_lines_firm_service_idx ON invoice_lines (firm_service_id);

ALTER TABLE fee_payments
  ADD COLUMN IF NOT EXISTS receipt_number text;

CREATE UNIQUE INDEX IF NOT EXISTS fee_payments_firm_receipt_uid
  ON fee_payments (firm_id, receipt_number)
  WHERE receipt_number IS NOT NULL;
