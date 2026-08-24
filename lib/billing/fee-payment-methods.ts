/** Fee payment method labels (safe for client and server). */
export const FEE_PAYMENT_METHODS = [
  "Bank deposit (confirmed)",
  "EFT (confirmed)",
  "RTGS (confirmed)",
  "Cash",
  "Card",
  "Other",
] as const;

export type FeePaymentMethod = (typeof FEE_PAYMENT_METHODS)[number];
