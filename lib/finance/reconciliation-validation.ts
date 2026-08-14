import { AuthError } from "@/lib/auth/types";
import { dollarsToCents } from "@/lib/billing/money";

export const RECON_TYPES = ["trust_bank", "trust_vault", "business_bank"] as const;
export type ReconType = (typeof RECON_TYPES)[number];

export const RECON_STATUSES = ["draft", "completed"] as const;
export type ReconStatus = (typeof RECON_STATUSES)[number];

export type ReconciliationRunInput = {
  reconType: ReconType;
  periodYear: number;
  periodMonth: number;
  trustAccountId: string | null;
  bankAccountLabel: string | null;
  statementBalanceCents: number;
  notes: string | null;
};

export type CompleteReconciliationInput = {
  overrideReason: string | null;
};

function trimOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export function isReconType(value: unknown): value is ReconType {
  return typeof value === "string" && (RECON_TYPES as readonly string[]).includes(value);
}

function parseStatementCents(raw: Record<string, unknown>): number {
  if ("statementBalanceCents" in raw && raw.statementBalanceCents != null) {
    const n = Number(raw.statementBalanceCents);
    if (!Number.isInteger(n)) {
      throw new AuthError("validation", "statementBalanceCents must be an integer.");
    }
    return n;
  }
  const dollars = dollarsToCents(raw.statementDollars ?? raw.statementBalanceDollars);
  if (dollars == null) {
    throw new AuthError("validation", "Statement balance is required.");
  }
  return dollars;
}

export function parseReconciliationRunInput(body: unknown): ReconciliationRunInput {
  if (!body || typeof body !== "object") {
    throw new AuthError("validation", "Invalid reconciliation payload.");
  }
  const raw = body as Record<string, unknown>;

  if (!isReconType(raw.reconType)) {
    throw new AuthError("validation", "reconType must be trust_bank, trust_vault, or business_bank.");
  }

  const periodYear = Number(raw.periodYear);
  const periodMonth = Number(raw.periodMonth);
  if (!Number.isInteger(periodYear) || periodYear < 2000 || periodYear > 2100) {
    throw new AuthError("validation", "periodYear is invalid.");
  }
  if (!Number.isInteger(periodMonth) || periodMonth < 1 || periodMonth > 12) {
    throw new AuthError("validation", "periodMonth must be 1–12.");
  }

  const trustAccountId = trimOrNull(raw.trustAccountId);
  if ((raw.reconType === "trust_bank" || raw.reconType === "trust_vault") && !trustAccountId) {
    throw new AuthError("validation", "trustAccountId is required for trust reconciliations.");
  }
  if (raw.reconType === "business_bank" && !trimOrNull(raw.bankAccountLabel)) {
    throw new AuthError("validation", "bankAccountLabel is required for business bank reconciliation.");
  }

  return {
    reconType: raw.reconType,
    periodYear,
    periodMonth,
    trustAccountId,
    bankAccountLabel: trimOrNull(raw.bankAccountLabel),
    statementBalanceCents: parseStatementCents(raw),
    notes: trimOrNull(raw.notes),
  };
}

export function parseCompleteReconciliationInput(body: unknown): CompleteReconciliationInput {
  if (!body || typeof body !== "object") {
    return { overrideReason: null };
  }
  const raw = body as Record<string, unknown>;
  return { overrideReason: trimOrNull(raw.overrideReason) };
}
