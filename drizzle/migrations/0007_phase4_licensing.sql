CREATE TABLE "firm_licences" (
	"firm_id" uuid PRIMARY KEY NOT NULL,
	"edition" text DEFAULT 'trial' NOT NULL,
	"seats" integer DEFAULT 3 NOT NULL,
	"features_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"notes" text,
	"issued_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "firm_licences" ADD CONSTRAINT "firm_licences_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE cascade ON UPDATE no action;
