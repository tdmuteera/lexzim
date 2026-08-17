-- Phase 8: platform diagnostic store (not firm audit_logs).
-- No KYC, matter titles, amounts, secrets, or document bodies belong in these tables.

CREATE TABLE IF NOT EXISTS "diagnostic_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "request_id" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "source" text NOT NULL,
  "level" text NOT NULL,
  "module" text NOT NULL,
  "route" text,
  "http_method" text,
  "http_status" integer,
  "error_code" text,
  "sqlstate" text,
  "message_safe" text DEFAULT '' NOT NULL,
  "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "firm_id" uuid REFERENCES "firms"("id") ON DELETE SET NULL,
  "role" text,
  "duration_ms" integer,
  "payload_json" jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS "diagnostic_events_request_id_idx" ON "diagnostic_events" ("request_id");
CREATE INDEX IF NOT EXISTS "diagnostic_events_created_at_idx" ON "diagnostic_events" ("created_at" DESC);
CREATE INDEX IF NOT EXISTS "diagnostic_events_module_idx" ON "diagnostic_events" ("module");
CREATE INDEX IF NOT EXISTS "diagnostic_events_level_idx" ON "diagnostic_events" ("level");
CREATE INDEX IF NOT EXISTS "diagnostic_events_firm_id_idx" ON "diagnostic_events" ("firm_id");

CREATE TABLE IF NOT EXISTS "diagnostic_spans" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "request_id" text NOT NULL,
  "parent_span_id" uuid REFERENCES "diagnostic_spans"("id") ON DELETE SET NULL,
  "name" text NOT NULL,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "duration_ms" integer,
  "ok" boolean DEFAULT true NOT NULL,
  "error_code" text
);

CREATE INDEX IF NOT EXISTS "diagnostic_spans_request_id_idx" ON "diagnostic_spans" ("request_id");
CREATE INDEX IF NOT EXISTS "diagnostic_spans_parent_idx" ON "diagnostic_spans" ("parent_span_id");

CREATE TABLE IF NOT EXISTS "diagnostic_diagnoses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "request_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "summary" text NOT NULL,
  "likely_cause" text NOT NULL,
  "confidence" integer DEFAULT 0 NOT NULL,
  "alternatives_json" jsonb DEFAULT '[]'::jsonb,
  "evidence_json" jsonb DEFAULT '{}'::jsonb,
  "recommended_action" text DEFAULT 'none' NOT NULL,
  "model_id" text,
  "created_by" text NOT NULL
);

CREATE INDEX IF NOT EXISTS "diagnostic_diagnoses_request_id_idx" ON "diagnostic_diagnoses" ("request_id");
CREATE INDEX IF NOT EXISTS "diagnostic_diagnoses_created_at_idx" ON "diagnostic_diagnoses" ("created_at" DESC);

CREATE TABLE IF NOT EXISTS "diagnostic_repair_actions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "diagnosis_id" uuid REFERENCES "diagnostic_diagnoses"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "kind" text NOT NULL,
  "action_code" text NOT NULL,
  "status" text DEFAULT 'proposed' NOT NULL,
  "requested_by" text,
  "approved_by" text,
  "executed_at" timestamp with time zone,
  "result_safe" text,
  "proposal_path" text
);

CREATE INDEX IF NOT EXISTS "diagnostic_repair_actions_diagnosis_idx" ON "diagnostic_repair_actions" ("diagnosis_id");
CREATE INDEX IF NOT EXISTS "diagnostic_repair_actions_status_idx" ON "diagnostic_repair_actions" ("status");
CREATE INDEX IF NOT EXISTS "diagnostic_repair_actions_created_at_idx" ON "diagnostic_repair_actions" ("created_at" DESC);
