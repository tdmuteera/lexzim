-- Phase 10 P10-10: leave entitlements ledger, salary advances, payroll MVP.

CREATE TABLE IF NOT EXISTS "hr_leave_entitlements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "firm_id" uuid NOT NULL REFERENCES "firms"("id") ON DELETE cascade,
  "staff_profile_id" uuid NOT NULL REFERENCES "hr_staff_profiles"("id") ON DELETE cascade,
  "leave_type_id" uuid NOT NULL REFERENCES "hr_leave_types"("id") ON DELETE cascade,
  "year" integer NOT NULL,
  "entitlement_days" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "hr_leave_entitlements_firm_staff_type_year_uid"
    UNIQUE ("firm_id", "staff_profile_id", "leave_type_id", "year")
);

CREATE INDEX IF NOT EXISTS "hr_leave_entitlements_firm_staff_idx"
  ON "hr_leave_entitlements" ("firm_id", "staff_profile_id");

-- Backfill annual entitlements from staff profile for current calendar year.
INSERT INTO "hr_leave_entitlements" (
  "id", "firm_id", "staff_profile_id", "leave_type_id", "year", "entitlement_days", "created_at", "updated_at"
)
SELECT
  gen_random_uuid(),
  p."firm_id",
  p."id",
  t."id",
  EXTRACT(YEAR FROM NOW())::int,
  COALESCE(p."annual_leave_entitlement_days", 0),
  NOW(),
  NOW()
FROM "hr_staff_profiles" p
INNER JOIN "hr_leave_types" t
  ON t."firm_id" = p."firm_id" AND t."code" = 'annual'
WHERE p."annual_leave_entitlement_days" IS NOT NULL
ON CONFLICT ("firm_id", "staff_profile_id", "leave_type_id", "year") DO NOTHING;

CREATE TABLE IF NOT EXISTS "hr_salary_advances" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "firm_id" uuid NOT NULL REFERENCES "firms"("id") ON DELETE cascade,
  "staff_profile_id" uuid NOT NULL REFERENCES "hr_staff_profiles"("id") ON DELETE cascade,
  "employee_name" text NOT NULL,
  "position_title" text,
  "department" text,
  "employee_number" text,
  "application_date" timestamp with time zone NOT NULL DEFAULT now(),
  "amount_cents" integer NOT NULL,
  "amount_in_words" text,
  "reason" text,
  "declaration_accepted_at" timestamp with time zone,
  "gross_salary_cents" integer,
  "net_salary_cents" integer,
  "existing_advance_balance_cents" integer NOT NULL DEFAULT 0,
  "proposed_advance_cents" integer,
  "proposed_monthly_deduction_cents" integer,
  "recommended_months" integer,
  "prepared_by_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "finance_notes" text,
  "finance_reviewed_at" timestamp with time zone,
  "decision" text,
  "approved_amount_cents" integer,
  "monthly_deduction_cents" integer,
  "repayment_months" integer,
  "effective_deduction_date" timestamp with time zone,
  "management_comments" text,
  "authorised_by_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "decided_at" timestamp with time zone,
  "balance_remaining_cents" integer NOT NULL DEFAULT 0,
  "status" text NOT NULL DEFAULT 'submitted',
  "paid_at" timestamp with time zone,
  "created_by" uuid REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "hr_salary_advances_firm_idx"
  ON "hr_salary_advances" ("firm_id");
CREATE INDEX IF NOT EXISTS "hr_salary_advances_firm_status_idx"
  ON "hr_salary_advances" ("firm_id", "status");
CREATE INDEX IF NOT EXISTS "hr_salary_advances_staff_idx"
  ON "hr_salary_advances" ("staff_profile_id");

CREATE TABLE IF NOT EXISTS "hr_payroll_periods" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "firm_id" uuid NOT NULL REFERENCES "firms"("id") ON DELETE cascade,
  "label" text NOT NULL,
  "period_start" timestamp with time zone NOT NULL,
  "period_end" timestamp with time zone NOT NULL,
  "status" text NOT NULL DEFAULT 'open',
  "created_by" uuid REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "hr_payroll_periods_firm_idx"
  ON "hr_payroll_periods" ("firm_id");

CREATE TABLE IF NOT EXISTS "hr_payroll_lines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "firm_id" uuid NOT NULL REFERENCES "firms"("id") ON DELETE cascade,
  "period_id" uuid NOT NULL REFERENCES "hr_payroll_periods"("id") ON DELETE cascade,
  "staff_profile_id" uuid NOT NULL REFERENCES "hr_staff_profiles"("id") ON DELETE cascade,
  "gross_cents" integer NOT NULL DEFAULT 0,
  "advances_outstanding_cents" integer NOT NULL DEFAULT 0,
  "deductions_cents" integer NOT NULL DEFAULT 0,
  "net_payable_cents" integer NOT NULL DEFAULT 0,
  "advance_ids_json" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "paid_at" timestamp with time zone,
  "paid_by_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "hr_payroll_lines_period_staff_uid" UNIQUE ("period_id", "staff_profile_id")
);

CREATE INDEX IF NOT EXISTS "hr_payroll_lines_firm_period_idx"
  ON "hr_payroll_lines" ("firm_id", "period_id");
