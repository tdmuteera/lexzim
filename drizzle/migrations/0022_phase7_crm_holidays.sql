CREATE TABLE IF NOT EXISTS "firm_holidays" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "firm_id" uuid NOT NULL REFERENCES "firms"("id") ON DELETE CASCADE,
  "holiday_date" timestamp with time zone NOT NULL,
  "name" text NOT NULL,
  "country" text NOT NULL DEFAULT 'ZW',
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "firm_holidays_firm_date_idx" ON "firm_holidays" ("firm_id", "holiday_date");
