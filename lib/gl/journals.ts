import "server-only";

import { and, desc, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { AuthError } from "@/lib/auth/types";
import { getDb } from "@/lib/db";
import { glJournalEntries, glJournalLines, glAccounts, users } from "@/lib/db/schema";
import { ensureCoaSeeded, getGlAccount } from "@/lib/gl/accounts";
import type { GlSourceType, ManualJournalInput } from "@/lib/gl/types";
import { assertPeriodNotLocked } from "@/lib/repos/period-locks";

function validateJournalLines(input: ManualJournalInput) {
  if (!input.lines.length || input.lines.length < 2) {
    throw new AuthError("validation", "A journal entry needs at least two lines.");
  }

  let totalDebit = 0;
  let totalCredit = 0;

  for (const line of input.lines) {
    if (line.debitCents < 0 || line.creditCents < 0) {
      throw new AuthError("validation", "Debit and credit amounts cannot be negative.");
    }
    if (line.debitCents > 0 && line.creditCents > 0) {
      throw new AuthError("validation", "Each line must be either a debit or a credit, not both.");
    }
    if (line.debitCents === 0 && line.creditCents === 0) {
      throw new AuthError("validation", "Each line must have a debit or credit amount.");
    }
    totalDebit += line.debitCents;
    totalCredit += line.creditCents;
  }

  if (totalDebit !== totalCredit) {
    throw new AuthError(
      "validation",
      `Journal entry is out of balance (debits ${totalDebit} ≠ credits ${totalCredit}).`,
    );
  }
  if (totalDebit === 0) {
    throw new AuthError("validation", "Journal entry total cannot be zero.");
  }
}

export async function listJournalEntries(
  firmId: string,
  opts?: { from?: Date; to?: Date; limit?: number },
) {
  await ensureCoaSeeded(firmId);
  const db = getDb();
  const conditions = [eq(glJournalEntries.firmId, firmId)];
  if (opts?.from) conditions.push(gte(glJournalEntries.entryDate, opts.from));
  if (opts?.to) conditions.push(lte(glJournalEntries.entryDate, opts.to));

  const entries = await db
    .select({
      entry: glJournalEntries,
      postedByName: users.fullName,
    })
    .from(glJournalEntries)
    .leftJoin(users, eq(users.id, glJournalEntries.postedBy))
    .where(and(...conditions))
    .orderBy(desc(glJournalEntries.entryDate), desc(glJournalEntries.postedAt))
    .limit(opts?.limit ?? 100);

  if (entries.length === 0) return [];

  const entryIds = entries.map((e) => e.entry.id);
  const lines = await db
    .select({
      line: glJournalLines,
      accountCode: glAccounts.code,
      accountName: glAccounts.name,
    })
    .from(glJournalLines)
    .innerJoin(glAccounts, eq(glAccounts.id, glJournalLines.accountId))
    .where(
      and(eq(glJournalLines.firmId, firmId), inArray(glJournalLines.entryId, entryIds)),
    );

  const linesByEntry = new Map<string, typeof lines>();
  for (const row of lines) {
    const list = linesByEntry.get(row.line.entryId) ?? [];
    list.push(row);
    linesByEntry.set(row.line.entryId, list);
  }

  return entries.map(({ entry, postedByName }) => ({
    entry,
    postedByName,
    lines: linesByEntry.get(entry.id) ?? [],
  }));
}

export async function getJournalEntry(firmId: string, entryId: string) {
  const db = getDb();
  const rows = await db
    .select({
      entry: glJournalEntries,
      postedByName: users.fullName,
    })
    .from(glJournalEntries)
    .leftJoin(users, eq(users.id, glJournalEntries.postedBy))
    .where(and(eq(glJournalEntries.firmId, firmId), eq(glJournalEntries.id, entryId)))
    .limit(1);

  const header = rows[0];
  if (!header) return null;

  const lines = await db
    .select({
      line: glJournalLines,
      accountCode: glAccounts.code,
      accountName: glAccounts.name,
    })
    .from(glJournalLines)
    .innerJoin(glAccounts, eq(glAccounts.id, glJournalLines.accountId))
    .where(and(eq(glJournalLines.firmId, firmId), eq(glJournalLines.entryId, entryId)))
    .orderBy(glAccounts.code);

  return { ...header, lines };
}

export async function postManualJournal(
  firmId: string,
  userId: string,
  input: ManualJournalInput,
  sourceType: GlSourceType = "manual",
  sourceId?: string | null,
) {
  validateJournalLines(input);
  await assertPeriodNotLocked(firmId, input.entryDate);
  await ensureCoaSeeded(firmId);

  for (const line of input.lines) {
    const account = await getGlAccount(firmId, line.accountId);
    if (!account) {
      throw new AuthError("validation", "One or more accounts were not found.");
    }
    if (!account.isActive) {
      throw new AuthError("validation", `Account ${account.code} is inactive.`);
    }
  }

  const db = getDb();
  return db.transaction(async (tx) => {
    const entryRows = await tx
      .insert(glJournalEntries)
      .values({
        firmId,
        entryDate: input.entryDate,
        reference: input.reference?.trim() || null,
        memo: input.memo?.trim() || null,
        sourceType,
        sourceId: sourceId ?? null,
        postedBy: userId,
      })
      .returning();

    const entry = entryRows[0]!;

    await tx.insert(glJournalLines).values(
      input.lines.map((line) => ({
        firmId,
        entryId: entry.id,
        accountId: line.accountId,
        debitCents: line.debitCents,
        creditCents: line.creditCents,
        matterId: line.matterId ?? null,
        clientId: line.clientId ?? null,
        currency: line.currency ?? "USD",
        lineMemo: line.lineMemo?.trim() || null,
      })),
    );

    return entry;
  });
}

/**
 * Reverse the live journal for a source document with an equal and opposite entry.
 * The original stays posted and points to its reversal; returns null when nothing is posted.
 */
export async function reverseJournalBySource(
  firmId: string,
  userId: string,
  sourceType: GlSourceType,
  sourceId: string,
  memo: string,
) {
  const db = getDb();
  const found = await db
    .select()
    .from(glJournalEntries)
    .where(
      and(
        eq(glJournalEntries.firmId, firmId),
        eq(glJournalEntries.sourceType, sourceType),
        eq(glJournalEntries.sourceId, sourceId),
        isNull(glJournalEntries.reversedByEntryId),
      ),
    )
    .limit(1);
  const original = found[0];
  if (!original) return null;
  const full = await getJournalEntry(firmId, original.id);
  if (!full) return null;

  const reversal = await postManualJournal(
    firmId,
    userId,
    {
      entryDate: new Date(),
      reference: original.reference ? `REV ${original.reference}`.slice(0, 60) : "REV",
      memo,
      lines: full.lines.map(({ line }) => ({
        accountId: line.accountId,
        debitCents: line.creditCents,
        creditCents: line.debitCents,
        matterId: line.matterId,
        clientId: line.clientId,
        currency: line.currency,
        lineMemo: line.lineMemo ? `Reversal: ${line.lineMemo}` : "Reversal",
      })),
    },
    sourceType,
    `${sourceId}:rev:${original.id.slice(0, 8)}`,
  );
  await db
    .update(glJournalEntries)
    .set({ reversedByEntryId: reversal.id })
    .where(and(eq(glJournalEntries.firmId, firmId), eq(glJournalEntries.id, original.id)));
  return reversal;
}

export function parseManualJournalInput(body: unknown, defaultCurrency: string): ManualJournalInput {
  if (!body || typeof body !== "object") {
    throw new AuthError("validation", "Invalid journal payload.");
  }
  const raw = body as Record<string, unknown>;
  const entryDateRaw = raw.entryDate;
  if (typeof entryDateRaw !== "string") {
    throw new AuthError("validation", "entryDate is required.");
  }
  const entryDate = new Date(entryDateRaw);
  if (Number.isNaN(entryDate.getTime())) {
    throw new AuthError("validation", "Invalid entryDate.");
  }

  if (!Array.isArray(raw.lines) || raw.lines.length === 0) {
    throw new AuthError("validation", "lines array is required.");
  }

  const lines = raw.lines.map((item, idx) => {
    if (!item || typeof item !== "object") {
      throw new AuthError("validation", `Invalid line at index ${idx}.`);
    }
    const line = item as Record<string, unknown>;
    const accountId = line.accountId;
    if (typeof accountId !== "string" || !accountId.trim()) {
      throw new AuthError("validation", `Line ${idx + 1}: accountId is required.`);
    }
    const debitCents = Number(line.debitCents ?? 0);
    const creditCents = Number(line.creditCents ?? 0);
    if (!Number.isInteger(debitCents) || !Number.isInteger(creditCents)) {
      throw new AuthError("validation", `Line ${idx + 1}: amounts must be whole cents.`);
    }
    return {
      accountId: accountId.trim(),
      debitCents,
      creditCents,
      matterId: typeof line.matterId === "string" ? line.matterId : null,
      clientId: typeof line.clientId === "string" ? line.clientId : null,
      currency: typeof line.currency === "string" ? line.currency : defaultCurrency,
      lineMemo: typeof line.lineMemo === "string" ? line.lineMemo : null,
    };
  });

  return {
    entryDate,
    reference: typeof raw.reference === "string" ? raw.reference : null,
    memo: typeof raw.memo === "string" ? raw.memo : null,
    lines,
  };
}
