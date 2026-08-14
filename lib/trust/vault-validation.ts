import { AuthError } from "@/lib/auth/types";
import { dollarsToCents } from "@/lib/billing/money";

export type VaultBankInInput = {
  vaultAccountId: string;
  bankAccountId: string;
  clientId: string;
  matterId: string | null;
  amountCents: number;
  currency: string;
  occurredAt: Date;
  reference: string | null;
  narrative: string | null;
  allowNegative: boolean;
};

export type VaultCountInput = {
  vaultAccountId: string;
  countedAt: Date;
  countedBalanceCents: number;
  notes: string | null;
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

export function parseVaultBankInInput(
  body: unknown,
  defaults?: { currency?: string },
): VaultBankInInput {
  if (!body || typeof body !== "object") {
    throw new AuthError("validation", "Invalid vault bank-in payload.");
  }
  const raw = body as Record<string, unknown>;

  const vaultAccountId =
    typeof raw.vaultAccountId === "string" ? raw.vaultAccountId.trim() : "";
  const bankAccountId =
    typeof raw.bankAccountId === "string" ? raw.bankAccountId.trim() : "";
  const clientId = trimOrNull(raw.clientId);

  if (!vaultAccountId) throw new AuthError("validation", "Vault account is required.");
  if (!bankAccountId) throw new AuthError("validation", "Bank account is required.");
  if (!clientId) throw new AuthError("validation", "Client is required for vault bank-in.");
  if (vaultAccountId === bankAccountId) {
    throw new AuthError("validation", "Vault and bank accounts must differ.");
  }

  return {
    vaultAccountId,
    bankAccountId,
    clientId,
    matterId: trimOrNull(raw.matterId),
    amountCents: parsePositiveCents(raw),
    currency:
      trimOrNull(raw.currency) ?? (defaults?.currency ? defaults.currency : "USD"),
    occurredAt: parseDate(raw.occurredAt, "Occurred at"),
    reference: trimOrNull(raw.reference),
    narrative: trimOrNull(raw.narrative),
    allowNegative: raw.allowNegative === true,
  };
}

export function parseVaultCountInput(body: unknown): VaultCountInput {
  if (!body || typeof body !== "object") {
    throw new AuthError("validation", "Invalid vault count payload.");
  }
  const raw = body as Record<string, unknown>;

  const vaultAccountId =
    typeof raw.vaultAccountId === "string" ? raw.vaultAccountId.trim() : "";
  if (!vaultAccountId) throw new AuthError("validation", "Vault account is required.");

  let countedBalanceCents: number;
  if ("countedBalanceCents" in raw && raw.countedBalanceCents != null) {
    const n = Number(raw.countedBalanceCents);
    if (!Number.isInteger(n) || n < 0) {
      throw new AuthError("validation", "Counted balance must be a non-negative integer (cents).");
    }
    countedBalanceCents = n;
  } else {
    const dollars = dollarsToCents(raw.countedDollars ?? raw.amountDollars);
    if (dollars == null || dollars < 0) {
      throw new AuthError("validation", "Counted amount is required.");
    }
    countedBalanceCents = dollars;
  }

  return {
    vaultAccountId,
    countedAt: parseDate(raw.countedAt, "Counted at"),
    countedBalanceCents,
    notes: trimOrNull(raw.notes),
  };
}
