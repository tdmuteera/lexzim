-- Phase 7 P7-07: Petty cash, creditors (AP), trust reference, expense GL links

CREATE TABLE IF NOT EXISTS petty_cash_floats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
  opening_date timestamptz NOT NULL,
  amount_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  status text NOT NULL DEFAULT 'open',
  closed_at timestamptz,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS petty_cash_floats_firm_status_idx ON petty_cash_floats (firm_id, status);

CREATE TABLE IF NOT EXISTS petty_cash_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
  float_id uuid NOT NULL REFERENCES petty_cash_floats(id) ON DELETE CASCADE,
  movement_type text NOT NULL,
  amount_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  movement_date timestamptz NOT NULL,
  expense_gl_account_id uuid REFERENCES gl_accounts(id) ON DELETE SET NULL,
  reference text,
  notes text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS petty_cash_movements_firm_float_idx ON petty_cash_movements (firm_id, float_id);

CREATE TABLE IF NOT EXISTS creditors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
  name text NOT NULL,
  contact_email text,
  contact_phone text,
  default_expense_account_id uuid REFERENCES gl_accounts(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS creditors_firm_active_idx ON creditors (firm_id, is_active);

CREATE TABLE IF NOT EXISTS creditor_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
  creditor_id uuid NOT NULL REFERENCES creditors(id) ON DELETE CASCADE,
  invoice_date timestamptz NOT NULL,
  due_date timestamptz,
  amount_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  reference text,
  status text NOT NULL DEFAULT 'open',
  expense_account_id uuid REFERENCES gl_accounts(id) ON DELETE SET NULL,
  notes text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS creditor_invoices_firm_creditor_idx ON creditor_invoices (firm_id, creditor_id);
CREATE INDEX IF NOT EXISTS creditor_invoices_firm_due_idx ON creditor_invoices (firm_id, due_date);

CREATE TABLE IF NOT EXISTS creditor_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
  creditor_invoice_id uuid NOT NULL REFERENCES creditor_invoices(id) ON DELETE CASCADE,
  amount_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  paid_at timestamptz NOT NULL,
  payment_method text,
  reference text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS creditor_payments_firm_invoice_idx ON creditor_payments (firm_id, creditor_invoice_id);

ALTER TABLE firm_expenses
  ADD COLUMN IF NOT EXISTS gl_account_id uuid REFERENCES gl_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payment_source text NOT NULL DEFAULT 'cash',
  ADD COLUMN IF NOT EXISTS creditor_invoice_id uuid REFERENCES creditor_invoices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS budget_month text;

ALTER TABLE trust_ledger_entries
  ADD COLUMN IF NOT EXISTS reference_number text;

CREATE INDEX IF NOT EXISTS trust_ledger_firm_ref_idx ON trust_ledger_entries (firm_id, reference_number)
  WHERE reference_number IS NOT NULL;

ALTER TABLE disbursements
  ADD COLUMN IF NOT EXISTS paid_from text NOT NULL DEFAULT 'operating',
  ADD COLUMN IF NOT EXISTS gl_posted_at timestamptz;
