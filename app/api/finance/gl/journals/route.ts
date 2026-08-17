import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import {
  getJournalEntry,
  listJournalEntries,
  parseManualJournalInput,
  postManualJournal,
} from "@/lib/gl/journals";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

function parseDate(value: string | null): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new AuthError("validation", `Invalid date: ${value}`);
  }
  return d;
}

function serializeEntry(row: Awaited<ReturnType<typeof getJournalEntry>>) {
  if (!row) return null;
  return {
    id: row.entry.id,
    entryDate: row.entry.entryDate.toISOString(),
    reference: row.entry.reference,
    memo: row.entry.memo,
    sourceType: row.entry.sourceType,
    postedByName: row.postedByName,
    postedAt: row.entry.postedAt.toISOString(),
    lines: row.lines.map((l) => ({
      id: l.line.id,
      accountId: l.line.accountId,
      accountCode: l.accountCode,
      accountName: l.accountName,
      debitCents: l.line.debitCents,
      creditCents: l.line.creditCents,
      currency: l.line.currency,
      lineMemo: l.line.lineMemo,
    })),
  };
}

export async function GET(request: Request) {
  try {
    const session = await requirePermission("finance.gl.view");
    const firmId = tenantFirmId(session);
    const url = new URL(request.url);
    const entryId = url.searchParams.get("id")?.trim();
    if (entryId) {
      const entry = await getJournalEntry(firmId, entryId);
      if (!entry) throw new AuthError("not_found", "Journal entry not found.");
      return jsonOk({ entry: serializeEntry(entry) });
    }

    const from = parseDate(url.searchParams.get("from"));
    const to = parseDate(url.searchParams.get("to"));
    const rows = await listJournalEntries(firmId, { from, to });
    return jsonOk({
      items: rows.map(({ entry, postedByName, lines }) => ({
        id: entry.id,
        entryDate: entry.entryDate.toISOString(),
        reference: entry.reference,
        memo: entry.memo,
        sourceType: entry.sourceType,
        postedByName,
        postedAt: entry.postedAt.toISOString(),
        lineCount: lines.length,
        totalDebitCents: lines.reduce((s, l) => s + l.line.debitCents, 0),
      })),
    });
  } catch (err) {
    return jsonError(err, request);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requirePermission("finance.gl.post");
    const firmId = tenantFirmId(session);
    const body = await request.json();
    const input = parseManualJournalInput(body, session.firm.defaultCurrency || "USD");
    const entry = await postManualJournal(firmId, session.id, input);

    await writeAuditLog({
      action: "gl.journals.post",
      firmId,
      userId: session.id,
      entityType: "gl_journal_entry",
      entityId: entry.id,
      metadata: {
        reference: entry.reference,
        entryDate: entry.entryDate.toISOString(),
        lineCount: input.lines.length,
      },
      ipOrUserAgent: clientInfo(request),
    });

    const full = await getJournalEntry(firmId, entry.id);
    return jsonOk({ entry: serializeEntry(full) }, { status: 201 });
  } catch (err) {
    return jsonError(err, request);
  }
}
