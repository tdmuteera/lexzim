-- Fee vault destination for firm fee cash on hand (not trust).
-- destination remains free text; this updates the column comment only.
COMMENT ON COLUMN "finance_payment_intakes"."destination" IS
  'trust_bank | trust_vault | fee_bank | fee_vault';
