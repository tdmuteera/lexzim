import { AuthError } from "@/lib/auth/types";
import { isExpenseCategoryOrGlCode } from "@/lib/finance/expense-gl-tree";

export const BANK_ACCOUNT_KINDS = ["business_bank", "trust_bank"] as const;
export type BankAccountKind = (typeof BANK_ACCOUNT_KINDS)[number];

export const BANK_LINE_STATUSES = ["pending", "matched", "ignored", "posted"] as const;
export type BankLineStatus = (typeof BANK_LINE_STATUSES)[number];

export const BANK_RULE_ACTIONS = [
  "ignore",
  "suggest_expense",
  "suggest_cashbook_in",
] as const;
export type BankRuleAction = (typeof BANK_RULE_ACTIONS)[number];

function trimOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t.length ? t : null;
}

export type CreateImportInput = {
  accountKind: BankAccountKind;
  bankAccountLabel: string | null;
  trustAccountId: string | null;
  currency: string;
  sourceFilename: string | null;
  notes: string | null;
  csvText: string;
};

export function parseCreateImportInput(body: unknown): CreateImportInput {
  if (!body || typeof body !== "object") {
    throw new AuthError("validation", "Invalid import payload.");
  }
  const raw = body as Record<string, unknown>;
  const accountKind = trimOrNull(raw.accountKind);
  if (accountKind !== "business_bank" && accountKind !== "trust_bank") {
    throw new AuthError("validation", "accountKind must be business_bank or trust_bank.");
  }
  const csvText = typeof raw.csvText === "string" ? raw.csvText : "";
  if (!csvText.trim()) throw new AuthError("validation", "csvText is required.");

  const bankAccountLabel = trimOrNull(raw.bankAccountLabel);
  const trustAccountId = trimOrNull(raw.trustAccountId);
  if (accountKind === "business_bank" && !bankAccountLabel) {
    throw new AuthError("validation", "bankAccountLabel is required for business bank imports.");
  }
  if (accountKind === "trust_bank" && !trustAccountId) {
    throw new AuthError("validation", "trustAccountId is required for trust bank imports.");
  }

  return {
    accountKind,
    bankAccountLabel: accountKind === "business_bank" ? bankAccountLabel : null,
    trustAccountId: accountKind === "trust_bank" ? trustAccountId : null,
    currency: trimOrNull(raw.currency) ?? "USD",
    sourceFilename: trimOrNull(raw.sourceFilename),
    notes: trimOrNull(raw.notes),
    csvText,
  };
}

export type MatchLineInput = {
  matchedEntityType: "cashbook" | "expense" | "fee_payment" | "trust_ledger";
  matchedEntityId: string;
};

export function parseMatchLineInput(body: unknown): MatchLineInput {
  if (!body || typeof body !== "object") {
    throw new AuthError("validation", "Invalid match payload.");
  }
  const raw = body as Record<string, unknown>;
  const matchedEntityType = trimOrNull(raw.matchedEntityType);
  const matchedEntityId = trimOrNull(raw.matchedEntityId);
  if (
    matchedEntityType !== "cashbook" &&
    matchedEntityType !== "expense" &&
    matchedEntityType !== "fee_payment" &&
    matchedEntityType !== "trust_ledger"
  ) {
    throw new AuthError("validation", "matchedEntityType is invalid.");
  }
  if (!matchedEntityId) throw new AuthError("validation", "matchedEntityId is required.");
  return { matchedEntityType, matchedEntityId };
}

export type PostExpenseFromLineInput = {
  category: string;
  payee: string;
  notes: string | null;
};

export function parsePostExpenseFromLineInput(body: unknown): PostExpenseFromLineInput {
  if (!body || typeof body !== "object") {
    throw new AuthError("validation", "Invalid post payload.");
  }
  const raw = body as Record<string, unknown>;
  const payee = typeof raw.payee === "string" ? raw.payee.trim() : "";
  if (!payee) throw new AuthError("validation", "Payee is required.");
  if (!isExpenseCategoryOrGlCode(raw.category)) {
    throw new AuthError("validation", "Invalid expense category or GL code.");
  }
  return {
    category: String(raw.category),
    payee,
    notes: trimOrNull(raw.notes),
  };
}

export type BankRuleInput = {
  name: string;
  direction: "in" | "out" | "any";
  matchField: "description" | "reference";
  matchType: "contains" | "starts_with" | "equals";
  matchValue: string;
  priority: number;
  action: BankRuleAction;
  expenseCategory: string | null;
  defaultPayee: string | null;
  isActive: boolean;
};

export function parseBankRuleInput(body: unknown): BankRuleInput {
  if (!body || typeof body !== "object") {
    throw new AuthError("validation", "Invalid rule payload.");
  }
  const raw = body as Record<string, unknown>;
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!name) throw new AuthError("validation", "Rule name is required.");
  const matchValue = typeof raw.matchValue === "string" ? raw.matchValue.trim() : "";
  if (!matchValue) throw new AuthError("validation", "matchValue is required.");

  const direction = (trimOrNull(raw.direction) ?? "any") as BankRuleInput["direction"];
  if (direction !== "in" && direction !== "out" && direction !== "any") {
    throw new AuthError("validation", "direction must be in, out, or any.");
  }
  const matchField = (trimOrNull(raw.matchField) ?? "description") as BankRuleInput["matchField"];
  if (matchField !== "description" && matchField !== "reference") {
    throw new AuthError("validation", "matchField must be description or reference.");
  }
  const matchType = (trimOrNull(raw.matchType) ?? "contains") as BankRuleInput["matchType"];
  if (matchType !== "contains" && matchType !== "starts_with" && matchType !== "equals") {
    throw new AuthError("validation", "matchType is invalid.");
  }
  const action = trimOrNull(raw.action) as BankRuleAction | null;
  if (!action || !(BANK_RULE_ACTIONS as readonly string[]).includes(action)) {
    throw new AuthError("validation", "action is invalid.");
  }
  if (action === "suggest_expense") {
    if (!isExpenseCategoryOrGlCode(raw.expenseCategory)) {
      throw new AuthError("validation", "expenseCategory required for suggest_expense.");
    }
  }
  const priorityRaw = raw.priority == null || raw.priority === "" ? 100 : Number(raw.priority);
  if (!Number.isInteger(priorityRaw) || priorityRaw < 1 || priorityRaw > 9999) {
    throw new AuthError("validation", "priority must be an integer from 1 to 9999.");
  }

  return {
    name,
    direction,
    matchField,
    matchType,
    matchValue,
    priority: priorityRaw,
    action,
    expenseCategory: action === "suggest_expense" ? String(raw.expenseCategory) : null,
    defaultPayee: trimOrNull(raw.defaultPayee),
    isActive: raw.isActive === false ? false : true,
  };
}
