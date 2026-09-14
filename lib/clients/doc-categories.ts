/** Client / KYC document categories for uploads. */

export const CLIENT_DOC_CATEGORIES = [
  { value: "kyc_id_document", label: "ID document" },
  { value: "kyc_proof_of_address", label: "Proof of address" },
  { value: "kyc_company_registration", label: "Company registration" },
  { value: "kyc_tax_clearance", label: "Tax clearance" },
  { value: "kyc_trust_deed", label: "Trust deed / trust document" },
  { value: "other", label: "Other document" },
] as const;

export type ClientDocCategory = (typeof CLIENT_DOC_CATEGORIES)[number]["value"];

export function isClientDocCategory(value: string): value is ClientDocCategory {
  return CLIENT_DOC_CATEGORIES.some((c) => c.value === value);
}

export function clientDocCategoryLabel(value: string | null | undefined): string {
  const found = CLIENT_DOC_CATEGORIES.find((c) => c.value === value);
  if (found) return found.label;
  if (!value || value === "uploaded") return "Uploaded";
  return value;
}
