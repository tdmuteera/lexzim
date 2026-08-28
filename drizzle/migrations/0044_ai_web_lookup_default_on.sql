-- AI UX: trusted web lookup ON by default for all firms.

ALTER TABLE "ai_settings" ALTER COLUMN "web_lookup_enabled" SET DEFAULT true;

UPDATE "ai_settings" SET "web_lookup_enabled" = true WHERE "web_lookup_enabled" = false;
