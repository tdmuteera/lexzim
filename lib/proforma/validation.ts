import { AuthError } from "@/lib/auth/types";
import { dollarsToCents } from "@/lib/billing/money";
import {
  isConveyancingCategory,
  isProformaKind,
  PROFORMA_LINE_CODES,
  type ConveyancingCategory,
  type ProformaKind,
  type ProformaLineCode,
} from "@/lib/proforma/types";

export type CreateProformaLineInput = {
  lineCode: ProformaLineCode;
  description: string;
  included: boolean;
  isOptional: boolean;
  qty: number;
  unitPriceCents: number;
  ratePct: number | null;
  calcHint: string | null;
  sortOrder: number;
};

export type CreateProformaInput = {
  kind: ProformaKind;
  conveyancingCategory: ConveyancingCategory | null;
  clientId: string;
  matterId: string | null;
  propertyValueCents: number | null;
  notes: string | null;
  currency: string | null;
  lines: CreateProformaLineInput[];
};

function asRecord(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new AuthError("validation", "Expected a JSON object.");
  }
  return body as Record<string, unknown>;
}

function parseUuid(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new AuthError("validation", `${field} is required.`);
  }
  return value.trim();
}

function parseOptionalUuid(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string") throw new AuthError("validation", "Invalid id.");
  const t = value.trim();
  return t || null;
}

function parseMoneyCents(raw: unknown, field: string): number {
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.round(raw);
  if (typeof raw === "string") {
    const c = dollarsToCents(raw);
    if (c == null) throw new AuthError("validation", `Invalid ${field}.`);
    return c;
  }
  throw new AuthError("validation", `Invalid ${field}.`);
}

function isLineCode(value: string): value is ProformaLineCode {
  return (PROFORMA_LINE_CODES as readonly string[]).includes(value);
}

export function parseCreateProformaInput(body: unknown): CreateProformaInput {
  const raw = asRecord(body);
  const kindRaw = typeof raw.kind === "string" ? raw.kind.trim() : "";
  if (!isProformaKind(kindRaw)) {
    throw new AuthError("validation", "Select a pro forma type.");
  }

  let conveyancingCategory: ConveyancingCategory | null = null;
  if (kindRaw === "conveyancing") {
    const cat =
      typeof raw.conveyancingCategory === "string" ? raw.conveyancingCategory.trim() : "";
    if (!isConveyancingCategory(cat)) {
      throw new AuthError("validation", "Select a conveyancing category.");
    }
    conveyancingCategory = cat;
  }

  const clientId = parseUuid(raw.clientId, "Client");
  const matterId = parseOptionalUuid(raw.matterId);

  let propertyValueCents: number | null = null;
  if (kindRaw === "conveyancing") {
    if (raw.propertyValueCents != null && raw.propertyValueCents !== "") {
      propertyValueCents = parseMoneyCents(raw.propertyValueCents, "property value");
    } else if (raw.propertyValueDollars != null && raw.propertyValueDollars !== "") {
      propertyValueCents = parseMoneyCents(raw.propertyValueDollars, "property value");
    }
    if (propertyValueCents == null || propertyValueCents < 0) {
      throw new AuthError("validation", "Enter the property value.");
    }
  }

  const notes =
    typeof raw.notes === "string" && raw.notes.trim() ? raw.notes.trim().slice(0, 4000) : null;
  const currency =
    typeof raw.currency === "string" && raw.currency.trim()
      ? raw.currency.trim().slice(0, 8).toUpperCase()
      : null;

  if (!Array.isArray(raw.lines) || raw.lines.length === 0) {
    throw new AuthError("validation", "Add at least one line.");
  }

  const lines: CreateProformaLineInput[] = raw.lines.map((item, index) => {
    const row = asRecord(item);
    const codeRaw = typeof row.lineCode === "string" ? row.lineCode.trim() : "custom";
    if (!isLineCode(codeRaw)) {
      throw new AuthError("validation", `Invalid line code on row ${index + 1}.`);
    }
    const description =
      typeof row.description === "string" ? row.description.trim().slice(0, 500) : "";
    if (!description && row.included !== false) {
      throw new AuthError("validation", `Description required on row ${index + 1}.`);
    }
    const included = row.included !== false;
    const isOptional = Boolean(row.isOptional);
    const qty =
      typeof row.qty === "number" && Number.isFinite(row.qty)
        ? row.qty
        : Number(row.qty ?? 1);
    if (!Number.isFinite(qty) || qty < 0) {
      throw new AuthError("validation", `Invalid quantity on row ${index + 1}.`);
    }
    let unitPriceCents = 0;
    if (row.unitPriceCents != null && row.unitPriceCents !== "") {
      unitPriceCents = parseMoneyCents(row.unitPriceCents, `line ${index + 1} amount`);
    } else if (row.unitPriceDollars != null && row.unitPriceDollars !== "") {
      unitPriceCents = parseMoneyCents(row.unitPriceDollars, `line ${index + 1} amount`);
    }
    let ratePct: number | null = null;
    if (row.ratePct != null && row.ratePct !== "") {
      const n = typeof row.ratePct === "number" ? row.ratePct : Number(row.ratePct);
      if (!Number.isFinite(n)) {
        throw new AuthError("validation", `Invalid rate on row ${index + 1}.`);
      }
      ratePct = n;
    }
    const calcHint =
      typeof row.calcHint === "string" && row.calcHint.trim()
        ? row.calcHint.trim().slice(0, 240)
        : null;

    return {
      lineCode: codeRaw,
      description: description || codeRaw.replace(/_/g, " "),
      included,
      isOptional,
      qty,
      unitPriceCents,
      ratePct,
      calcHint,
      sortOrder: index,
    };
  });

  const includedCount = lines.filter((l) => l.included).length;
  if (includedCount === 0) {
    throw new AuthError("validation", "Include at least one fee line.");
  }

  return {
    kind: kindRaw,
    conveyancingCategory,
    clientId,
    matterId,
    propertyValueCents,
    notes,
    currency,
    lines,
  };
}
