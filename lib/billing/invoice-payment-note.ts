/**
 * Default invoice payment note + cleanup of the retired contested / pro forma clause.
 */

export const DEFAULT_INVOICE_PAYMENT_NOTE =
  "Payment may be made in cash at the office or into the following Zimbabwe Nostro Bank Account.";

/** Retired sentence (P10-06). Match common spellings and trailing punctuation. */
const CONTESTED_PROFORMA_CLAUSE =
  /\s*Please note that the invoice is a pro[\s-]?forma invoice subject to change if matter becomes contested\.?/gi;

/**
 * Strip the contested pro forma clause from stored firm payment notes.
 * Collapses leftover double spaces / trailing punctuation.
 */
export function sanitizeInvoicePaymentNote(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let cleaned = trimmed.replace(CONTESTED_PROFORMA_CLAUSE, " ").replace(/\s{2,}/g, " ").trim();
  cleaned = cleaned.replace(/\.\s*\./g, ".").trim();
  if (!cleaned) return DEFAULT_INVOICE_PAYMENT_NOTE;
  return cleaned;
}

export function resolveInvoicePaymentNote(stored: string | null | undefined): string {
  return sanitizeInvoicePaymentNote(stored) ?? DEFAULT_INVOICE_PAYMENT_NOTE;
}
