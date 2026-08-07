CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firm_id" uuid NOT NULL,
	"client_type" text NOT NULL,
	"full_name" text,
	"legal_name" text,
	"trading_name" text,
	"national_id_or_reg_number" text,
	"tax_number" text,
	"email" text,
	"phone" text,
	"alt_phone" text,
	"physical_address" text,
	"postal_address" text,
	"kyc_notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firm_id" uuid NOT NULL,
	"matter_id" uuid NOT NULL,
	"client_id" uuid,
	"title" text NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"storage_path" text NOT NULL,
	"size_bytes" integer,
	"doc_type" text DEFAULT 'uploaded' NOT NULL,
	"template_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "matter_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firm_id" uuid NOT NULL,
	"matter_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"event_at" timestamp with time zone NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "matter_team" (
	"firm_id" uuid NOT NULL,
	"matter_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role_on_matter" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "matter_team_matter_id_user_id_pk" PRIMARY KEY("matter_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "matters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firm_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"area_of_law" text NOT NULL,
	"status" text DEFAULT 'prospective' NOT NULL,
	"matter_number" text,
	"file_ref" text,
	"court_name" text,
	"case_number" text,
	"responsible_lawyer_id" uuid,
	"opened_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"next_hearing_at" timestamp with time zone,
	"priority" text DEFAULT 'normal',
	"conflict_check_status" text DEFAULT 'not_done' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pending_procedures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firm_id" uuid NOT NULL,
	"matter_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"due_at" timestamp with time zone,
	"status" text DEFAULT 'todo' NOT NULL,
	"assigned_to" uuid,
	"completed_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "related_parties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firm_id" uuid NOT NULL,
	"client_id" uuid,
	"matter_id" uuid,
	"party_role" text NOT NULL,
	"name" text NOT NULL,
	"contact" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "template_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firm_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"storage_path" text NOT NULL,
	"change_note" text,
	"created_by" uuid,
	"approved_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firm_id" uuid NOT NULL,
	"title" text NOT NULL,
	"area_of_law" text NOT NULL,
	"description" text,
	"body_format" text DEFAULT 'docx' NOT NULL,
	"storage_path" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_matter_id_matters_id_fk" FOREIGN KEY ("matter_id") REFERENCES "public"."matters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matter_events" ADD CONSTRAINT "matter_events_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matter_events" ADD CONSTRAINT "matter_events_matter_id_matters_id_fk" FOREIGN KEY ("matter_id") REFERENCES "public"."matters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matter_events" ADD CONSTRAINT "matter_events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matter_team" ADD CONSTRAINT "matter_team_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matter_team" ADD CONSTRAINT "matter_team_matter_id_matters_id_fk" FOREIGN KEY ("matter_id") REFERENCES "public"."matters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matter_team" ADD CONSTRAINT "matter_team_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matters" ADD CONSTRAINT "matters_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matters" ADD CONSTRAINT "matters_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matters" ADD CONSTRAINT "matters_responsible_lawyer_id_users_id_fk" FOREIGN KEY ("responsible_lawyer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matters" ADD CONSTRAINT "matters_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_procedures" ADD CONSTRAINT "pending_procedures_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_procedures" ADD CONSTRAINT "pending_procedures_matter_id_matters_id_fk" FOREIGN KEY ("matter_id") REFERENCES "public"."matters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_procedures" ADD CONSTRAINT "pending_procedures_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_procedures" ADD CONSTRAINT "pending_procedures_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "related_parties" ADD CONSTRAINT "related_parties_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "related_parties" ADD CONSTRAINT "related_parties_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "related_parties" ADD CONSTRAINT "related_parties_matter_id_matters_id_fk" FOREIGN KEY ("matter_id") REFERENCES "public"."matters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_versions" ADD CONSTRAINT "template_versions_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_versions" ADD CONSTRAINT "template_versions_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_versions" ADD CONSTRAINT "template_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_versions" ADD CONSTRAINT "template_versions_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "templates" ADD CONSTRAINT "templates_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "templates" ADD CONSTRAINT "templates_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "templates" ADD CONSTRAINT "templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "clients_firm_id_idx" ON "clients" USING btree ("firm_id");--> statement-breakpoint
CREATE INDEX "clients_firm_archived_idx" ON "clients" USING btree ("firm_id","archived_at");--> statement-breakpoint
CREATE INDEX "clients_firm_type_idx" ON "clients" USING btree ("firm_id","client_type");--> statement-breakpoint
CREATE INDEX "documents_firm_id_idx" ON "documents" USING btree ("firm_id");--> statement-breakpoint
CREATE INDEX "documents_firm_matter_idx" ON "documents" USING btree ("firm_id","matter_id");--> statement-breakpoint
CREATE INDEX "documents_matter_id_idx" ON "documents" USING btree ("matter_id");--> statement-breakpoint
CREATE INDEX "matter_events_firm_id_idx" ON "matter_events" USING btree ("firm_id");--> statement-breakpoint
CREATE INDEX "matter_events_matter_id_idx" ON "matter_events" USING btree ("matter_id");--> statement-breakpoint
CREATE INDEX "matter_events_event_at_idx" ON "matter_events" USING btree ("event_at");--> statement-breakpoint
CREATE INDEX "matter_team_firm_id_idx" ON "matter_team" USING btree ("firm_id");--> statement-breakpoint
CREATE INDEX "matters_firm_id_idx" ON "matters" USING btree ("firm_id");--> statement-breakpoint
CREATE INDEX "matters_firm_status_idx" ON "matters" USING btree ("firm_id","status");--> statement-breakpoint
CREATE INDEX "matters_firm_client_idx" ON "matters" USING btree ("firm_id","client_id");--> statement-breakpoint
CREATE INDEX "matters_responsible_lawyer_idx" ON "matters" USING btree ("responsible_lawyer_id");--> statement-breakpoint
CREATE INDEX "pending_procedures_firm_id_idx" ON "pending_procedures" USING btree ("firm_id");--> statement-breakpoint
CREATE INDEX "pending_procedures_firm_due_idx" ON "pending_procedures" USING btree ("firm_id","due_at");--> statement-breakpoint
CREATE INDEX "pending_procedures_matter_id_idx" ON "pending_procedures" USING btree ("matter_id");--> statement-breakpoint
CREATE INDEX "related_parties_firm_id_idx" ON "related_parties" USING btree ("firm_id");--> statement-breakpoint
CREATE INDEX "related_parties_matter_id_idx" ON "related_parties" USING btree ("matter_id");--> statement-breakpoint
CREATE INDEX "template_versions_firm_id_idx" ON "template_versions" USING btree ("firm_id");--> statement-breakpoint
CREATE INDEX "template_versions_template_id_idx" ON "template_versions" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "templates_firm_id_idx" ON "templates" USING btree ("firm_id");--> statement-breakpoint
CREATE INDEX "templates_firm_area_idx" ON "templates" USING btree ("firm_id","area_of_law");