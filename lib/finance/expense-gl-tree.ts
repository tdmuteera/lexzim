import "server-only";

import { DEFAULT_COA } from "@/lib/gl/coa-seed";
import { ensureCoaSeeded, getGlAccountByCode, listGlAccounts } from "@/lib/gl/accounts";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  type ExpenseCategory,
} from "@/lib/finance/expense-categories";

/** Legacy slug → GL code mapping. */
const LEGACY_CATEGORY_TO_GL: Record<ExpenseCategory, string> = {
  rent: "7010",
  utilities: "7020",
  software: "8050",
  travel: "9060",
  office: "9010",
  professional: "8030",
  salaries_placeholder: "6030",
  other: "9070",
};

export type ExpenseGlOption = {
  code: string;
  label: string;
  glAccountId?: string;
  band: string;
};

/** Bookkeeper expense tree: selectable GL leaf accounts (6000–9000). */
export function expenseGlOptionsFromCoa(): ExpenseGlOption[] {
  return DEFAULT_COA.filter(
    (row) =>
      !row.isGroup &&
      (row.type === "expense" || row.type === "direct_cost") &&
      row.code >= "6000",
  ).map((row) => ({
    code: row.code,
    label: `${row.code} · ${row.name}`,
    band: row.parentCode ?? row.code.slice(0, 1) + "000",
  }));
}

export async function listExpenseGlOptions(firmId: string): Promise<ExpenseGlOption[]> {
  await ensureCoaSeeded(firmId);
  const accounts = await listGlAccounts(firmId, { activeOnly: true });
  const byCode = new Map(accounts.map((a) => [a.code, a.id]));
  return expenseGlOptionsFromCoa().map((opt) => ({
    ...opt,
    glAccountId: byCode.get(opt.code),
  }));
}

export async function resolveExpenseGlAccountId(
  firmId: string,
  categoryOrCode: string,
): Promise<string> {
  await ensureCoaSeeded(firmId);

  if (/^\d{4}$/.test(categoryOrCode)) {
    const account = await getGlAccountByCode(firmId, categoryOrCode);
    if (account) return account.id;
  }

  if ((EXPENSE_CATEGORIES as readonly string[]).includes(categoryOrCode)) {
    const code = LEGACY_CATEGORY_TO_GL[categoryOrCode as ExpenseCategory];
    const account = await getGlAccountByCode(firmId, code);
    if (account) return account.id;
  }

  const fallback = await getGlAccountByCode(firmId, "9070");
  if (!fallback) throw new Error("Default expense account 9070 missing.");
  return fallback.id;
}

export function legacyCategoryLabel(category: string): string {
  if ((EXPENSE_CATEGORIES as readonly string[]).includes(category)) {
    return EXPENSE_CATEGORY_LABELS[category as ExpenseCategory];
  }
  const opt = expenseGlOptionsFromCoa().find((o) => o.code === category);
  return opt?.label ?? category;
}

export function isExpenseCategoryOrGlCode(value: unknown): boolean {
  if (typeof value !== "string") return false;
  if ((EXPENSE_CATEGORIES as readonly string[]).includes(value)) return true;
  return /^\d{4}$/.test(value) && expenseGlOptionsFromCoa().some((o) => o.code === value);
}
