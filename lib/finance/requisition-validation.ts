import { AuthError } from "@/lib/auth/types";
import { dollarsToCents } from "@/lib/billing/money";

export const REQUISITION_TYPES = ["business", "disbursement"] as const;
export type RequisitionType = (typeof REQUISITION_TYPES)[number];

export const REQUISITION_STATUSES = [
  "draft",
  "pending_approval",
  "approved",
  "rejected",
  "paid",
  "cancelled",
  "reversed",
] as const;
export type RequisitionStatus = (typeof REQUISITION_STATUSES)[number];

/** trust_then_float: use the client's trust funds first and cover any shortfall from firm float. */
export const REQUISITION_PAID_FROM = ["trust", "firm_float", "trust_then_float", "operating"] as const;
export type RequisitionPaidFrom = (typeof REQUISITION_PAID_FROM)[number];

export type RequisitionCreateInput = {
  type: RequisitionType;
  nature: string | null;
  description: string;
  amountCents: number;
  currency: string;
  clientId: string | null;
  matterId: string | null;
  /** When true, create as pending_approval; otherwise draft. */
  submit: boolean;
};

export type RequisitionPayInput = {
  paidFrom: RequisitionPaidFrom;
  paymentRef: string | null;
  trustAccountId: string | null;
  /** Allow trust pay that would go negative. Managing Partner only, with overrideReason. */
  allowNegativeTrust: boolean;
  overrideReason: string | null;
  reason: string | null;
};

function trimOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function parsePositiveCents(raw: Record<string, unknown>, label: string): number {
  if ("amountCents" in raw && raw.amountCents != null && raw.amountCents !== "") {
    const n = Number(raw.amountCents);
    if (!Number.isInteger(n) || n < 1) {
      throw new AuthError("validation", `${label} must be a positive integer (cents).`);
    }
    return n;
  }
  const dollars = dollarsToCents(raw.amount ?? raw.amountDollars);
  if (dollars == null || dollars < 1) {
    throw new AuthError("validation", `${label} must be greater than zero.`);
  }
  return dollars;
}

export function isRequisitionType(value: unknown): value is RequisitionType {
  return typeof value === "string" && (REQUISITION_TYPES as readonly string[]).includes(value);
}

export function isRequisitionStatus(value: unknown): value is RequisitionStatus {
  return (
    typeof value === "string" && (REQUISITION_STATUSES as readonly string[]).includes(value)
  );
}

export function parseRequisitionCreateInput(
  body: unknown,
  defaults?: { currency?: string },
): RequisitionCreateInput {
  if (!body || typeof body !== "object") {
    throw new AuthError("validation", "Invalid requisition payload.");
  }
  const raw = body as Record<string, unknown>;
  if (!isRequisitionType(raw.type)) {
    throw new AuthError("validation", "type must be business or disbursement.");
  }
  const description =
    typeof raw.description === "string" ? raw.description.trim() : "";
  if (!description) {
    throw new AuthError("validation", "Description is required.");
  }

  const clientId = trimOrNull(raw.clientId);
  const matterId = trimOrNull(raw.matterId);
  if (raw.type === "disbursement") {
    if (!clientId || !matterId) {
      throw new AuthError(
        "validation",
        "Disbursement requisitions require Client and Matter.",
      );
    }
  } else if (clientId || matterId) {
    throw new AuthError(
      "validation",
      "Business requisitions must not include client or matter.",
    );
  }

  const nature = trimOrNull(raw.nature);
  if (raw.type === "business" && !nature) {
    throw new AuthError("validation", "Business requisitions require a nature/category.");
  }

  return {
    type: raw.type,
    nature,
    description,
    amountCents: parsePositiveCents(raw, "Amount"),
    currency:
      (typeof raw.currency === "string" && raw.currency.trim()) ||
      defaults?.currency ||
      "USD",
    clientId: raw.type === "disbursement" ? clientId : null,
    matterId: raw.type === "disbursement" ? matterId : null,
    submit: raw.submit !== false,
  };
}

export function parseRequisitionPayInput(body: unknown): RequisitionPayInput {
  if (!body || typeof body !== "object") {
    throw new AuthError("validation", "Invalid pay payload.");
  }
  const raw = body as Record<string, unknown>;
  const paidFrom = trimOrNull(raw.paidFrom);
  if (
    !paidFrom ||
    !(REQUISITION_PAID_FROM as readonly string[]).includes(paidFrom)
  ) {
    throw new AuthError(
      "validation",
      "paidFrom must be trust, firm_float, trust_then_float, or operating.",
    );
  }
  return {
    paidFrom: paidFrom as RequisitionPaidFrom,
    paymentRef: trimOrNull(raw.paymentRef),
    trustAccountId: trimOrNull(raw.trustAccountId),
    allowNegativeTrust: raw.allowNegativeTrust === true,
    overrideReason: trimOrNull(raw.overrideReason),
    reason: trimOrNull(raw.reason),
  };
}

export type RequisitionAction =
  | "submit"
  | "approve"
  | "reject"
  | "pay"
  | "cancel"
  | "settle_recoverable"
  | "reverse_payment";

export function parseRequisitionAction(body: unknown): {
  action: RequisitionAction;
  rejectionNote: string | null;
  pay: RequisitionPayInput | null;
  reason: string | null;
} {
  if (!body || typeof body !== "object") {
    throw new AuthError("validation", "Invalid action payload.");
  }
  const raw = body as Record<string, unknown>;
  const action = raw.action;
  if (
    action !== "submit" &&
    action !== "approve" &&
    action !== "reject" &&
    action !== "pay" &&
    action !== "cancel" &&
    action !== "settle_recoverable" &&
    action !== "reverse_payment"
  ) {
    throw new AuthError(
      "validation",
      "action must be submit, approve, reject, pay, cancel, settle_recoverable, or reverse_payment.",
    );
  }
  let rejectionNote: string | null = null;
  if (action === "reject") {
    rejectionNote =
      typeof raw.rejectionNote === "string"
        ? raw.rejectionNote.trim() || null
        : typeof raw.note === "string"
          ? raw.note.trim() || null
          : null;
  }
  const pay = action === "pay" ? parseRequisitionPayInput(raw) : null;
  return { action, rejectionNote, pay, reason: trimOrNull(raw.reason) };
}
