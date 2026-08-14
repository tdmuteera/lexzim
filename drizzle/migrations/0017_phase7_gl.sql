CREATE TABLE "gl_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firm_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"parent_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"normal_balance" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gl_journal_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firm_id" uuid NOT NULL,
	"entry_date" timestamp with time zone NOT NULL,
	"reference" text,
	"memo" text,
	"source_type" text DEFAULT 'manual' NOT NULL,
	"source_id" uuid,
	"posted_by" uuid NOT NULL,
	"posted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reversed_by_entry_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gl_journal_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firm_id" uuid NOT NULL,
	"entry_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"debit_cents" integer DEFAULT 0 NOT NULL,
	"credit_cents" integer DEFAULT 0 NOT NULL,
	"matter_id" uuid,
	"client_id" uuid,
	"currency" text DEFAULT 'USD' NOT NULL,
	"line_memo" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "gl_accounts" ADD CONSTRAINT "gl_accounts_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "gl_accounts" ADD CONSTRAINT "gl_accounts_parent_id_gl_accounts_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."gl_accounts"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "gl_journal_entries" ADD CONSTRAINT "gl_journal_entries_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "gl_journal_entries" ADD CONSTRAINT "gl_journal_entries_posted_by_users_id_fk" FOREIGN KEY ("posted_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "gl_journal_entries" ADD CONSTRAINT "gl_journal_entries_reversed_by_entry_id_gl_journal_entries_id_fk" FOREIGN KEY ("reversed_by_entry_id") REFERENCES "public"."gl_journal_entries"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "gl_journal_lines" ADD CONSTRAINT "gl_journal_lines_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "gl_journal_lines" ADD CONSTRAINT "gl_journal_lines_entry_id_gl_journal_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."gl_journal_entries"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "gl_journal_lines" ADD CONSTRAINT "gl_journal_lines_account_id_gl_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."gl_accounts"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "gl_journal_lines" ADD CONSTRAINT "gl_journal_lines_matter_id_matters_id_fk" FOREIGN KEY ("matter_id") REFERENCES "public"."matters"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "gl_journal_lines" ADD CONSTRAINT "gl_journal_lines_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "gl_accounts_firm_code_uid" ON "gl_accounts" USING btree ("firm_id","code");
--> statement-breakpoint
CREATE INDEX "gl_accounts_firm_type_idx" ON "gl_accounts" USING btree ("firm_id","type");
--> statement-breakpoint
CREATE INDEX "gl_accounts_firm_parent_idx" ON "gl_accounts" USING btree ("firm_id","parent_id");
--> statement-breakpoint
CREATE INDEX "gl_journal_entries_firm_date_idx" ON "gl_journal_entries" USING btree ("firm_id","entry_date");
--> statement-breakpoint
CREATE INDEX "gl_journal_entries_firm_source_idx" ON "gl_journal_entries" USING btree ("firm_id","source_type","source_id");
--> statement-breakpoint
CREATE INDEX "gl_journal_lines_firm_entry_idx" ON "gl_journal_lines" USING btree ("firm_id","entry_id");
--> statement-breakpoint
CREATE INDEX "gl_journal_lines_firm_account_idx" ON "gl_journal_lines" USING btree ("firm_id","account_id");
