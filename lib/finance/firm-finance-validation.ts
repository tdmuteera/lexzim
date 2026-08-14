import { AuthError } from "@/lib/auth/types";
import { dollarsToCents } from "@/lib/billing/money";
import {
  isCashbookEntryType,
} from "@/lib/finance/expense-categories";
import { isExpenseCategoryOrGlCode } from "@/lib/finance/expense-gl-tree";

function trimOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function parseDate(value: unknown, label: string): Date {
  if (typeof value !== "string" || !value.trim()) {
    throw new AuthError("validation", `${label} is required.`);
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new AuthError("validation", `${label} is invalid.`);
  }
  return d;
}

function parsePositiveCents(raw: Record<string, unknown>): number {
  if ("amountCents" in raw && raw.amountCents != null && raw.amountCents !== "") {
    const n = Number(raw.amountCents);
    if (!Number.isInteger(n) || n < 1) {
      throw new AuthError("validation", "amountCents must be a positive integer.");
    }
    return n;
  }
  const dollars = dollarsToCents(raw.amount ?? raw.amountDollars);
  if (dollars == null || dollars < 1) {
    throw new AuthError("validation", "Amount must be greater than zero.");
  }
  return dollars;
}

export type ExpenseInput = {
  expenseDate: Date;
  category: string;
  payee: string;
  amountCents: number;
  currency: string;
  matterId: string | null;
  paymentMethod: string | null;
  notes: string | null;
  glAccountId: string | null;
  paymentSource: "cash" | "ap" | "petty";
  budgetMonth: string | null;
};

export type CashbookEntryInput = {
  entryDate: Date;
  entryType: "in" | "out";
  amountCents: number;
  currency: string;
  reference: string | null;
  bankAccountLabel: string | null;
  expenseId: string | null;
  feePaymentId: string | null;
  notes: string | null;
};

export function parseExpenseInput(
  body: unknown,
  defaults?: { currency?: string },
): ExpenseInput {
  if (!body || typeof body !== "object") {
    throw new AuthError("validation", "Invalid expense payload.");
  }
  const raw = body as Record<string, unknown>;
  const payee = typeof raw.payee === "string" ? raw.payee.trim() : "";
  if (!payee) throw new AuthError("validation", "Payee is required.");
  if (!isExpenseCategoryOrGlCode(raw.category)) {
    throw new AuthError("validation", "Invalid expense category or GL code.");
  }

  const paymentSourceRaw = trimOrNull(raw.paymentSource) ?? "cash";
  if (paymentSourceRaw !== "cash" && paymentSourceRaw !== "ap" && paymentSourceRaw !== "petty") {
    throw new AuthError("validation", "paymentSource must be cash, ap, or petty.");
  }

  return {
    expenseDate: parseDate(raw.expenseDate, "Expense date"),
    category: String(raw.category),
    payee,
    amountCents: parsePositiveCents(raw),
    currency: trimOrNull(raw.currency) ?? defaults?.currency ?? "USD",
    matterId: trimOrNull(raw.matterId),
    paymentMethod: trimOrNull(raw.paymentMethod),
    notes: trimOrNull(raw.notes),
    glAccountId: trimOrNull(raw.glAccountId),
    paymentSource: paymentSourceRaw,
    budgetMonth: trimOrNull(raw.budgetMonth),
  };
}

export function parseCashbookEntryInput(
  body: unknown,
  defaults?: { currency?: string },
): CashbookEntryInput {
  if (!body || typeof body !== "object") {
    throw new AuthError("validation", "Invalid cashbook payload.");
  }
  const raw = body as Record<string, unknown>;
  if (!isCashbookEntryType(raw.entryType)) {
    throw new AuthError("validation", "entryType must be in or out.");
  }

  return {
    entryDate: parseDate(raw.entryDate, "Entry date"),
    entryType: raw.entryType,
    amountCents: parsePositiveCents(raw),
    currency: trimOrNull(raw.currency) ?? defaults?.currency ?? "USD",
    reference: trimOrNull(raw.reference),
    bankAccountLabel: trimOrNull(raw.bankAccountLabel),
    expenseId: trimOrNull(raw.expenseId),
    feePaymentId: trimOrNull(raw.feePaymentId),
    notes: trimOrNull(raw.notes),
  };
}
