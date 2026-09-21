/**
 * Locked Pro Forma policy (firm-wide).
 * Stamp duty prefills use Finance Act Cap 23:04 progressive bands (foreign currency).
 * Every prefilled amount remains editable on the form.
 */

export const PROFORMA_KINDS = ["legal_fees", "conveyancing"] as const;
export type ProformaKind = (typeof PROFORMA_KINDS)[number];

export const CONVEYANCING_CATEGORIES = [
  "registered_title",
  "cession",
  "commercial",
] as const;
export type ConveyancingCategory = (typeof CONVEYANCING_CATEGORIES)[number];

export const PROFORMA_STATUSES = ["draft", "sent", "void"] as const;
export type ProformaStatus = (typeof PROFORMA_STATUSES)[number];

export const PROFORMA_LINE_CODES = [
  "stamp_duty",
  "registration_fee",
  "conveyancing_fee",
  "cession_fee",
  "vat",
  "admin_fee",
  "disbursement",
  "custom",
  "fee",
] as const;
export type ProformaLineCode = (typeof PROFORMA_LINE_CODES)[number];

export const PROFORMA_MONEY_CLASSES = ["firm_income", "client_collectible"] as const;
export type ProformaMoneyClass = (typeof PROFORMA_MONEY_CLASSES)[number];

export function moneyClassForLineCode(code: ProformaLineCode): ProformaMoneyClass {
  if (code === "conveyancing_fee" || code === "fee") return "firm_income";
  return "client_collectible";
}

export function defaultProformaSubject(
  kind: ProformaKind,
  category: ConveyancingCategory | null,
): string {
  if (kind === "legal_fees") return "RE: PRO FORMA — LEGAL FEES";
  if (category === "cession") return "RE: PRO FORMA — CESSION";
  if (category === "commercial") return "RE: PRO FORMA — COMMERCIAL PROPERTY";
  return "RE: PRO FORMA — REGISTERED TITLE";
}

export function moneyClassLabel(cls: ProformaMoneyClass): string {
  return cls === "firm_income" ? "Firm fees (earnings)" : "Collectibles (pay onward)";
}

export const DEFAULT_CONVEYANCING_RATE_PCT = 3;
export const COMMERCIAL_VAT_RATE_PCT = 15.5;

/** Deeds fee when stamp duty is payable (S.I. 76 / 2025 schedule pattern). */
export const REGISTRATION_FEE_WITH_STAMP_DUTY = 20;
/** Deeds fee when stamp duty is not payable. */
export const REGISTRATION_FEE_WITHOUT_STAMP_DUTY = 50;

export function isProformaKind(value: string): value is ProformaKind {
  return (PROFORMA_KINDS as readonly string[]).includes(value);
}

export function isConveyancingCategory(value: string): value is ConveyancingCategory {
  return (CONVEYANCING_CATEGORIES as readonly string[]).includes(value);
}

export function isProformaStatus(value: string): value is ProformaStatus {
  return (PROFORMA_STATUSES as readonly string[]).includes(value);
}

export function proformaKindLabel(kind: ProformaKind): string {
  if (kind === "legal_fees") return "Legal fees (draft)";
  return "Conveyancing";
}

export function conveyancingCategoryLabel(cat: ConveyancingCategory): string {
  if (cat === "registered_title") return "Registered title";
  if (cat === "cession") return "Cession";
  return "Commercial";
}

export function proformaStatusLabel(status: ProformaStatus): string {
  if (status === "draft") return "Draft";
  if (status === "sent") return "Sent";
  return "Void";
}
