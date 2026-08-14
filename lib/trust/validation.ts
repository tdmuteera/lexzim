import { AuthError } from "@/lib/auth/types";
import { dollarsToCents } from "@/lib/billing/money";

export const TRUST_ENTRY_TYPES = [
  "receipt",
  "disbursement",
  "transfer",
  "adjustment",
] as const;

export type TrustEntryType = (typeof TRUST_ENTRY_TYPES)[number];

export const TRUST_ACCOUNT_KINDS = ["bank", "vault"] as const;
export type TrustAccountKind = (typeof TRUST_ACCOUNT_KINDS)[number];

export function isTrustAccountKind(value: unknown): value is TrustAccountKind {
  return typeof value === "string" && (TRUST_ACCOUNT_KINDS as readonly string[]).includes(value);
}

export type TrustAccountInput = {
  name: string;
  currency: string;
  accountRef: string | null;
  accountKind: TrustAccountKind;
  isActive: boolean;
};

export type TrustLedgerInput = {
  trustAccountId: string;
  matterId: string | null;
  clientId: string | null;
  entryType: TrustEntryType;
  /** Absolute amount in cents; sign applied from entry type (except adjustment/transfer). */
  amountCents: number;
  currency: string;
  occurredAt: Date;
  reference: string | null;
  narrative: string | null;
  /** Required for transfer: destination trust account. */
  transferToAccountId: string | null;
  /** For adjustment: true = credit (increase), false = debit. Default credit. */
  adjustmentCredit: boolean;
  /** Allow posting that would make client balance negative (MP override). Default false. */
  allowNegative: boolean;
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

function parsePositiveCents(raw: Record<string, unknown>): number {
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
    return n;
  }
  const dollars = dollarsToCents(raw.amount ?? raw.amountDollars);
  if (dollars == null || dollars < 1) {
    throw new AuthError("validation", "Amount must be greater than zero.");
  }
  return dollars;
}

export function isTrustEntryType(value: unknown): value is TrustEntryType {
  return (
    typeof value === "string" &&
    (TRUST_ENTRY_TYPES as readonly string[]).includes(value)
  );
}

export function parseTrustAccountInput(
  body: unknown,
  defaults?: { currency?: string; accountKind?: TrustAccountKind },
): TrustAccountInput {
  if (!body || typeof body !== "object") {
    throw new AuthError("validation", "Invalid trust account payload.");
  }
  const raw = body as Record<string, unknown>;
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!name) throw new AuthError("validation", "Account name is required.");

  return {
    name,
    currency:
      trimOrNull(raw.currency) ??
      (defaults?.currency ? defaults.currency : "USD"),
    accountRef: trimOrNull(raw.accountRef),
    accountKind: isTrustAccountKind(raw.accountKind)
      ? raw.accountKind
      : (defaults?.accountKind ?? "bank"),
    isActive: raw.isActive === false ? false : true,
  };
}

export function parseTrustLedgerInput(
  body: unknown,
  defaults?: { currency?: string },
): TrustLedgerInput {
  if (!body || typeof body !== "object") {
    throw new AuthError("validation", "Invalid trust ledger payload.");
  }
  const raw = body as Record<string, unknown>;
  if (!isTrustEntryType(raw.entryType)) {
    throw new AuthError(
      "validation",
      "Entry type must be receipt, disbursement, transfer, or adjustment.",
    );
  }

  const trustAccountId =
    typeof raw.trustAccountId === "string" ? raw.trustAccountId.trim() : "";
  if (!trustAccountId) {
    throw new AuthError("validation", "Trust account is required.");
  }

  const clientId = trimOrNull(raw.clientId);
  const matterId = trimOrNull(raw.matterId);
  if (raw.entryType !== "transfer" && !clientId) {
    throw new AuthError("validation", "Client is required for this entry type.");
  }

  const amountCents = parsePositiveCents(raw);
  const transferToAccountId = trimOrNull(raw.transferToAccountId);
  if (raw.entryType === "transfer") {
    if (!transferToAccountId) {
      throw new AuthError("validation", "Transfer destination account is required.");
    }
    if (transferToAccountId === trustAccountId) {
      throw new AuthError("validation", "Transfer accounts must differ.");
    }
  }

  return {
    trustAccountId,
    matterId,
    clientId,
    entryType: raw.entryType,
    amountCents,
    currency:
      trimOrNull(raw.currency) ??
      (defaults?.currency ? defaults.currency : "USD"),
    occurredAt: parseDate(raw.occurredAt, "Occurred at"),
    reference: trimOrNull(raw.reference),
    narrative: trimOrNull(raw.narrative),
    transferToAccountId,
    adjustmentCredit: raw.adjustmentCredit === false ? false : true,
    allowNegative: raw.allowNegative === true,
  };
}

/** Signed cents: receipt +, disbursement -, adjustment ±, transfer out -. */
export function signedTrustAmount(
  entryType: TrustEntryType,
  absoluteCents: number,
  adjustmentCredit: boolean,
): number {
  if (entryType === "receipt") return absoluteCents;
  if (entryType === "disbursement" || entryType === "transfer") return -absoluteCents;
  return adjustmentCredit ? absoluteCents : -absoluteCents;
}
