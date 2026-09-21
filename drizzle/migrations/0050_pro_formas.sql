-- Firm-wide Pro Forma invoices (estimate only; no GL / AR).
CREATE TABLE IF NOT EXISTS "pro_formas" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "firm_id" uuid NOT NULL,
  "client_id" uuid NOT NULL,
  "matter_id" uuid,
  "proforma_number" text NOT NULL,
  "kind" text NOT NULL,
  "conveyancing_category" text,
  "property_value_cents" integer,
  "status" text NOT NULL DEFAULT 'draft',
  "currency" text NOT NULL DEFAULT 'USD',
  "notes" text,
  "created_by" uuid,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "pro_formas_firm_id_firms_id_fk"
    FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "pro_formas_client_id_clients_id_fk"
    FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action,
  CONSTRAINT "pro_formas_matter_id_matters_id_fk"
    FOREIGN KEY ("matter_id") REFERENCES "public"."matters"("id") ON DELETE set null ON UPDATE no action,
  CONSTRAINT "pro_formas_created_by_users_id_fk"
    FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action
);

CREATE UNIQUE INDEX IF NOT EXISTS "pro_formas_firm_number_uid"
  ON "pro_formas" ("firm_id", "proforma_number");
CREATE INDEX IF NOT EXISTS "pro_formas_firm_status_idx"
  ON "pro_formas" ("firm_id", "status");
CREATE INDEX IF NOT EXISTS "pro_formas_firm_client_idx"
  ON "pro_formas" ("firm_id", "client_id");
CREATE INDEX IF NOT EXISTS "pro_formas_firm_kind_idx"
  ON "pro_formas" ("firm_id", "kind");

CREATE TABLE IF NOT EXISTS "pro_forma_lines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "firm_id" uuid NOT NULL,
  "proforma_id" uuid NOT NULL,
  "line_code" text NOT NULL,
  "description" text NOT NULL,
  "included" boolean NOT NULL DEFAULT true,
  "is_optional" boolean NOT NULL DEFAULT false,
  "qty" real NOT NULL DEFAULT 1,
  "unit_price_cents" integer NOT NULL DEFAULT 0,
  "line_total_cents" integer NOT NULL DEFAULT 0,
  "rate_pct" real,
  "calc_hint" text,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "pro_forma_lines_firm_id_firms_id_fk"
    FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "pro_forma_lines_proforma_id_pro_formas_id_fk"
    FOREIGN KEY ("proforma_id") REFERENCES "public"."pro_formas"("id") ON DELETE cascade ON UPDATE no action
);

CREATE INDEX IF NOT EXISTS "pro_forma_lines_firm_proforma_idx"
  ON "pro_forma_lines" ("firm_id", "proforma_id");
