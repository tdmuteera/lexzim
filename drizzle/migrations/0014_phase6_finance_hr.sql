ALTER TABLE "trust_accounts" ADD COLUMN "account_kind" text DEFAULT 'bank' NOT NULL;
--> statement-breakpoint
CREATE INDEX "trust_accounts_firm_kind_idx" ON "trust_accounts" USING btree ("firm_id","account_kind");
--> statement-breakpoint
CREATE TABLE "trust_vault_bank_ins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firm_id" uuid NOT NULL,
	"vault_account_id" uuid NOT NULL,
	"bank_account_id" uuid NOT NULL,
	"client_id" uuid,
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"reference" text,
	"narrative" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trust_vault_counts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firm_id" uuid NOT NULL,
	"vault_account_id" uuid NOT NULL,
	"counted_at" timestamp with time zone NOT NULL,
	"system_balance_cents" integer NOT NULL,
	"counted_balance_cents" integer NOT NULL,
	"variance_cents" integer NOT NULL,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finance_reconciliation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firm_id" uuid NOT NULL,
	"recon_type" text NOT NULL,
	"period_year" integer NOT NULL,
	"period_month" integer NOT NULL,
	"trust_account_id" uuid,
	"bank_account_label" text,
	"statement_balance_cents" integer NOT NULL,
	"ledger_balance_cents" integer NOT NULL,
	"variance_cents" integer NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"notes" text,
	"override_reason" text,
	"completed_by" uuid,
	"completed_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "firm_expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firm_id" uuid NOT NULL,
	"expense_date" timestamp with time zone NOT NULL,
	"category" text NOT NULL,
	"payee" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"matter_id" uuid,
	"payment_method" text,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_cashbook_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firm_id" uuid NOT NULL,
	"entry_date" timestamp with time zone NOT NULL,
	"entry_type" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"reference" text,
	"bank_account_label" text,
	"expense_id" uuid,
	"fee_payment_id" uuid,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finance_period_locks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firm_id" uuid NOT NULL,
	"period_year" integer NOT NULL,
	"period_month" integer NOT NULL,
	"locked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_by" uuid NOT NULL,
	CONSTRAINT "finance_period_locks_firm_period_uid" UNIQUE("firm_id","period_year","period_month")
);
--> statement-breakpoint
CREATE TABLE "hr_staff_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firm_id" uuid NOT NULL,
	"user_id" uuid,
	"full_name" text NOT NULL,
	"email" text,
	"phone" text,
	"job_title" text,
	"department" text,
	"start_date" timestamp with time zone,
	"end_date" timestamp with time zone,
	"emergency_contact_name" text,
	"emergency_contact_phone" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hr_staff_profiles_firm_user_uid" UNIQUE("firm_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "hr_contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firm_id" uuid NOT NULL,
	"staff_profile_id" uuid NOT NULL,
	"title" text NOT NULL,
	"start_date" timestamp with time zone NOT NULL,
	"end_date" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"contract_document_name" text,
	"contract_document_path" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hr_leave_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firm_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"is_paid" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hr_leave_types_firm_code_uid" UNIQUE("firm_id","code")
);
--> statement-breakpoint
CREATE TABLE "hr_leave_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firm_id" uuid NOT NULL,
	"staff_profile_id" uuid NOT NULL,
	"leave_type_id" uuid NOT NULL,
	"from_date" timestamp with time zone NOT NULL,
	"to_date" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'requested' NOT NULL,
	"approver_user_id" uuid,
	"approved_at" timestamp with time zone,
	"notes" text,
	"decision_notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trust_vault_bank_ins" ADD CONSTRAINT "trust_vault_bank_ins_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "trust_vault_bank_ins" ADD CONSTRAINT "trust_vault_bank_ins_vault_account_id_trust_accounts_id_fk" FOREIGN KEY ("vault_account_id") REFERENCES "public"."trust_accounts"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "trust_vault_bank_ins" ADD CONSTRAINT "trust_vault_bank_ins_bank_account_id_trust_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."trust_accounts"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "trust_vault_bank_ins" ADD CONSTRAINT "trust_vault_bank_ins_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "trust_vault_bank_ins" ADD CONSTRAINT "trust_vault_bank_ins_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "trust_vault_counts" ADD CONSTRAINT "trust_vault_counts_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "trust_vault_counts" ADD CONSTRAINT "trust_vault_counts_vault_account_id_trust_accounts_id_fk" FOREIGN KEY ("vault_account_id") REFERENCES "public"."trust_accounts"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "trust_vault_counts" ADD CONSTRAINT "trust_vault_counts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "finance_reconciliation_runs" ADD CONSTRAINT "finance_reconciliation_runs_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "finance_reconciliation_runs" ADD CONSTRAINT "finance_reconciliation_runs_trust_account_id_trust_accounts_id_fk" FOREIGN KEY ("trust_account_id") REFERENCES "public"."trust_accounts"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "finance_reconciliation_runs" ADD CONSTRAINT "finance_reconciliation_runs_completed_by_users_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "finance_reconciliation_runs" ADD CONSTRAINT "finance_reconciliation_runs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "firm_expenses" ADD CONSTRAINT "firm_expenses_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "firm_expenses" ADD CONSTRAINT "firm_expenses_matter_id_matters_id_fk" FOREIGN KEY ("matter_id") REFERENCES "public"."matters"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "firm_expenses" ADD CONSTRAINT "firm_expenses_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "business_cashbook_entries" ADD CONSTRAINT "business_cashbook_entries_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "business_cashbook_entries" ADD CONSTRAINT "business_cashbook_entries_expense_id_firm_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."firm_expenses"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "business_cashbook_entries" ADD CONSTRAINT "business_cashbook_entries_fee_payment_id_fee_payments_id_fk" FOREIGN KEY ("fee_payment_id") REFERENCES "public"."fee_payments"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "business_cashbook_entries" ADD CONSTRAINT "business_cashbook_entries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "finance_period_locks" ADD CONSTRAINT "finance_period_locks_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "finance_period_locks" ADD CONSTRAINT "finance_period_locks_locked_by_users_id_fk" FOREIGN KEY ("locked_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "hr_staff_profiles" ADD CONSTRAINT "hr_staff_profiles_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "hr_staff_profiles" ADD CONSTRAINT "hr_staff_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "hr_contracts" ADD CONSTRAINT "hr_contracts_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "hr_contracts" ADD CONSTRAINT "hr_contracts_staff_profile_id_hr_staff_profiles_id_fk" FOREIGN KEY ("staff_profile_id") REFERENCES "public"."hr_staff_profiles"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "hr_leave_types" ADD CONSTRAINT "hr_leave_types_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "hr_leave_requests" ADD CONSTRAINT "hr_leave_requests_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "hr_leave_requests" ADD CONSTRAINT "hr_leave_requests_staff_profile_id_hr_staff_profiles_id_fk" FOREIGN KEY ("staff_profile_id") REFERENCES "public"."hr_staff_profiles"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "hr_leave_requests" ADD CONSTRAINT "hr_leave_requests_leave_type_id_hr_leave_types_id_fk" FOREIGN KEY ("leave_type_id") REFERENCES "public"."hr_leave_types"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "hr_leave_requests" ADD CONSTRAINT "hr_leave_requests_approver_user_id_users_id_fk" FOREIGN KEY ("approver_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "hr_leave_requests" ADD CONSTRAINT "hr_leave_requests_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "trust_vault_bank_ins_firm_idx" ON "trust_vault_bank_ins" USING btree ("firm_id");
--> statement-breakpoint
CREATE INDEX "trust_vault_bank_ins_vault_idx" ON "trust_vault_bank_ins" USING btree ("vault_account_id");
--> statement-breakpoint
CREATE INDEX "trust_vault_bank_ins_occurred_idx" ON "trust_vault_bank_ins" USING btree ("firm_id","occurred_at");
--> statement-breakpoint
CREATE INDEX "trust_vault_counts_firm_idx" ON "trust_vault_counts" USING btree ("firm_id");
--> statement-breakpoint
CREATE INDEX "trust_vault_counts_vault_idx" ON "trust_vault_counts" USING btree ("vault_account_id");
--> statement-breakpoint
CREATE INDEX "finance_recon_runs_firm_period_idx" ON "finance_reconciliation_runs" USING btree ("firm_id","recon_type","period_year","period_month");
--> statement-breakpoint
CREATE INDEX "finance_recon_runs_firm_status_idx" ON "finance_reconciliation_runs" USING btree ("firm_id","status");
--> statement-breakpoint
CREATE INDEX "firm_expenses_firm_date_idx" ON "firm_expenses" USING btree ("firm_id","expense_date");
--> statement-breakpoint
CREATE INDEX "firm_expenses_firm_category_idx" ON "firm_expenses" USING btree ("firm_id","category");
--> statement-breakpoint
CREATE INDEX "business_cashbook_firm_date_idx" ON "business_cashbook_entries" USING btree ("firm_id","entry_date");
--> statement-breakpoint
CREATE INDEX "business_cashbook_firm_type_idx" ON "business_cashbook_entries" USING btree ("firm_id","entry_type");
--> statement-breakpoint
CREATE INDEX "finance_period_locks_firm_idx" ON "finance_period_locks" USING btree ("firm_id");
--> statement-breakpoint
CREATE INDEX "hr_staff_profiles_firm_idx" ON "hr_staff_profiles" USING btree ("firm_id");
--> statement-breakpoint
CREATE INDEX "hr_staff_profiles_firm_active_idx" ON "hr_staff_profiles" USING btree ("firm_id","is_active");
--> statement-breakpoint
CREATE INDEX "hr_contracts_firm_idx" ON "hr_contracts" USING btree ("firm_id");
--> statement-breakpoint
CREATE INDEX "hr_contracts_staff_idx" ON "hr_contracts" USING btree ("staff_profile_id");
--> statement-breakpoint
CREATE INDEX "hr_leave_types_firm_idx" ON "hr_leave_types" USING btree ("firm_id");
--> statement-breakpoint
CREATE INDEX "hr_leave_requests_firm_idx" ON "hr_leave_requests" USING btree ("firm_id");
--> statement-breakpoint
CREATE INDEX "hr_leave_requests_staff_idx" ON "hr_leave_requests" USING btree ("staff_profile_id");
--> statement-breakpoint
CREATE INDEX "hr_leave_requests_firm_status_idx" ON "hr_leave_requests" USING btree ("firm_id","status");
--> statement-breakpoint
CREATE INDEX "hr_leave_requests_dates_idx" ON "hr_leave_requests" USING btree ("firm_id","from_date","to_date");
