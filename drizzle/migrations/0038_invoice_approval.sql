-- Phase 10 P10-07: invoice approval workflow (AR status stays draft|sent|paid|overdue|void).
-- GL continues to post only on Mark sent, not on Approve.

ALTER TABLE "invoices"
  ADD COLUMN IF NOT EXISTS "approval_state" text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS "submitted_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "submitted_by" uuid REFERENCES "users"("id") ON DELETE set null,
  ADD COLUMN IF NOT EXISTS "approved_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "approved_by" uuid REFERENCES "users"("id") ON DELETE set null,
  ADD COLUMN IF NOT EXISTS "rejection_note" text;

CREATE INDEX IF NOT EXISTS "invoices_firm_approval_state_idx"
  ON "invoices" ("firm_id", "approval_state");

COMMENT ON COLUMN "invoices"."approval_state" IS
  'none | pending | approved | rejected — pre-send gate; AR/GL still use status';
