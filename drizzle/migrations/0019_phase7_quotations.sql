CREATE TABLE "firm_services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firm_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"default_price_cents" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"revenue_gl_account_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firm_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"matter_id" uuid,
	"quote_number" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"valid_until" timestamp with time zone,
	"discount_cents" integer DEFAULT 0 NOT NULL,
	"discount_pct" real,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotation_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firm_id" uuid NOT NULL,
	"quotation_id" uuid NOT NULL,
	"firm_service_id" uuid,
	"description" text NOT NULL,
	"qty" real DEFAULT 1 NOT NULL,
	"unit_price_cents" integer DEFAULT 0 NOT NULL,
	"line_total_cents" integer DEFAULT 0 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "firm_services" ADD CONSTRAINT "firm_services_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "firm_services" ADD CONSTRAINT "firm_services_revenue_gl_account_id_gl_accounts_id_fk" FOREIGN KEY ("revenue_gl_account_id") REFERENCES "public"."gl_accounts"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_matter_id_matters_id_fk" FOREIGN KEY ("matter_id") REFERENCES "public"."matters"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "quotation_lines" ADD CONSTRAINT "quotation_lines_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "quotation_lines" ADD CONSTRAINT "quotation_lines_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "quotation_lines" ADD CONSTRAINT "quotation_lines_firm_service_id_firm_services_id_fk" FOREIGN KEY ("firm_service_id") REFERENCES "public"."firm_services"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "firm_services_firm_code_uid" ON "firm_services" USING btree ("firm_id","code");
--> statement-breakpoint
CREATE INDEX "firm_services_firm_active_idx" ON "firm_services" USING btree ("firm_id","is_active");
--> statement-breakpoint
CREATE UNIQUE INDEX "quotations_firm_quote_number_uid" ON "quotations" USING btree ("firm_id","quote_number");
--> statement-breakpoint
CREATE INDEX "quotations_firm_status_idx" ON "quotations" USING btree ("firm_id","status");
--> statement-breakpoint
CREATE INDEX "quotations_firm_client_idx" ON "quotations" USING btree ("firm_id","client_id");
--> statement-breakpoint
CREATE INDEX "quotation_lines_firm_quote_idx" ON "quotation_lines" USING btree ("firm_id","quotation_id");
