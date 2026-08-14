import { AuthError } from "@/lib/auth/types";
import { dollarsToCents } from "@/lib/billing/money";
import {
  isQuoteStatus,
  lineTotalCents,
  type QuoteStatus,
} from "@/lib/quotes/totals";

export type QuotationLineInput = {
  firmServiceId?: string | null;
  description: string;
  qty: number;
  unitPriceCents: number;
};

export type CreateQuotationInput = {
  clientId: string;
  matterId?: string | null;
  validUntil?: Date | null;
  discountCents?: number;
  discountPct?: number | null;
  notes?: string | null;
  currency?: string;
  lines: QuotationLineInput[];
};

function trimOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t.length ? t : null;
}

function parseDateOrNull(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function parseLine(raw: unknown, idx: number): QuotationLineInput {
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

  return {
    firmServiceId: typeof line.firmServiceId === "string" ? line.firmServiceId : null,
    description,
    qty,
    unitPriceCents,
  };
}

export function parseCreateQuotationInput(body: unknown): CreateQuotationInput {
  if (!body || typeof body !== "object") {
    throw new AuthError("validation", "Invalid quotation payload.");
  }
  const raw = body as Record<string, unknown>;
  const clientId = typeof raw.clientId === "string" ? raw.clientId.trim() : "";
  if (!clientId) throw new AuthError("validation", "Client is required.");

  if (!Array.isArray(raw.lines) || raw.lines.length === 0) {
    throw new AuthError("validation", "At least one line is required.");
  }

  const discountPctRaw = raw.discountPct;
  const discountPct =
    discountPctRaw == null || discountPctRaw === "" ? null : Number(discountPctRaw);

  const discountCentsRaw = raw.discountCents;
  let discountCents = 0;
  if (discountCentsRaw != null && discountCentsRaw !== "") {
    discountCents = Number(discountCentsRaw);
    if (!Number.isInteger(discountCents) || discountCents < 0) {
      throw new AuthError("validation", "Discount amount must be a non-negative whole number of cents.");
    }
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
    matterId: typeof raw.matterId === "string" ? raw.matterId : null,
    validUntil: parseDateOrNull(raw.validUntil),
    discountCents,
    discountPct,
    notes: trimOrNull(raw.notes),
    currency: trimOrNull(raw.currency) ?? undefined,
    lines: raw.lines.map((line, idx) => parseLine(line, idx)),
  };
}

export function parseQuoteStatusInput(body: unknown): QuoteStatus {
  if (!body || typeof body !== "object") {
    throw new AuthError("validation", "Invalid status payload.");
  }
  const status = (body as Record<string, unknown>).status;
  if (typeof status !== "string" || !isQuoteStatus(status)) {
    throw new AuthError("validation", "Invalid quotation status.");
  }
  return status;
}

export { lineTotalCents };
