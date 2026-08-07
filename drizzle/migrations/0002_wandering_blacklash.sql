CREATE TABLE "platform_admins" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"full_name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_admins_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "firms" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "firms" ADD COLUMN "logo_url" text;--> statement-breakpoint
ALTER TABLE "firms" ADD COLUMN "contact_email" text;--> statement-breakpoint
ALTER TABLE "firms" ADD COLUMN "contact_phone" text;--> statement-breakpoint
ALTER TABLE "firms" ADD COLUMN "address_line1" text;--> statement-breakpoint
ALTER TABLE "firms" ADD COLUMN "address_line2" text;--> statement-breakpoint
ALTER TABLE "firms" ADD COLUMN "city" text;--> statement-breakpoint
ALTER TABLE "firms" ADD COLUMN "country" text;--> statement-breakpoint
ALTER TABLE "firms" ADD COLUMN "is_demo" boolean DEFAULT false NOT NULL;