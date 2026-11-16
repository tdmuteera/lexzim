-- Recurring finance templates: expenses, creditor bills, fee invoices.

CREATE TABLE IF NOT EXISTS "finance_recurring_templates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "firm_id" uuid NOT NULL REFERENCES "firms"("id") ON DELETE cascade,
  "name" text NOT NULL,
  "kind" text NOT NULL,
  "mode" text NOT NULL DEFAULT 'scheduled',
  "interval_unit" text NOT NULL DEFAULT 'monthly',
  "interval_count" integer NOT NULL DEFAULT 1,
  "next_run_on" date NOT NULL,
  "end_on" date,
  "is_active" boolean NOT NULL DEFAULT true,
  "currency" text NOT NULL DEFAULT 'USD',
  "amount_cents" integer,
  "payload_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "last_run_on" date,
  "last_run_status" text,
  "last_run_entity_type" text,
  "last_run_entity_id" uuid,
  "last_run_error" text,
  "created_by" uuid REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "finance_recurring_firm_active_idx"
  ON "finance_recurring_templates" ("firm_id", "is_active");
CREATE INDEX IF NOT EXISTS "finance_recurring_firm_next_idx"
  ON "finance_recurring_templates" ("firm_id", "next_run_on");

ALTER TABLE "finance_recurring_templates" ENABLE ROW LEVEL SECURITY;
