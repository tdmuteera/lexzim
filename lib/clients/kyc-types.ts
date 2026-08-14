/** KYC / client registry types (Phase 7 P7-04). */

export type ClientType = "individual" | "corporate" | "partnership" | "trust";

export type KycStatus = "draft" | "complete" | "review_due";

export type SourceOfFunds =
  | "salary_employment"
  | "business_income"
  | "savings"
  | "inheritance"
  | "sale_of_asset"
  | "loan"
  | "gift"
  | "other";

export type UboRow = {
  fullName: string;
  dob?: string | null;
  nationality?: string | null;
  address?: string | null;
  controlPct?: number | null;
};

export type KycDocumentsChecklist = {
  idDocument?: boolean;
  proofOfAddress?: boolean;
  companyRegistration?: boolean;
  taxClearance?: boolean;
  trustDeed?: boolean;
  otherNotes?: string | null;
  fileIds?: string[];
};

/** Normalize legacy company → corporate */
export function normalizeClientType(value: string): ClientType {
  if (value === "company") return "corporate";
  if (
    value === "individual" ||
    value === "corporate" ||
    value === "partnership" ||
    value === "trust"
  ) {
    return value;
  }
  return "individual";
}

export function clientTypeLabel(type: string): string {
  const t = normalizeClientType(type);
  if (t === "individual") return "Individual";
  if (t === "corporate") return "Corporate";
  if (t === "partnership") return "Partnership";
  return "Trust";
}

export const CLIENT_TYPES: ClientType[] = ["individual", "corporate", "partnership", "trust"];

export const SOURCE_OF_FUNDS_OPTIONS: { value: SourceOfFunds; label: string }[] = [
  { value: "salary_employment", label: "Salary / employment income" },
  { value: "business_income", label: "Business income" },
  { value: "savings", label: "Personal savings" },
  { value: "inheritance", label: "Inheritance" },
  { value: "sale_of_asset", label: "Sale of asset" },
  { value: "loan", label: "Loan / financing" },
  { value: "gift", label: "Gift" },
  { value: "other", label: "Other (specify)" },
];

export const KYC_STATUS_OPTIONS: { value: KycStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "complete", label: "Complete" },
  { value: "review_due", label: "Review due" },
];
