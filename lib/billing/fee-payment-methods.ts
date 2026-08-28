/** Fee payment method labels (safe for client and server). */

/** Primary channel for P10-08 UI: cash vs bank. */
export const FEE_PAYMENT_CHANNELS = ["Cash", "Bank"] as const;
export type FeePaymentChannel = (typeof FEE_PAYMENT_CHANNELS)[number];

/** Bank subtypes stored on fee_payments.method when channel is Bank. */
export const FEE_BANK_METHODS = [
  "Bank deposit (confirmed)",
  "EFT (confirmed)",
  "RTGS (confirmed)",
] as const;

export const FEE_PAYMENT_METHODS = [
  "Cash",
  ...FEE_BANK_METHODS,
  "Card",
  "Other",
] as const;

export type FeePaymentMethod = (typeof FEE_PAYMENT_METHODS)[number];

export function isBankFeePaymentMethod(method: string | null | undefined): boolean {
  if (!method?.trim()) return false;
  return /bank|eft|rtgs|deposit|nostro/i.test(method);
}

export function isCashFeePaymentMethod(method: string | null | undefined): boolean {
  if (!method?.trim()) return false;
  return /^cash$/i.test(method.trim());
}

/** Human channel label for receipts / UI. */
export function feePaymentChannelLabel(method: string | null | undefined): "Cash" | "Bank" | "Other" {
  if (isCashFeePaymentMethod(method)) return "Cash";
  if (isBankFeePaymentMethod(method)) return "Bank";
  return "Other";
}
