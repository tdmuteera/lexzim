-- T Pfigu-style invoice letterhead fields.

ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "subject" text;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "payment_terms" text;
ALTER TABLE "invoice_lines" ADD COLUMN IF NOT EXISTS "work_date" timestamp with time zone;

-- Seed T Pfigu Attorneys letterhead + banking when that firm exists (Isolation keeps its own).
INSERT INTO firm_settings (firm_id, key, value, updated_at)
SELECT f.id, 'invoice_attorney_line', 'Ms. T Pfigu 15-19years 11 months of experience', NOW()
FROM firms f
WHERE f.name ILIKE '%pfigu%'
ON CONFLICT (firm_id, key) DO NOTHING;

INSERT INTO firm_settings (firm_id, key, value, updated_at)
SELECT f.id, 'invoice_payment_note',
  'Payment may be made in cash at the office or into the following Zimbabwe Nostro Bank Account. Please note that the invoice is a proforma invoice subject to change if matter becomes contested.',
  NOW()
FROM firms f
WHERE f.name ILIKE '%pfigu%'
ON CONFLICT (firm_id, key) DO NOTHING;

INSERT INTO firm_settings (firm_id, key, value, updated_at)
SELECT f.id, 'invoice_closing_note', 'Thank you for your business!!!', NOW()
FROM firms f
WHERE f.name ILIKE '%pfigu%'
ON CONFLICT (firm_id, key) DO NOTHING;

INSERT INTO firm_settings (firm_id, key, value, updated_at)
SELECT f.id, 'invoice_banking',
  '{"accountName":"T PFIGU ATTORNEYS","bank":"CBZ","accountNumber":"04726054720010","branch":"SELOUS","accountType":"NOSTRO","swiftCode":"COBZZWHA","branchCode":"(021)"}',
  NOW()
FROM firms f
WHERE f.name ILIKE '%pfigu%'
ON CONFLICT (firm_id, key) DO NOTHING;

UPDATE firms
SET
  address_line1 = COALESCE(NULLIF(TRIM(address_line1), ''), '187 Josiah Chinamano'),
  address_line2 = COALESCE(NULLIF(TRIM(address_line2), ''), '8 Windsor Park'),
  city = COALESCE(NULLIF(TRIM(city), ''), 'Avenues'),
  country = COALESCE(NULLIF(TRIM(country), ''), 'HARARE'),
  updated_at = NOW()
WHERE name ILIKE '%pfigu%';
