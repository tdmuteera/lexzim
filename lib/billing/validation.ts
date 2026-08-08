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

  return {
    description,
    amountCents,
    currency,
    incurredAt: parseDate(raw.incurredAt, "Incurred at"),
    billable: billableFlag === false ? false : true,
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

export type FeePaymentInput = {
  amountCents: number;
  currency: string;
  paidAt: Date;
  method: string | null;
  reference: string | null;
  notes: string | null;
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
