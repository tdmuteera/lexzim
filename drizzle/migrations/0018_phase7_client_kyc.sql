ALTER TABLE "clients" ADD COLUMN "client_number" text;
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "first_name" text;
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "surname" text;
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "other_names" text;
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "maiden_name" text;
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "date_of_birth" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "nationality" text;
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "id_number" text;
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "whatsapp" text;
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "residential_address" text;
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "occupation" text;
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "employer" text;
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "pep_status" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "pep_details" text;
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "registered_name" text;
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "reg_tax_number" text;
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "incorporation_date" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "incorporation_country" text;
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "registered_address" text;
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "business_address" text;
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "industry" text;
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "ubo_json" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "matter_scope_purpose" text;
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "source_of_funds" text;
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "source_of_funds_other" text;
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "kyc_documents_json" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "declaration_signed_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "declaration_signatory" text;
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "kyc_status" text DEFAULT 'draft' NOT NULL;
--> statement-breakpoint
UPDATE "clients" SET "client_type" = 'corporate' WHERE "client_type" = 'company';
--> statement-breakpoint
UPDATE "clients" SET "id_number" = "national_id_or_reg_number" WHERE "id_number" IS NULL AND "national_id_or_reg_number" IS NOT NULL;
--> statement-breakpoint
UPDATE "clients" SET "residential_address" = "physical_address" WHERE "residential_address" IS NULL AND "physical_address" IS NOT NULL;
--> statement-breakpoint
UPDATE "clients" SET "registered_name" = COALESCE("legal_name", "registered_name") WHERE "registered_name" IS NULL;
--> statement-breakpoint
UPDATE "clients" SET "reg_tax_number" = "tax_number" WHERE "reg_tax_number" IS NULL AND "tax_number" IS NOT NULL;
--> statement-breakpoint
UPDATE "clients" SET "registered_address" = "physical_address" WHERE "registered_address" IS NULL AND "physical_address" IS NOT NULL AND "client_type" = 'corporate';
--> statement-breakpoint
UPDATE "clients" SET "first_name" = split_part(trim("full_name"), ' ', 1) WHERE "first_name" IS NULL AND "full_name" IS NOT NULL AND "client_type" = 'individual';
--> statement-breakpoint
UPDATE "clients" SET "surname" = NULLIF(trim(substring(trim("full_name") from position(' ' in trim("full_name")) + 1)), '') WHERE "surname" IS NULL AND "full_name" IS NOT NULL AND position(' ' in trim("full_name")) > 0 AND "client_type" = 'individual';
--> statement-breakpoint
UPDATE "clients" SET "surname" = split_part(trim("full_name"), ' ', 1) WHERE "surname" IS NULL AND "first_name" IS NOT NULL AND "full_name" IS NOT NULL AND "client_type" = 'individual';
--> statement-breakpoint
UPDATE "clients" SET "whatsapp" = "alt_phone" WHERE "whatsapp" IS NULL AND "alt_phone" IS NOT NULL;
--> statement-breakpoint
WITH numbered AS (
  SELECT id, 'CL' || lpad(row_number() OVER (PARTITION BY firm_id ORDER BY created_at)::text, 4, '0') AS num
  FROM "clients"
)
UPDATE "clients" SET "client_number" = numbered.num FROM numbered WHERE "clients".id = numbered.id AND "clients"."client_number" IS NULL;
--> statement-breakpoint
ALTER TABLE "clients" ALTER COLUMN "client_number" SET NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "clients_firm_client_number_uid" ON "clients" USING btree ("firm_id","client_number");
--> statement-breakpoint
CREATE INDEX "clients_firm_id_number_idx" ON "clients" USING btree ("firm_id","id_number");
--> statement-breakpoint
CREATE INDEX "clients_firm_whatsapp_idx" ON "clients" USING btree ("firm_id","whatsapp");
