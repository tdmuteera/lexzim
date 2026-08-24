/**
 * Firm banking details for printed invoices (stored as JSON in firm_settings).
 */
export type InvoiceBankingDetails = {
  accountName: string;
  bank: string;
  accountNumber: string;
  branch: string;
  accountType: string;
  swiftCode: string;
  branchCode: string;
};

export const EMPTY_INVOICE_BANKING: InvoiceBankingDetails = {
  accountName: "",
  bank: "",
  accountNumber: "",
  branch: "",
  accountType: "",
  swiftCode: "",
  branchCode: "",
};

export function parseInvoiceBanking(raw: string | null | undefined): InvoiceBankingDetails {
  if (!raw?.trim()) return { ...EMPTY_INVOICE_BANKING };
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const str = (key: string) =>
      typeof parsed[key] === "string" ? (parsed[key] as string).trim() : "";
    return {
      accountName: str("accountName"),
      bank: str("bank"),
      accountNumber: str("accountNumber"),
      branch: str("branch"),
      accountType: str("accountType"),
      swiftCode: str("swiftCode"),
      branchCode: str("branchCode"),
    };
  } catch {
    return { ...EMPTY_INVOICE_BANKING };
  }
}

export function serializeInvoiceBanking(details: InvoiceBankingDetails): string {
  return JSON.stringify({
    accountName: details.accountName.trim(),
    bank: details.bank.trim(),
    accountNumber: details.accountNumber.trim(),
    branch: details.branch.trim(),
    accountType: details.accountType.trim(),
    swiftCode: details.swiftCode.trim(),
    branchCode: details.branchCode.trim(),
  });
}

export function hasAnyBanking(details: InvoiceBankingDetails): boolean {
  return Object.values(details).some((v) => Boolean(v?.trim()));
}
