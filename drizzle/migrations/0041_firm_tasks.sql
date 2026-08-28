-- Phase 10 P10-11: firm tasks (not matter pending_procedures).

CREATE TABLE IF NOT EXISTS "firm_tasks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "firm_id" uuid NOT NULL REFERENCES "firms"("id") ON DELETE cascade,
  "title" text NOT NULL,
  "description" text,
  "assignee_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "assigner_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "due_at" timestamp with time zone,
  "priority" text NOT NULL DEFAULT 'normal',
  "status" text NOT NULL DEFAULT 'pending',
  "completion_feedback" text,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "firm_tasks_firm_assignee_status_idx"
  ON "firm_tasks" ("firm_id", "assignee_user_id", "status");
CREATE INDEX IF NOT EXISTS "firm_tasks_firm_assigner_idx"
  ON "firm_tasks" ("firm_id", "assigner_user_id");
CREATE INDEX IF NOT EXISTS "firm_tasks_firm_due_idx"
  ON "firm_tasks" ("firm_id", "due_at");
