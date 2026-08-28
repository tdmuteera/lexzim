-- Phase 10 P10-06: drop contested / pro forma clause from firm invoice payment notes.
-- Keep cash + Zimbabwe Nostro bank wording.

UPDATE firm_settings
SET
  value = trim(
    both FROM regexp_replace(
      value,
      '\s*Please note that the invoice is a pro[\s-]?forma invoice subject to change if matter becomes contested\.?',
      '',
      'gi'
    )
  ),
  updated_at = NOW()
WHERE key = 'invoice_payment_note'
  AND value ~* 'pro[\s-]?forma invoice subject to change if matter becomes contested';

-- If stripping left an empty string, restore the default cash / Nostro note.
UPDATE firm_settings
SET
  value = 'Payment may be made in cash at the office or into the following Zimbabwe Nostro Bank Account.',
  updated_at = NOW()
WHERE key = 'invoice_payment_note'
  AND (value IS NULL OR trim(value) = '');
