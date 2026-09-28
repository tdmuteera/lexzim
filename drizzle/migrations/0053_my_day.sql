-- My Day: private personal to-do list (owner-only; never emailed, never on the shared calendar).
CREATE TABLE IF NOT EXISTS "my_day_recurrences" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "firm_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "title" text NOT NULL,
  "notes" text,
  "tag" text,
  "due_time" text,
  "starred" boolean NOT NULL DEFAULT false,
  "rule" text NOT NULL,
  "weekday" integer,
  "month_day" integer,
  "starts_on" date NOT NULL,
  "last_generated_on" date,
  "client_id" uuid,
  "matter_id" uuid,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "my_day_recurrences_firm_id_firms_id_fk"
    FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "my_day_recurrences_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "my_day_recurrences_client_id_clients_id_fk"
    FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action,
  CONSTRAINT "my_day_recurrences_matter_id_matters_id_fk"
    FOREIGN KEY ("matter_id") REFERENCES "public"."matters"("id") ON DELETE set null ON UPDATE no action
);

CREATE INDEX IF NOT EXISTS "my_day_recurrences_owner_idx"
  ON "my_day_recurrences" ("firm_id", "user_id");

CREATE TABLE IF NOT EXISTS "my_day_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "firm_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "title" text NOT NULL,
  "notes" text,
  "due_date" date,
  "due_time" text,
  "original_date" date,
  "tag" text,
  "starred" boolean NOT NULL DEFAULT false,
  "status" text NOT NULL DEFAULT 'open',
  "carried_count" integer NOT NULL DEFAULT 0,
  "last_carried_on" date,
  "completed_on" date,
  "completed_at" timestamptz,
  "client_id" uuid,
  "matter_id" uuid,
  "calendar_event_id" uuid,
  "recurrence_id" uuid,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "my_day_items_firm_id_firms_id_fk"
    FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "my_day_items_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "my_day_items_client_id_clients_id_fk"
    FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action,
  CONSTRAINT "my_day_items_matter_id_matters_id_fk"
    FOREIGN KEY ("matter_id") REFERENCES "public"."matters"("id") ON DELETE set null ON UPDATE no action,
  CONSTRAINT "my_day_items_calendar_event_id_calendar_events_id_fk"
    FOREIGN KEY ("calendar_event_id") REFERENCES "public"."calendar_events"("id") ON DELETE set null ON UPDATE no action,
  CONSTRAINT "my_day_items_recurrence_id_my_day_recurrences_id_fk"
    FOREIGN KEY ("recurrence_id") REFERENCES "public"."my_day_recurrences"("id") ON DELETE set null ON UPDATE no action,
  CONSTRAINT "my_day_items_recurrence_occurrence_uid" UNIQUE ("recurrence_id", "original_date")
);

CREATE INDEX IF NOT EXISTS "my_day_items_owner_status_due_idx"
  ON "my_day_items" ("firm_id", "user_id", "status", "due_date");
CREATE INDEX IF NOT EXISTS "my_day_items_owner_completed_idx"
  ON "my_day_items" ("firm_id", "user_id", "completed_on");

CREATE TABLE IF NOT EXISTS "my_day_prefs" (
  "firm_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "last_review_on" date,
  "last_sync_on" date,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "my_day_prefs_firm_id_user_id_pk" PRIMARY KEY ("firm_id", "user_id"),
  CONSTRAINT "my_day_prefs_firm_id_firms_id_fk"
    FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "my_day_prefs_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
);
