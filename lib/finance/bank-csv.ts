/**
 * Parse bank statement CSV into signed amount lines.
 * Supports common Zimbabwe / export layouts:
 *  - date, description, amount (signed or absolute with type)
 *  - date, description, debit, credit
 *  - date, particulars, money in, money out
 */
import { createHash } from "node:crypto";
import { AuthError } from "@/lib/auth/types";
import { dollarsToCents } from "@/lib/billing/money";

export type ParsedBankLine = {
  lineDate: Date;
  description: string;
  reference: string | null;
  /** Positive = money in, negative = money out. */
  amountCents: number;
};

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** Minimal CSV splitter (quoted fields, commas). */
export function splitCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  const src = stripBom(text);
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      row.push(cell.trim());
      cell = "";
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i += 1;
      row.push(cell.trim());
      cell = "";
      if (row.some((c) => c.length > 0)) rows.push(row);
      row = [];
      continue;
    }
    cell += ch;
  }
  row.push(cell.trim());
  if (row.some((c) => c.length > 0)) rows.push(row);
  return rows;
}

function normHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function findCol(headers: string[], aliases: string[]): number {
  const norms = headers.map(normHeader);
  // Exact header match first.
  for (const alias of aliases) {
    const i = norms.indexOf(alias);
    if (i >= 0) return i;
  }
  // Substring match only for aliases long enough to avoid "cr" matching "description".
  for (const alias of aliases) {
    if (alias.length < 3) continue;
    const i = norms.findIndex((h) => h.includes(alias));
    if (i >= 0) return i;
  }
  return -1;
}

function parseLooseDate(raw: string): Date | null {
  const s = raw.trim();
  if (!s) return null;
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s.slice(0, 10) + "T12:00:00.000Z");
    return Number.isNaN(d.getTime()) ? null : d;
  }
  // DD/MM/YYYY or DD-MM-YYYY (Zimbabwe common)
  const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    let year = Number(m[3]);
    if (year < 100) year += 2000;
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const d = new Date(Date.UTC(year, month - 1, day, 12));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseMoneyCell(raw: string): number | null {
  const cleaned = raw.replace(/[",\s]/g, "").replace(/^\((.+)\)$/, "-$1");
  if (!cleaned || cleaned === "-" || cleaned === ".") return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  // Already cents if integer with no decimal and |n| > 1000? Prefer dollars.
  if (cleaned.includes(".")) {
    return dollarsToCents(cleaned);
  }
  // Whole dollars without decimal
  return dollarsToCents(cleaned);
}

export function parseBankCsv(csvText: string): ParsedBankLine[] {
  const rows = splitCsvRows(csvText);
  if (rows.length < 2) {
    throw new AuthError("validation", "CSV needs a header row and at least one data row.");
  }
  const headers = rows[0]!;
  const dateIdx = findCol(headers, ["date", "txn date", "transaction date", "value date", "posted"]);
  const descIdx = findCol(headers, [
    "description",
    "particulars",
    "narrative",
    "details",
    "memo",
    "transaction description",
  ]);
  const refIdx = findCol(headers, ["reference", "ref", "cheque", "check number", "txn id"]);
  const amountIdx = findCol(headers, ["amount", "amt", "value", "transaction amount"]);
  const debitIdx = findCol(headers, ["debit", "withdrawal", "money out", "paid out", "dr"]);
  const creditIdx = findCol(headers, ["credit", "deposit", "money in", "paid in", "cr"]);
  const typeIdx = findCol(headers, ["type", "dr cr", "credit debit", "transaction type"]);

  if (dateIdx < 0) {
    throw new AuthError("validation", "CSV must include a Date column.");
  }
  if (amountIdx < 0 && debitIdx < 0 && creditIdx < 0) {
    throw new AuthError(
      "validation",
      "CSV must include Amount, or Debit and Credit (or Money in / Money out) columns.",
    );
  }

  const out: ParsedBankLine[] = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r]!;
    const dateRaw = cells[dateIdx] ?? "";
    const lineDate = parseLooseDate(dateRaw);
    if (!lineDate) continue;

    const description = (descIdx >= 0 ? cells[descIdx] : "")?.trim() || "Bank line";
    const reference = refIdx >= 0 ? (cells[refIdx]?.trim() || null) : null;

    let amountCents: number | null = null;
    if (debitIdx >= 0 || creditIdx >= 0) {
      const debit = debitIdx >= 0 ? parseMoneyCell(cells[debitIdx] ?? "") : null;
      const credit = creditIdx >= 0 ? parseMoneyCell(cells[creditIdx] ?? "") : null;
      if (credit && credit > 0) amountCents = credit;
      else if (debit && debit > 0) amountCents = -debit;
      else if (credit && credit < 0) amountCents = credit;
      else if (debit && debit < 0) amountCents = debit;
    } else if (amountIdx >= 0) {
      amountCents = parseMoneyCell(cells[amountIdx] ?? "");
      if (amountCents != null && typeIdx >= 0) {
        const t = (cells[typeIdx] ?? "").toLowerCase();
        if (/^(dr|debit|out|withdrawal|payment)/.test(t) && amountCents > 0) {
          amountCents = -amountCents;
        }
      }
    }

    if (amountCents == null || amountCents === 0) continue;
    out.push({ lineDate, description, reference, amountCents });
  }

  if (!out.length) {
    throw new AuthError("validation", "No usable bank lines found in the CSV.");
  }
  if (out.length > 5000) {
    throw new AuthError("validation", "CSV has too many rows (max 5000).");
  }
  return out;
}

export function bankLineHash(input: {
  accountKind: string;
  bankAccountLabel: string | null;
  trustAccountId: string | null;
  lineDate: Date;
  description: string;
  reference: string | null;
  amountCents: number;
}): string {
  const day = input.lineDate.toISOString().slice(0, 10);
  const payload = [
    input.accountKind,
    input.bankAccountLabel ?? "",
    input.trustAccountId ?? "",
    day,
    input.description.trim().toLowerCase(),
    (input.reference ?? "").trim().toLowerCase(),
    String(input.amountCents),
  ].join("|");
  return createHash("sha256").update(payload).digest("hex").slice(0, 40);
}
