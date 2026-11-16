import { AuthError } from "@/lib/auth/types";
import { dollarsToCents } from "@/lib/billing/money";
import { isExpenseCategoryOrGlCode } from "@/lib/finance/expense-gl-tree";

export const RECURRING_KINDS = ["expense", "creditor_bill", "fee_invoice"] as const;
export type RecurringKind = (typeof RECURRING_KINDS)[number];

export const RECURRING_MODES = ["scheduled", "reminder", "unscheduled"] as const;
export type RecurringMode = (typeof RECURRING_MODES)[number];

export const RECURRING_INTERVALS = ["weekly", "monthly", "yearly"] as const;
export type RecurringInterval = (typeof RECURRING_INTERVALS)[number];

function trimOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t.length ? t : null;
}

function requireIsoDate(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    throw new AuthError("validation", `${label} must be YYYY-MM-DD.`);
  }
  const d = new Date(value.trim() + "T12:00:00.000Z");
  if (Number.isNaN(d.getTime())) {
    throw new AuthError("validation", `${label} is invalid.`);
  }
  return value.trim();
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

export type ExpensePayload = {
  category: string;
  payee: string;
  paymentSource: "cash" | "ap" | "petty" | "cashbook";
  notes: string | null;
};

export type CreditorBillPayload = {
  creditorId: string;
  reference: string | null;
  notes: string | null;
  dueDays: number;
  expenseAccountId: string | null;
};

export type FeeInvoiceLinePayload = {
  description: string;
  qty: number;
  unitPriceCents: number;
  firmServiceId?: string | null;
};

export type FeeInvoicePayload = {
  clientId: string;
  matterId: string;
  notes: string | null;
  subject: string | null;
  lines: FeeInvoiceLinePayload[];
};

export type RecurringTemplateInput = {
  name: string;
  kind: RecurringKind;
  mode: RecurringMode;
  intervalUnit: RecurringInterval;
  intervalCount: number;
  nextRunOn: string;
  endOn: string | null;
  isActive: boolean;
  currency: string;
  amountCents: number | null;
  payload: ExpensePayload | CreditorBillPayload | FeeInvoicePayload;
};

function parseExpensePayload(raw: Record<string, unknown>): ExpensePayload {
  const payee = typeof raw.payee === "string" ? raw.payee.trim() : "";
  if (!payee) throw new AuthError("validation", "Payee is required.");
  if (!isExpenseCategoryOrGlCode(raw.category)) {
    throw new AuthError("validation", "Invalid expense category.");
  }
  const paymentSource = (trimOrNull(raw.paymentSource) ?? "cash") as ExpensePayload["paymentSource"];
  if (!["cash", "ap", "petty", "cashbook"].includes(paymentSource)) {
    throw new AuthError("validation", "paymentSource is invalid.");
  }
  return {
    category: String(raw.category),
    payee,
    paymentSource,
    notes: trimOrNull(raw.notes),
  };
}

function parseCreditorPayload(raw: Record<string, unknown>): CreditorBillPayload {
  const creditorId = trimOrNull(raw.creditorId);
  if (!creditorId) throw new AuthError("validation", "creditorId is required.");
  const dueDaysRaw = raw.dueDays == null || raw.dueDays === "" ? 14 : Number(raw.dueDays);
  if (!Number.isInteger(dueDaysRaw) || dueDaysRaw < 0 || dueDaysRaw > 365) {
    throw new AuthError("validation", "dueDays must be 0–365.");
  }
  return {
    creditorId,
    reference: trimOrNull(raw.reference),
    notes: trimOrNull(raw.notes),
    dueDays: dueDaysRaw,
    expenseAccountId: trimOrNull(raw.expenseAccountId),
  };
}

function parseFeePayload(raw: Record<string, unknown>): FeeInvoicePayload {
  const clientId = trimOrNull(raw.clientId);
  const matterId = trimOrNull(raw.matterId);
  if (!clientId) throw new AuthError("validation", "clientId is required.");
  if (!matterId) throw new AuthError("validation", "matterId is required.");
  if (!Array.isArray(raw.lines) || raw.lines.length === 0) {
    throw new AuthError("validation", "At least one invoice line is required.");
  }
  const lines: FeeInvoiceLinePayload[] = raw.lines.map((line, i) => {
    if (!line || typeof line !== "object") {
      throw new AuthError("validation", `Line ${i + 1} is invalid.`);
    }
    const l = line as Record<string, unknown>;
    const description = typeof l.description === "string" ? l.description.trim() : "";
    if (!description) throw new AuthError("validation", `Line ${i + 1} needs a description.`);
    const qty = Number(l.qty ?? 1);
    if (!Number.isFinite(qty) || qty <= 0) {
      throw new AuthError("validation", `Line ${i + 1} qty is invalid.`);
    }
    let unitPriceCents: number;
    if (l.unitPriceCents != null && l.unitPriceCents !== "") {
      unitPriceCents = Number(l.unitPriceCents);
    } else {
      const dollars = dollarsToCents(l.unitPrice ?? l.unitPriceDollars);
      if (dollars == null) {
        throw new AuthError("validation", `Line ${i + 1} unit price is required.`);
      }
      unitPriceCents = dollars;
    }
    if (!Number.isInteger(unitPriceCents) || unitPriceCents < 0) {
      throw new AuthError("validation", `Line ${i + 1} unit price is invalid.`);
    }
    return {
      description,
      qty,
      unitPriceCents,
      firmServiceId: trimOrNull(l.firmServiceId),
    };
  });
  return {
    clientId,
    matterId,
    notes: trimOrNull(raw.notes),
    subject: trimOrNull(raw.subject),
    lines,
  };
}

export function parseRecurringTemplateInput(body: unknown): RecurringTemplateInput {
  if (!body || typeof body !== "object") {
    throw new AuthError("validation", "Invalid recurring template payload.");
  }
  const raw = body as Record<string, unknown>;
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!name) throw new AuthError("validation", "Name is required.");

  const kind = trimOrNull(raw.kind) as RecurringKind | null;
  if (!kind || !(RECURRING_KINDS as readonly string[]).includes(kind)) {
    throw new AuthError("validation", "kind must be expense, creditor_bill, or fee_invoice.");
  }
  const mode = (trimOrNull(raw.mode) ?? "scheduled") as RecurringMode;
  if (!(RECURRING_MODES as readonly string[]).includes(mode)) {
    throw new AuthError("validation", "mode is invalid.");
  }
  const intervalUnit = (trimOrNull(raw.intervalUnit) ?? "monthly") as RecurringInterval;
  if (!(RECURRING_INTERVALS as readonly string[]).includes(intervalUnit)) {
    throw new AuthError("validation", "intervalUnit is invalid.");
  }
  const intervalCount = Number(raw.intervalCount ?? 1);
  if (!Number.isInteger(intervalCount) || intervalCount < 1 || intervalCount > 52) {
    throw new AuthError("validation", "intervalCount must be 1–52.");
  }

  const payloadRaw =
    raw.payload && typeof raw.payload === "object"
      ? (raw.payload as Record<string, unknown>)
      : raw;

  let payload: RecurringTemplateInput["payload"];
  let amountCents: number | null = null;
  if (kind === "expense") {
    payload = parseExpensePayload(payloadRaw);
    amountCents = parsePositiveCents({ ...raw, ...payloadRaw });
  } else if (kind === "creditor_bill") {
    payload = parseCreditorPayload(payloadRaw);
    amountCents = parsePositiveCents({ ...raw, ...payloadRaw });
  } else {
    payload = parseFeePayload(payloadRaw);
    amountCents = null;
  }

  return {
    name,
    kind,
    mode,
    intervalUnit,
    intervalCount,
    nextRunOn: requireIsoDate(raw.nextRunOn, "nextRunOn"),
    endOn: raw.endOn ? requireIsoDate(raw.endOn, "endOn") : null,
    isActive: raw.isActive === false ? false : true,
    currency: trimOrNull(raw.currency) ?? "USD",
    amountCents,
    payload,
  };
}

/** Advance a YYYY-MM-DD by interval (UTC noon anchor). */
export function advanceRunDate(
  isoDate: string,
  unit: RecurringInterval,
  count: number,
): string {
  const d = new Date(isoDate + "T12:00:00.000Z");
  if (unit === "weekly") d.setUTCDate(d.getUTCDate() + 7 * count);
  else if (unit === "monthly") d.setUTCMonth(d.getUTCMonth() + count);
  else d.setUTCFullYear(d.getUTCFullYear() + count);
  return d.toISOString().slice(0, 10);
}

export function todayIsoHarareApprox(now = new Date()): string {
  // Africa/Harare is UTC+2 with no DST; good enough for due checks.
  const shifted = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}
