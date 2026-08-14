ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "must_change_password" boolean DEFAULT false NOT NULL;

CREATE TABLE IF NOT EXISTS "password_reset_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "firm_id" uuid REFERENCES "firms"("id") ON DELETE CASCADE,
  "user_id" uuid REFERENCES "users"("id") ON DELETE CASCADE,
  "email" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "note" text,
  "requested_at" timestamp with time zone DEFAULT now() NOT NULL,
  "resolved_at" timestamp with time zone,
  "resolved_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "ip_or_user_agent" text
);

CREATE INDEX IF NOT EXISTS "password_reset_requests_firm_idx" ON "password_reset_requests" ("firm_id", "status");

CREATE INDEX IF NOT EXISTS "password_reset_requests_user_idx" ON "password_reset_requests" ("user_id");
