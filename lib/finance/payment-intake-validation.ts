import { AuthError } from "@/lib/auth/types";
import { dollarsToCents } from "@/lib/billing/money";

export const PAYMENT_DESTINATIONS = ["trust_bank", "trust_vault", "fee_bank"] as const;
export type PaymentDestination = (typeof PAYMENT_DESTINATIONS)[number];

export const ALLOCATION_LINE_TYPES = [
  "trust_hold",
  "fee_revenue",
  "disbursement_float",
] as const;
export type AllocationLineType = (typeof ALLOCATION_LINE_TYPES)[number];

export const FEE_CATEGORIES = [
  "consultation",
  "drafting",
  "due_diligence",
  "notarial",
  "appearances",
  "communications",
  "correspondence",
  "conveyancing",
  "administration",
  "other_fee",
] as const;
export type FeeCategory = (typeof FEE_CATEGORIES)[number];

export const FEE_CATEGORY_LABELS: Record<FeeCategory, string> = {
  consultation: "Consultation",
  drafting: "Drafting (court papers / agreements / MOUs)",
  due_diligence: "Due diligence / review",
  notarial: "Notarial / deed of trust / leases",
  appearances: "Court and authority appearances",
  communications: "Lawyer communications",
  correspondence: "Correspondence",
  conveyancing: "Conveyancing",
  administration: "Administration",
  other_fee: "Other fee",
};

/** Map fee category to seeded revenue GL code. */
export function feeCategoryGlCode(category: FeeCategory): string {
  if (category === "conveyancing") return "4010";
  if (category === "administration") return "4020";
  return "4030";
}

export type PaymentAllocationLineInput = {
  lineType: AllocationLineType;
  feeCategory: FeeCategory | null;
  amountCents: number;
  invoiceId: string | null;
  notes: string | null;
};

export type PaymentIntakeInput = {
  clientId: string;
  matterId: string | null;
  receivedAt: Date;
  amountCents: number;
  currency: string;
  destination: PaymentDestination;
  method: string | null;
  reference: string | null;
  notes: string | null;
  /** Required when destination is trust_bank or trust_vault. */
  trustAccountId: string | null;
  lines: PaymentAllocationLineInput[];
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

function parsePositiveCents(
  raw: Record<string, unknown>,
  fieldLabel: string,
): number {
  if ("amountCents" in raw && raw.amountCents != null && raw.amountCents !== "") {
    const n =
      typeof raw.amountCents === "number"
        ? raw.amountCents
        : typeof raw.amountCents === "string"
          ? Number(raw.amountCents)
          : NaN;
    if (!Number.isInteger(n) || n < 1) {
      throw new AuthError("validation", `${fieldLabel} must be a positive integer (cents).`);
    }
    return n;
  }
  const dollars = dollarsToCents(raw.amount ?? raw.amountDollars);
  if (dollars == null || dollars < 1) {
    throw new AuthError("validation", `${fieldLabel} must be greater than zero.`);
  }
  return dollars;
}

function isDestination(value: unknown): value is PaymentDestination {
  return (
    typeof value === "string" &&
    (PAYMENT_DESTINATIONS as readonly string[]).includes(value)
  );
}

function isLineType(value: unknown): value is AllocationLineType {
  return (
    typeof value === "string" &&
    (ALLOCATION_LINE_TYPES as readonly string[]).includes(value)
  );
}

function isFeeCategory(value: unknown): value is FeeCategory {
  return typeof value === "string" && (FEE_CATEGORIES as readonly string[]).includes(value);
}

function parseLine(raw: unknown, index: number): PaymentAllocationLineInput {
  if (!raw || typeof raw !== "object") {
    throw new AuthError("validation", `Allocation line ${index + 1} is invalid.`);
  }
  const row = raw as Record<string, unknown>;
  if (!isLineType(row.lineType)) {
    throw new AuthError(
      "validation",
      `Allocation line ${index + 1}: lineType must be trust_hold, fee_revenue, or disbursement_float.`,
    );
  }
  const amountCents = parsePositiveCents(row, `Allocation line ${index + 1} amount`);
  let feeCategory: FeeCategory | null = null;
  if (row.lineType === "fee_revenue") {
    if (!isFeeCategory(row.feeCategory)) {
      throw new AuthError(
        "validation",
        `Allocation line ${index + 1}: feeCategory is required for fee_revenue.`,
      );
    }
    feeCategory = row.feeCategory;
  } else if (row.feeCategory != null && row.feeCategory !== "") {
    throw new AuthError(
      "validation",
      `Allocation line ${index + 1}: feeCategory only applies to fee_revenue.`,
    );
  }

  return {
    lineType: row.lineType,
    feeCategory,
    amountCents,
    invoiceId: trimOrNull(row.invoiceId),
    notes: trimOrNull(row.notes),
  };
}

/**
 * Parse Payments intake payload.
 * Lines must sum to cash received. fee_bank intakes may only use fee_revenue lines.
 */
export function parsePaymentIntakeInput(
  body: unknown,
  defaults?: { currency?: string },
): PaymentIntakeInput {
  if (!body || typeof body !== "object") {
    throw new AuthError("validation", "Invalid payment intake payload.");
  }
  const raw = body as Record<string, unknown>;
  const clientId = typeof raw.clientId === "string" ? raw.clientId.trim() : "";
  if (!clientId) throw new AuthError("validation", "Client is required.");

  if (!isDestination(raw.destination)) {
    throw new AuthError(
      "validation",
      "destination must be trust_bank, trust_vault, or fee_bank.",
    );
  }

  const amountCents = parsePositiveCents(raw, "Amount");
  const linesRaw = Array.isArray(raw.lines) ? raw.lines : null;
  if (!linesRaw || linesRaw.length < 1) {
    throw new AuthError("validation", "At least one allocation line is required.");
  }
  const lines = linesRaw.map((line, i) => parseLine(line, i));
  const lineSum = lines.reduce((s, l) => s + l.amountCents, 0);
  if (lineSum !== amountCents) {
    throw new AuthError(
      "validation",
      `Allocation lines must sum to cash received (${amountCents} cents). Got ${lineSum}.`,
    );
  }

  if (raw.destination === "fee_bank") {
    const bad = lines.find((l) => l.lineType !== "fee_revenue");
    if (bad) {
      throw new AuthError(
        "validation",
        "Fees-only (fee_bank) intakes may only include fee_revenue allocation lines.",
      );
    }
  }

  const trustAccountId = trimOrNull(raw.trustAccountId);
  if (raw.destination === "trust_bank" || raw.destination === "trust_vault") {
    if (!trustAccountId) {
      throw new AuthError(
        "validation",
        "trustAccountId is required for trust destinations.",
      );
    }
  }

  return {
    clientId,
    matterId: trimOrNull(raw.matterId),
    receivedAt: parseDate(raw.receivedAt ?? raw.receivedDate, "Received date"),
    amountCents,
    currency:
      (typeof raw.currency === "string" && raw.currency.trim()) ||
      defaults?.currency ||
      "USD",
    destination: raw.destination,
    method: trimOrNull(raw.method),
    reference: trimOrNull(raw.reference),
    notes: trimOrNull(raw.notes),
    trustAccountId,
    lines,
  };
}
