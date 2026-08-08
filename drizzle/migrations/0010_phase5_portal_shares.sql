CREATE TABLE "matter_portal_shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firm_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"matter_id" uuid NOT NULL,
	"permission" text DEFAULT 'read' NOT NULL,
	"shared_by_user_id" uuid,
	"shared_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by_user_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_portal_shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firm_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"matter_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"permission" text DEFAULT 'read' NOT NULL,
	"shared_by_user_id" uuid,
	"shared_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by_user_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "matter_portal_shares" ADD CONSTRAINT "matter_portal_shares_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "matter_portal_shares" ADD CONSTRAINT "matter_portal_shares_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "matter_portal_shares" ADD CONSTRAINT "matter_portal_shares_matter_id_matters_id_fk" FOREIGN KEY ("matter_id") REFERENCES "public"."matters"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "matter_portal_shares" ADD CONSTRAINT "matter_portal_shares_shared_by_user_id_users_id_fk" FOREIGN KEY ("shared_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "matter_portal_shares" ADD CONSTRAINT "matter_portal_shares_revoked_by_user_id_users_id_fk" FOREIGN KEY ("revoked_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "document_portal_shares" ADD CONSTRAINT "document_portal_shares_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "document_portal_shares" ADD CONSTRAINT "document_portal_shares_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "document_portal_shares" ADD CONSTRAINT "document_portal_shares_matter_id_matters_id_fk" FOREIGN KEY ("matter_id") REFERENCES "public"."matters"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "document_portal_shares" ADD CONSTRAINT "document_portal_shares_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "document_portal_shares" ADD CONSTRAINT "document_portal_shares_shared_by_user_id_users_id_fk" FOREIGN KEY ("shared_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "document_portal_shares" ADD CONSTRAINT "document_portal_shares_revoked_by_user_id_users_id_fk" FOREIGN KEY ("revoked_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "matter_portal_shares_firm_matter_client_uq" ON "matter_portal_shares" USING btree ("firm_id","matter_id","client_id");
--> statement-breakpoint
CREATE INDEX "matter_portal_shares_firm_client_idx" ON "matter_portal_shares" USING btree ("firm_id","client_id");
--> statement-breakpoint
CREATE INDEX "matter_portal_shares_firm_matter_idx" ON "matter_portal_shares" USING btree ("firm_id","matter_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "document_portal_shares_firm_doc_client_uq" ON "document_portal_shares" USING btree ("firm_id","document_id","client_id");
--> statement-breakpoint
CREATE INDEX "document_portal_shares_firm_client_idx" ON "document_portal_shares" USING btree ("firm_id","client_id");
--> statement-breakpoint
CREATE INDEX "document_portal_shares_firm_matter_idx" ON "document_portal_shares" USING btree ("firm_id","matter_id");
