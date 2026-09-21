-- Pro forma: subject + line money classification for dashboard / finance visibility.
ALTER TABLE "pro_formas" ADD COLUMN IF NOT EXISTS "subject" text;

ALTER TABLE "pro_forma_lines" ADD COLUMN IF NOT EXISTS "money_class" text NOT NULL DEFAULT 'client_collectible';

UPDATE "pro_forma_lines" SET "money_class" = 'firm_income'
WHERE "line_code" IN ('conveyancing_fee', 'fee');

UPDATE "pro_forma_lines" SET "money_class" = 'client_collectible'
WHERE "line_code" NOT IN ('conveyancing_fee', 'fee')
  AND ("money_class" IS NULL OR "money_class" = '');
