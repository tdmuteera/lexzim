ALTER TABLE "ai_settings" ADD COLUMN "key_mode" text DEFAULT 'direct' NOT NULL;--> statement-breakpoint
CREATE TABLE "firm_ai_proxy" (
	"firm_id" uuid PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"token_prefix" text NOT NULL,
	"monthly_quota" integer DEFAULT 500 NOT NULL,
	"calls_this_month" integer DEFAULT 0 NOT NULL,
	"period_ym" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "firm_ai_proxy" ADD CONSTRAINT "firm_ai_proxy_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE cascade ON UPDATE no action;
