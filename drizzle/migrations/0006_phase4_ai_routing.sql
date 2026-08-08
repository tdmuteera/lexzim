ALTER TABLE "ai_settings" ADD COLUMN "routing_mode" text DEFAULT 'auto' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_settings" ADD COLUMN "monthly_soft_budget" integer DEFAULT 500;--> statement-breakpoint
ALTER TABLE "ai_settings" ADD COLUMN "max_output_tokens" integer DEFAULT 1200 NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_settings" ADD COLUMN "matter_context_enabled" boolean DEFAULT true NOT NULL;
