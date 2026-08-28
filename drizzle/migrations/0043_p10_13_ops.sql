-- P10-13: Debtor communications, conflict client_id, knowledge/event reports.

ALTER TABLE "conflict_checks" ADD COLUMN IF NOT EXISTS "client_id" uuid
  REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;

CREATE INDEX IF NOT EXISTS "conflict_checks_client_id_idx"
  ON "conflict_checks" ("firm_id", "client_id");

CREATE TABLE IF NOT EXISTS "debtor_communications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "firm_id" uuid NOT NULL,
  "client_id" uuid NOT NULL,
  "invoice_id" uuid,
  "logged_at" timestamp with time zone DEFAULT now() NOT NULL,
  "employee_user_id" uuid NOT NULL,
  "channel" text NOT NULL,
  "outcome_notes" text NOT NULL,
  "next_follow_up_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "debtor_communications_firm_id_firms_id_fk"
    FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "debtor_communications_client_id_clients_id_fk"
    FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "debtor_communications_invoice_id_invoices_id_fk"
    FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action,
  CONSTRAINT "debtor_communications_employee_user_id_users_id_fk"
    FOREIGN KEY ("employee_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
);

CREATE INDEX IF NOT EXISTS "debtor_communications_firm_client_idx"
  ON "debtor_communications" ("firm_id", "client_id");
CREATE INDEX IF NOT EXISTS "debtor_communications_firm_follow_up_idx"
  ON "debtor_communications" ("firm_id", "next_follow_up_at");
CREATE INDEX IF NOT EXISTS "debtor_communications_firm_logged_idx"
  ON "debtor_communications" ("firm_id", "logged_at");

CREATE TABLE IF NOT EXISTS "knowledge_reports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "firm_id" uuid NOT NULL,
  "title" text NOT NULL,
  "report_date" date NOT NULL,
  "author_user_id" uuid,
  "author_name" text,
  "event_name" text,
  "notes" text,
  "file_name" text NOT NULL,
  "content_type" text,
  "byte_size" integer,
  "storage_path" text NOT NULL,
  "text_extract" text,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "knowledge_reports_firm_id_firms_id_fk"
    FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "knowledge_reports_author_user_id_users_id_fk"
    FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action,
  CONSTRAINT "knowledge_reports_created_by_users_id_fk"
    FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action
);

CREATE INDEX IF NOT EXISTS "knowledge_reports_firm_date_idx"
  ON "knowledge_reports" ("firm_id", "report_date");
CREATE INDEX IF NOT EXISTS "knowledge_reports_firm_created_idx"
  ON "knowledge_reports" ("firm_id", "created_at");
