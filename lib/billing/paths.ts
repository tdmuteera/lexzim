/** Canonical Finance invoicing list (Phase 6). */
export const INVOICING_LIST_PATH = "/finance/invoicing";

/** Legacy alias preserved for bookmarks. */
export const LEGACY_BILLING_LIST_PATH = "/billing";

export function invoiceDetailPath(invoiceId: string): string {
  return `/finance/invoicing/invoices/${invoiceId}`;
}

export function legacyInvoiceDetailPath(invoiceId: string): string {
  return `/billing/invoices/${invoiceId}`;
}
