import { AuthError } from "@/lib/auth/types";
import { dollarsToCents } from "@/lib/billing/money";

export const PAYMENT_DESTINATIONS = [
  "trust_bank",
  "trust_vault",
  "fee_bank",
  "fee_vault",
  "disbursement_account",
  "disbursement_float_account",
] as const;
export type PaymentDestination = (typeof PAYMENT_DESTINATIONS)[number];

/** Intake-level destination when split lines go to different places. */
export const MIXED_DESTINATION = "mixed";
export type IntakeDestination = PaymentDestination | typeof MIXED_DESTINATION;

/** Firm fee destinations never touch the trust ledger. */
export function isFeesOnlyDestination(destination: string): boolean {
  return destination === "fee_bank" || destination === "fee_vault";
}

export function isTrustDestination(destination: string): boolean {
  return destination === "trust_bank" || destination === "trust_vault";
}

/** Vaults and the disbursement float hold physical cash, so only a Cash payment can land in one. */
export function isVaultDestination(destination: string): boolean {
  return (
    destination === "trust_vault" ||
    destination === "fee_vault" ||
    destination === "disbursement_float_account"
  );
}

/** Money the firm already spent on the client's work, coming back. Not trust and not a fee. */
export function isRecoveryDestination(destination: string): boolean {
  return (
    destination === "disbursement_account" || destination === "disbursement_float_account"
  );
}

/** Operating Bank (1010) or Disbursement float (1060). */
export function recoveryCashGlCode(
  destination: PaymentDestination,
): "1010" | "1060" {
  return destination === "disbursement_float_account" ? "1060" : "1010";
}

export function isCashMethod(method: string | null): boolean {
  return (method ?? "").trim().toLowerCase() === "cash";
}

/** GL cash asset for fees-only intakes: banked vs cash on hand. */
export function feeDestinationCashGlCode(destination: PaymentDestination): "1010" | "1020" {
  return destination === "fee_vault" ? "1020" : "1010";
}

export const ALLOCATION_LINE_TYPES = [
  "trust_hold",
  "fee_revenue",
  "disbursement_float",
  "cost_recovery",
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
  destination: PaymentDestination;
  /** Set for trust destinations. */
  trustAccountId: string | null;
};

export type PaymentIntakeInput = {
  clientId: string;
  matterId: string | null;
  receivedAt: Date;
  amountCents: number;
  currency: string;
  /** The lines' shared destination, or "mixed" when split lines go to different places. */
  destination: IntakeDestination;
  method: string | null;
  reference: string | null;
  notes: string | null;
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

/** null means the split line was left blank; 0 means it was entered as "not used". */
function parseLineCents(raw: Record<string, unknown>, fieldLabel: string): number | null {
  if (raw.amountCents != null && raw.amountCents !== "") {
    const n = Number(raw.amountCents);
    if (!Number.isInteger(n) || n < 0) {
      throw new AuthError("validation", `${fieldLabel} must be zero or a positive integer (cents).`);
    }
    return n;
  }
  const value = raw.amount ?? raw.amountDollars;
  if (value == null || (typeof value === "string" && !value.trim())) return null;
  const cents = dollarsToCents(value);
  if (cents == null || cents < 0) {
    throw new AuthError("validation", `${fieldLabel} must be zero or more.`);
  }
  return cents;
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

function parseLine(
  raw: unknown,
  index: number,
  defaults: { destination: unknown; trustAccountId: string | null },
  fullAmountCents?: number,
): PaymentAllocationLineInput | null {
  if (!raw || typeof raw !== "object") {
    throw new AuthError("validation", `Allocation line ${index + 1} is invalid.`);
  }
  const row = raw as Record<string, unknown>;
  const destination = row.destination ?? defaults.destination;
  if (!isDestination(destination)) {
    throw new AuthError(
      "validation",
      `Allocation line ${index + 1}: destination must be trust bank, trust vault, fee bank, Business Cash Book, disbursement account, or disbursement float.`,
    );
  }
  if (!isLineType(row.lineType)) {
    throw new AuthError(
      "validation",
      `Allocation line ${index + 1}: lineType must be trust_hold, fee_revenue, disbursement_float, or cost_recovery.`,
    );
  }
  const parsed = parseLineCents(row, `Allocation line ${index + 1} amount`);
  if (parsed == null && fullAmountCents == null) return null;
  const amountCents = fullAmountCents ?? parsed ?? 0;
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

  if (isFeesOnlyDestination(destination) && row.lineType !== "fee_revenue") {
    throw new AuthError(
      "validation",
      `Allocation line ${index + 1}: fee bank and Business Cash Book lines can only be fees (an invoice payment or a new fee).`,
    );
  }
  if (isRecoveryDestination(destination) && row.lineType !== "cost_recovery") {
    throw new AuthError(
      "validation",
      `Allocation line ${index + 1}: disbursement account and disbursement float lines recover client costs already paid.`,
    );
  }
  if (!isRecoveryDestination(destination) && row.lineType === "cost_recovery") {
    throw new AuthError(
      "validation",
      `Allocation line ${index + 1}: cost recovery only goes to the disbursement account or the disbursement float.`,
    );
  }

  let trustAccountId: string | null = null;
  if (isTrustDestination(destination)) {
    trustAccountId = trimOrNull(row.trustAccountId) ?? defaults.trustAccountId;
    if (!trustAccountId && amountCents > 0) {
      throw new AuthError(
        "validation",
        `Allocation line ${index + 1}: choose the trust account for this line.`,
      );
    }
  }

  return {
    lineType: row.lineType,
    feeCategory,
    amountCents,
    invoiceId: amountCents > 0 ? trimOrNull(row.invoiceId) : null,
    notes: trimOrNull(row.notes),
    destination,
    trustAccountId,
  };
}

/**
 * Parse Payments intake payload.
 * Splitting is optional: a single line with no amount takes the full cash received.
 * Blank split lines are dropped. Lines entered as 0 are kept for display on the receipt only
 * (they post nothing). The lines must sum to cash received and at least one must be above 0.
 * Each line may carry its own destination (split receipts); otherwise it uses the intake's.
 * fee_bank / fee_vault lines may only be fee_revenue; vault lines need a Cash method.
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

  if (raw.destination != null && raw.destination !== "" && !isDestination(raw.destination)) {
    throw new AuthError(
      "validation",
      "destination must be trust bank, trust vault, fee bank, Business Cash Book, disbursement account, or disbursement float.",
    );
  }

  const amountCents = parsePositiveCents(raw, "Amount");
  const linesRaw = Array.isArray(raw.lines) ? raw.lines : null;
  if (!linesRaw || linesRaw.length < 1) {
    throw new AuthError("validation", "At least one allocation line is required.");
  }
  const single = linesRaw.length === 1 ? amountCents : undefined;
  const lineDefaults = {
    destination: raw.destination,
    trustAccountId: trimOrNull(raw.trustAccountId),
  };
  const lines = linesRaw
    .map((line, i) => parseLine(line, i, lineDefaults, single))
    .filter((line): line is PaymentAllocationLineInput => line != null);
  if (!lines.some((line) => line.amountCents > 0)) {
    throw new AuthError("validation", "At least one allocation line needs an amount.");
  }
  const lineSum = lines.reduce((s, l) => s + l.amountCents, 0);
  if (lineSum !== amountCents) {
    throw new AuthError(
      "validation",
      `Allocation lines must sum to cash received (${amountCents} cents). Got ${lineSum}.`,
    );
  }

  const method = trimOrNull(raw.method);
  if (!isCashMethod(method) && lines.some((l) => l.amountCents > 0 && isVaultDestination(l.destination))) {
    throw new AuthError(
      "validation",
      "Only a Cash payment can go into the Business Cash Book, the trust vault, or the disbursement float. Set the method to Cash, or send this line to a bank destination.",
    );
  }

  const used = lines.filter((l) => l.amountCents > 0);
  const destinations = new Set(used.map((l) => l.destination));
  const destination: IntakeDestination =
    destinations.size === 1 ? used[0].destination : MIXED_DESTINATION;

  return {
    clientId,
    matterId: trimOrNull(raw.matterId),
    receivedAt: parseDate(raw.receivedAt ?? raw.receivedDate, "Received date"),
    amountCents,
    currency:
      (typeof raw.currency === "string" && raw.currency.trim()) ||
      defaults?.currency ||
      "USD",
    destination,
    method,
    reference: trimOrNull(raw.reference),
    notes: trimOrNull(raw.notes),
    lines,
  };
}
