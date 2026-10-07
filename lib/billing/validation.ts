import { AuthError } from "@/lib/auth/types";
import { dollarsToCents } from "@/lib/billing/money";

export type TimeEntryInput = {
  userId: string;
  workedAt: Date;
  minutes: number;
  billable: boolean;
  rateCents: number | null;
  currency: string | null;
  description: string | null;
};

export type DisbursementInput = {
  description: string;
  amountCents: number;
  currency: string;
  incurredAt: Date;
  /** Billable to client (schema column: billable). */
  billable: boolean;
  /** operating | trust | firm_float (float only via requisitions) — source of funds for GL posting. */
  paidFrom: "operating" | "trust" | "firm_float";
};

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

export function parseTimeEntryInput(
  body: unknown,
  defaults?: { currency?: string | null },
): TimeEntryInput {
  if (!body || typeof body !== "object") {
    throw new AuthError("validation", "Invalid time entry payload.");
  }
  const raw = body as Record<string, unknown>;

  const userId = typeof raw.userId === "string" ? raw.userId.trim() : "";
  if (!userId) {
    throw new AuthError("validation", "Fee earner (user) is required.");
  }

  const minutesRaw = raw.minutes;
  const minutes =
    typeof minutesRaw === "number"
      ? minutesRaw
      : typeof minutesRaw === "string"
        ? Number(minutesRaw)
        : NaN;
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 24 * 60) {
    throw new AuthError("validation", "Minutes must be an integer from 1 to 1440.");
  }

  let rateCents: number | null = null;
  if ("rateCents" in raw && raw.rateCents != null && raw.rateCents !== "") {
    const n =
      typeof raw.rateCents === "number"
        ? raw.rateCents
        : typeof raw.rateCents === "string"
          ? Number(raw.rateCents)
          : NaN;
    if (!Number.isInteger(n) || n < 0) {
      throw new AuthError("validation", "rateCents must be a non-negative integer.");
    }
    rateCents = n;
  } else if ("rate" in raw || "rateDollars" in raw) {
    const dollars = dollarsToCents(raw.rate ?? raw.rateDollars);
    if (dollars == null || dollars < 0) {
      throw new AuthError("validation", "Hourly rate is invalid.");
    }
    rateCents = dollars;
  }

  const currency =
    trimOrNull(raw.currency) ?? (defaults?.currency ? defaults.currency : null);

  return {
    userId,
    workedAt: parseDate(raw.workedAt, "Worked at"),
    minutes,
    billable: raw.billable === false ? false : true,
    rateCents,
    currency,
    description: trimOrNull(raw.description),
  };
}

export function parseDisbursementInput(
  body: unknown,
  defaults?: { currency?: string | null },
): DisbursementInput {
  if (!body || typeof body !== "object") {
    throw new AuthError("validation", "Invalid disbursement payload.");
  }
  const raw = body as Record<string, unknown>;

  const description =
    typeof raw.description === "string" ? raw.description.trim() : "";
  if (!description) {
    throw new AuthError("validation", "Description is required.");
  }
  if (description.length > 500) {
    throw new AuthError("validation", "Description must be 500 characters or fewer.");
  }

  let amountCents: number | null = null;
  if ("amountCents" in raw && raw.amountCents != null && raw.amountCents !== "") {
    const n =
      typeof raw.amountCents === "number"
        ? raw.amountCents
        : typeof raw.amountCents === "string"
          ? Number(raw.amountCents)
          : NaN;
    if (!Number.isInteger(n) || n < 1) {
      throw new AuthError("validation", "amountCents must be a positive integer.");
    }
    amountCents = n;
  } else {
    amountCents = dollarsToCents(raw.amount ?? raw.amountDollars);
    if (amountCents == null || amountCents < 1) {
      throw new AuthError("validation", "Amount must be greater than zero.");
    }
  }

  const currency =
    trimOrNull(raw.currency) ??
    (defaults?.currency ? String(defaults.currency) : "USD");

  const billableFlag =
    "billableToClient" in raw ? raw.billableToClient : raw.billable;

  const paidFromRaw = trimOrNull(raw.paidFrom) ?? "operating";
  if (paidFromRaw !== "operating" && paidFromRaw !== "trust") {
    throw new AuthError("validation", "paidFrom must be operating or trust.");
  }

  return {
    description,
    amountCents,
    currency,
    incurredAt: parseDate(raw.incurredAt, "Incurred at"),
    billable: billableFlag === false ? false : true,
    paidFrom: paidFromRaw,
  };
}

export type InvoiceStatusValue = "draft" | "sent" | "paid" | "overdue" | "void";

export const INVOICE_STATUSES: InvoiceStatusValue[] = [
  "draft",
  "sent",
  "paid",
  "overdue",
  "void",
];

export function isInvoiceStatus(value: unknown): value is InvoiceStatusValue {
  return typeof value === "string" && INVOICE_STATUSES.includes(value as InvoiceStatusValue);
}

export type CreateInvoiceInput = {
  matterId: string;
  notes: string | null;
  includeTime: boolean;
  includeDisbursements: boolean;
  timeEntryIds: string[] | null;
  disbursementIds: string[] | null;
};

export type ServiceInvoiceLineInput = {
  firmServiceId?: string | null;
  description: string;
  qty: number;
  unitPriceCents: number;
  revenueGlAccountId?: string | null;
  /** Work / service date for printed invoice Date column */
  workDate?: Date | null;
};

export type CreateServiceInvoiceInput = {
  clientId: string;
  matterId: string;
  notes?: string | null;
  /** RE: subject line on printed invoice */
  subject?: string | null;
  /** Payment terms column (e.g. "-" or "Cash") */
  paymentTerms?: string | null;
  discountCents?: number;
  discountPct?: number | null;
  currency?: string;
  lines: ServiceInvoiceLineInput[];
};

export type FeePaymentInput = {
  amountCents: number;
  currency: string;
  paidAt: Date;
  method: string | null;
  reference: string | null;
  notes: string | null;
  /** When set (e.g. Payments intake PAY-####), reuse that cash-event number instead of allocating RCP-####. */
  receiptNumber?: string | null;
  /** Cash asset GL: 1010 operating bank (default), 1020 business vault, or 1060 disbursement float. */
  cashGlCode?: "1010" | "1020" | "1060";
};

export function parseCreateInvoiceInput(body: unknown): CreateInvoiceInput {
  if (!body || typeof body !== "object") {
    throw new AuthError("validation", "Invalid invoice payload.");
  }
  const raw = body as Record<string, unknown>;
  const matterId = typeof raw.matterId === "string" ? raw.matterId.trim() : "";
  if (!matterId) {
    throw new AuthError("validation", "Matter is required.");
  }

  const timeEntryIds = Array.isArray(raw.timeEntryIds)
    ? raw.timeEntryIds.filter((id): id is string => typeof id === "string" && Boolean(id.trim()))
    : null;
  const disbursementIds = Array.isArray(raw.disbursementIds)
    ? raw.disbursementIds.filter((id): id is string => typeof id === "string" && Boolean(id.trim()))
    : null;

  return {
    matterId,
    notes: trimOrNull(raw.notes),
    includeTime: raw.includeTime === false ? false : true,
    includeDisbursements: raw.includeDisbursements === false ? false : true,
    timeEntryIds,
    disbursementIds,
  };
}

function parseServiceLine(raw: unknown, idx: number): ServiceInvoiceLineInput {
  if (!raw || typeof raw !== "object") {
    throw new AuthError("validation", `Invalid line at index ${idx}.`);
  }
  const line = raw as Record<string, unknown>;
  const description = typeof line.description === "string" ? line.description.trim() : "";
  if (!description) {
    throw new AuthError("validation", `Line ${idx + 1}: description is required.`);
  }
  const qty = Number(line.qty ?? 1);
  if (!Number.isFinite(qty) || qty <= 0) {
    throw new AuthError("validation", `Line ${idx + 1}: quantity must be positive.`);
  }
  let unitPriceCents: number | null = null;
  if (line.unitPriceCents != null && line.unitPriceCents !== "") {
    unitPriceCents = Number(line.unitPriceCents);
  } else {
    unitPriceCents = dollarsToCents(line.unitPrice ?? line.unitPriceDollars);
  }
  if (unitPriceCents == null || !Number.isInteger(unitPriceCents) || unitPriceCents < 0) {
    throw new AuthError("validation", `Line ${idx + 1}: unit price is invalid.`);
  }
  let workDate: Date | null = null;
  if (line.workDate != null && line.workDate !== "") {
    const parsed = new Date(String(line.workDate));
    if (Number.isNaN(parsed.getTime())) {
      throw new AuthError("validation", `Line ${idx + 1}: work date is invalid.`);
    }
    workDate = parsed;
  }
  return {
    firmServiceId: typeof line.firmServiceId === "string" ? line.firmServiceId : null,
    description,
    qty,
    unitPriceCents,
    revenueGlAccountId:
      typeof line.revenueGlAccountId === "string" ? line.revenueGlAccountId : null,
    workDate,
  };
}

export function parseCreateServiceInvoiceInput(body: unknown): CreateServiceInvoiceInput {
  if (!body || typeof body !== "object") {
    throw new AuthError("validation", "Invalid invoice payload.");
  }
  const raw = body as Record<string, unknown>;
  const clientId = typeof raw.clientId === "string" ? raw.clientId.trim() : "";
  const matterId = typeof raw.matterId === "string" ? raw.matterId.trim() : "";
  if (!clientId) throw new AuthError("validation", "Client is required.");
  if (!matterId) throw new AuthError("validation", "Matter is required.");
  if (!Array.isArray(raw.lines) || raw.lines.length === 0) {
    throw new AuthError("validation", "At least one line is required.");
  }

  const discountPctRaw = raw.discountPct;
  const discountPct =
    discountPctRaw == null || discountPctRaw === "" ? null : Number(discountPctRaw);
  let discountCents = 0;
  if (raw.discountCents != null && raw.discountCents !== "") {
    discountCents = Number(raw.discountCents);
  } else {
    const dollars = dollarsToCents(raw.discountDollars);
    if (dollars != null) discountCents = dollars;
  }
  if (discountPct != null && (discountPct < 0 || discountPct > 100)) {
    throw new AuthError("validation", "Discount percent must be between 0 and 100.");
  }
  if (discountCents > 0 && discountPct != null && discountPct > 0) {
    throw new AuthError("validation", "Use either a discount amount or a discount percent, not both.");
  }

  return {
    clientId,
    matterId,
    notes: trimOrNull(raw.notes),
    subject: trimOrNull(raw.subject),
    paymentTerms: trimOrNull(raw.paymentTerms) ?? "-",
    discountCents,
    discountPct,
    currency: trimOrNull(raw.currency) ?? undefined,
    lines: raw.lines.map((line, idx) => parseServiceLine(line, idx)),
  };
}

export function isServiceInvoicePayload(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  const raw = body as Record<string, unknown>;
  return Array.isArray(raw.lines) && raw.lines.length > 0;
}

export function parseInvoiceStatus(body: unknown): InvoiceStatusValue {
  if (!body || typeof body !== "object") {
    throw new AuthError("validation", "Invalid status payload.");
  }
  const raw = body as Record<string, unknown>;
  if (!isInvoiceStatus(raw.status)) {
    throw new AuthError("validation", "Status must be draft, sent, paid, overdue, or void.");
  }
  return raw.status;
}

export function parseFeePaymentInput(
  body: unknown,
  defaults?: { currency?: string },
): FeePaymentInput {
  if (!body || typeof body !== "object") {
    throw new AuthError("validation", "Invalid fee payment payload.");
  }
  const raw = body as Record<string, unknown>;

  let amountCents: number | null = null;
  if ("amountCents" in raw && raw.amountCents != null && raw.amountCents !== "") {
    const n =
      typeof raw.amountCents === "number"
        ? raw.amountCents
        : typeof raw.amountCents === "string"
          ? Number(raw.amountCents)
          : NaN;
    if (!Number.isInteger(n) || n < 1) {
      throw new AuthError("validation", "amountCents must be a positive integer.");
    }
    amountCents = n;
  } else {
    amountCents = dollarsToCents(raw.amount ?? raw.amountDollars);
    if (amountCents == null || amountCents < 1) {
      throw new AuthError("validation", "Amount must be greater than zero.");
    }
  }

  return {
    amountCents,
    currency:
      trimOrNull(raw.currency) ??
      (defaults?.currency ? defaults.currency : "USD"),
    paidAt: parseDate(raw.paidAt, "Paid at"),
    method: trimOrNull(raw.method),
    reference: trimOrNull(raw.reference),
    notes: trimOrNull(raw.notes),
  };
}

/** Allowed status transitions for fee notes. */
export function assertInvoiceStatusTransition(
  from: string,
  to: InvoiceStatusValue,
): void {
  if (from === to) return;
  const allowed: Record<string, InvoiceStatusValue[]> = {
    draft: ["sent", "void"],
    sent: ["paid", "overdue", "void"],
    overdue: ["paid", "void"],
    paid: ["void"],
    void: [],
  };
  const next = allowed[from] ?? [];
  if (!next.includes(to)) {
    throw new AuthError(
      "validation",
      `Cannot change invoice status from ${from} to ${to}.`,
    );
  }
}
