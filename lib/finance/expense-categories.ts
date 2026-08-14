/** Firm expense categories (app validation, not DB enum). */
export const EXPENSE_CATEGORIES = [
  "rent",
  "utilities",
  "software",
  "travel",
  "office",
  "professional",
  "salaries_placeholder",
  "other",
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  rent: "Rent",
  utilities: "Utilities",
  software: "Software & subscriptions",
  travel: "Travel",
  office: "Office supplies",
  professional: "Professional fees",
  salaries_placeholder: "Salaries (payroll Phase 6B)",
  other: "Other",
};

export function isExpenseCategory(value: unknown): value is ExpenseCategory {
  return typeof value === "string" && (EXPENSE_CATEGORIES as readonly string[]).includes(value);
}

export const CASHBOOK_ENTRY_TYPES = ["in", "out"] as const;
export type CashbookEntryType = (typeof CASHBOOK_ENTRY_TYPES)[number];

export function isCashbookEntryType(value: unknown): value is CashbookEntryType {
  return typeof value === "string" && (CASHBOOK_ENTRY_TYPES as readonly string[]).includes(value);
}
