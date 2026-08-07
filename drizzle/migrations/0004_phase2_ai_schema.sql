-- Phase 2 AI schema (P2-01). Requires pgvector.
CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TABLE "ai_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firm_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"mode" text NOT NULL,
	"matter_id" uuid,
	"title" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ai_embeddings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_type" text NOT NULL,
	"owner_id" uuid NOT NULL,
	"firm_id" uuid,
	"embedding" vector(768) NOT NULL,
	"model_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_embeddings_owner_uid" UNIQUE("owner_type","owner_id","model_name")
);
--> statement-breakpoint
CREATE TABLE "ai_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"firm_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"confidence" real,
	"citations_json" jsonb DEFAULT '[]'::jsonb,
	"retrieval_meta_json" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_settings" (
	"firm_id" uuid PRIMARY KEY NOT NULL,
	"provider_default" text DEFAULT 'gemini' NOT NULL,
	"model_default" text DEFAULT 'gemini-2.0-flash' NOT NULL,
	"embeddings_model" text DEFAULT 'text-embedding-004' NOT NULL,
	"web_lookup_enabled" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_usage_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firm_id" uuid NOT NULL,
	"user_id" uuid,
	"provider" text NOT NULL,
	"model" text,
	"mode" text,
	"success" boolean DEFAULT true NOT NULL,
	"error_code" text,
	"latency_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"firm_id" uuid,
	"chunk_index" integer NOT NULL,
	"heading_path" text,
	"text" text NOT NULL,
	"token_estimate" integer,
	"metadata_json" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_chunks_source_index_uid" UNIQUE("source_id","chunk_index")
);
--> statement-breakpoint
CREATE TABLE "knowledge_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firm_id" uuid,
	"title" text NOT NULL,
	"source_type" text NOT NULL,
	"citation_label" text NOT NULL,
	"jurisdiction" text DEFAULT 'Zimbabwe' NOT NULL,
	"publisher" text,
	"source_url" text,
	"license_note" text,
	"version_label" text,
	"effective_date" text,
	"ingested_at" timestamp with time zone,
	"content_hash" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_matter_id_matters_id_fk" FOREIGN KEY ("matter_id") REFERENCES "public"."matters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_embeddings" ADD CONSTRAINT "ai_embeddings_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_conversation_id_ai_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."ai_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_settings" ADD CONSTRAINT "ai_settings_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_events" ADD CONSTRAINT "ai_usage_events_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_events" ADD CONSTRAINT "ai_usage_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_source_id_knowledge_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."knowledge_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD CONSTRAINT "knowledge_sources_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_conversations_firm_id_idx" ON "ai_conversations" USING btree ("firm_id");--> statement-breakpoint
CREATE INDEX "ai_conversations_firm_user_idx" ON "ai_conversations" USING btree ("firm_id","user_id");--> statement-breakpoint
CREATE INDEX "ai_conversations_matter_id_idx" ON "ai_conversations" USING btree ("matter_id");--> statement-breakpoint
CREATE INDEX "ai_embeddings_firm_id_idx" ON "ai_embeddings" USING btree ("firm_id");--> statement-breakpoint
CREATE INDEX "ai_embeddings_owner_idx" ON "ai_embeddings" USING btree ("owner_type","owner_id");--> statement-breakpoint
CREATE INDEX "ai_embeddings_embedding_hnsw_idx" ON "ai_embeddings" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "ai_messages_conversation_id_idx" ON "ai_messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "ai_messages_firm_id_idx" ON "ai_messages" USING btree ("firm_id");--> statement-breakpoint
CREATE INDEX "ai_usage_events_firm_id_idx" ON "ai_usage_events" USING btree ("firm_id");--> statement-breakpoint
CREATE INDEX "ai_usage_events_created_at_idx" ON "ai_usage_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "knowledge_chunks_source_id_idx" ON "knowledge_chunks" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "knowledge_chunks_firm_id_idx" ON "knowledge_chunks" USING btree ("firm_id");--> statement-breakpoint
CREATE INDEX "knowledge_sources_firm_id_idx" ON "knowledge_sources" USING btree ("firm_id");--> statement-breakpoint
CREATE INDEX "knowledge_sources_active_idx" ON "knowledge_sources" USING btree ("is_active");