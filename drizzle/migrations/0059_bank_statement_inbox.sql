-- Bank statement inbox: CSV import, line matching, categorization rules.
-- Complements manual reconciliations; does not open bank feeds / Open Banking.

CREATE TABLE IF NOT EXISTS "bank_statement_imports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "firm_id" uuid NOT NULL REFERENCES "firms"("id") ON DELETE cascade,
  "account_kind" text NOT NULL,
  "bank_account_label" text,
  "trust_account_id" uuid REFERENCES "trust_accounts"("id") ON DELETE set null,
  "currency" text NOT NULL DEFAULT 'USD',
  "source_filename" text,
  "status" text NOT NULL DEFAULT 'open',
  "notes" text,
  "line_count" integer NOT NULL DEFAULT 0,
  "imported_by" uuid REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "bank_statement_imports_firm_status_idx"
  ON "bank_statement_imports" ("firm_id", "status");
CREATE INDEX IF NOT EXISTS "bank_statement_imports_firm_created_idx"
  ON "bank_statement_imports" ("firm_id", "created_at");

CREATE TABLE IF NOT EXISTS "bank_match_rules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "firm_id" uuid NOT NULL REFERENCES "firms"("id") ON DELETE cascade,
  "name" text NOT NULL,
  "direction" text NOT NULL DEFAULT 'any',
  "match_field" text NOT NULL DEFAULT 'description',
  "match_type" text NOT NULL DEFAULT 'contains',
  "match_value" text NOT NULL,
  "priority" integer NOT NULL DEFAULT 100,
  "action" text NOT NULL,
  "expense_category" text,
  "default_payee" text,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_by" uuid REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "bank_match_rules_firm_active_idx"
  ON "bank_match_rules" ("firm_id", "is_active", "priority");

CREATE TABLE IF NOT EXISTS "bank_statement_lines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "firm_id" uuid NOT NULL REFERENCES "firms"("id") ON DELETE cascade,
  "import_id" uuid NOT NULL REFERENCES "bank_statement_imports"("id") ON DELETE cascade,
  "line_date" timestamp with time zone NOT NULL,
  "description" text NOT NULL DEFAULT '',
  "reference" text,
  "amount_cents" integer NOT NULL,
  "currency" text NOT NULL DEFAULT 'USD',
  "raw_hash" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "matched_entity_type" text,
  "matched_entity_id" uuid,
  "applied_rule_id" uuid REFERENCES "bank_match_rules"("id") ON DELETE set null,
  "suggested_category" text,
  "suggested_payee" text,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "bank_statement_lines_firm_import_idx"
  ON "bank_statement_lines" ("firm_id", "import_id");
CREATE INDEX IF NOT EXISTS "bank_statement_lines_firm_status_idx"
  ON "bank_statement_lines" ("firm_id", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "bank_statement_lines_firm_hash_uid"
  ON "bank_statement_lines" ("firm_id", "raw_hash");

ALTER TABLE "bank_statement_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bank_statement_imports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bank_match_rules" ENABLE ROW LEVEL SECURITY;
