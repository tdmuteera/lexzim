/**
 * Bank statement inbox (CSV import + match + rules).
 * Business: match cashbook / expenses / fee payments, or post expense+cashbook.
 * Trust: match existing trust ledger only (never invent client-tagged receipts from CSV).
 */
import "server-only";

import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { AuthError } from "@/lib/auth/types";
import { getDb } from "@/lib/db";
import {
  bankMatchRules,
  bankStatementImports,
  bankStatementLines,
  businessCashbookEntries,
  feePayments,
  firmExpenses,
  trustLedgerEntries,
} from "@/lib/db/schema";
import { bankLineHash, parseBankCsv } from "@/lib/finance/bank-csv";
import type {
  BankRuleInput,
  CreateImportInput,
  MatchLineInput,
  PostExpenseFromLineInput,
} from "@/lib/finance/bank-inbox-validation";
import { createCashbookEntry, createFirmExpense, getFirmExpense } from "@/lib/repos/firm-finance";
import { getTrustAccount } from "@/lib/repos/trust";

function dayBounds(d: Date, daysPad = 3): { from: Date; to: Date } {
  const mid = new Date(d);
  const from = new Date(mid);
  from.setUTCDate(from.getUTCDate() - daysPad);
  from.setUTCHours(0, 0, 0, 0);
  const to = new Date(mid);
  to.setUTCDate(to.getUTCDate() + daysPad);
  to.setUTCHours(23, 59, 59, 999);
  return { from, to };
}

type RuleRow = typeof bankMatchRules.$inferSelect;

function ruleMatches(
  rule: RuleRow,
  line: { amountCents: number; description: string; reference: string | null },
): boolean {
  if (rule.direction === "in" && line.amountCents <= 0) return false;
  if (rule.direction === "out" && line.amountCents >= 0) return false;
  const field =
    rule.matchField === "reference"
      ? (line.reference ?? "").toLowerCase()
      : line.description.toLowerCase();
  const needle = rule.matchValue.toLowerCase();
  if (rule.matchType === "equals") return field === needle;
  if (rule.matchType === "starts_with") return field.startsWith(needle);
  return field.includes(needle);
}

export async function listBankRules(firmId: string) {
  const db = getDb();
  return db
    .select()
    .from(bankMatchRules)
    .where(eq(bankMatchRules.firmId, firmId))
    .orderBy(asc(bankMatchRules.priority), asc(bankMatchRules.name));
}

export async function createBankRule(firmId: string, userId: string, input: BankRuleInput) {
  const db = getDb();
  const rows = await db
    .insert(bankMatchRules)
    .values({
      firmId,
      name: input.name,
      direction: input.direction,
      matchField: input.matchField,
      matchType: input.matchType,
      matchValue: input.matchValue,
      priority: input.priority,
      action: input.action,
      expenseCategory: input.expenseCategory,
      defaultPayee: input.defaultPayee,
      isActive: input.isActive,
      createdBy: userId,
      updatedAt: new Date(),
    })
    .returning();
  return rows[0]!;
}

export async function updateBankRule(
  firmId: string,
  id: string,
  input: BankRuleInput,
) {
  const db = getDb();
  const rows = await db
    .update(bankMatchRules)
    .set({
      name: input.name,
      direction: input.direction,
      matchField: input.matchField,
      matchType: input.matchType,
      matchValue: input.matchValue,
      priority: input.priority,
      action: input.action,
      expenseCategory: input.expenseCategory,
      defaultPayee: input.defaultPayee,
      isActive: input.isActive,
      updatedAt: new Date(),
    })
    .where(and(eq(bankMatchRules.firmId, firmId), eq(bankMatchRules.id, id)))
    .returning();
  return rows[0] ?? null;
}

export async function deleteBankRule(firmId: string, id: string) {
  const db = getDb();
  const rows = await db
    .delete(bankMatchRules)
    .where(and(eq(bankMatchRules.firmId, firmId), eq(bankMatchRules.id, id)))
    .returning();
  return rows[0] ?? null;
}

async function applyRulesToPending(firmId: string, importId: string) {
  const db = getDb();
  const rules = await db
    .select()
    .from(bankMatchRules)
    .where(and(eq(bankMatchRules.firmId, firmId), eq(bankMatchRules.isActive, true)))
    .orderBy(asc(bankMatchRules.priority));

  const lines = await db
    .select()
    .from(bankStatementLines)
    .where(
      and(
        eq(bankStatementLines.firmId, firmId),
        eq(bankStatementLines.importId, importId),
        eq(bankStatementLines.status, "pending"),
      ),
    );

  for (const line of lines) {
    const hit = rules.find((r) => ruleMatches(r, line));
    if (!hit) continue;
    if (hit.action === "ignore") {
      await db
        .update(bankStatementLines)
        .set({
          status: "ignored",
          appliedRuleId: hit.id,
          updatedAt: new Date(),
        })
        .where(and(eq(bankStatementLines.firmId, firmId), eq(bankStatementLines.id, line.id)));
      continue;
    }
    await db
      .update(bankStatementLines)
      .set({
        appliedRuleId: hit.id,
        suggestedCategory: hit.expenseCategory,
        suggestedPayee: hit.defaultPayee,
        updatedAt: new Date(),
      })
      .where(and(eq(bankStatementLines.firmId, firmId), eq(bankStatementLines.id, line.id)));
  }
}

export async function createBankImport(
  firmId: string,
  userId: string,
  input: CreateImportInput,
) {
  if (input.accountKind === "trust_bank") {
    const acct = await getTrustAccount(firmId, input.trustAccountId!);
    if (!acct) throw new AuthError("not_found", "Trust account not found.");
    if (acct.accountKind !== "bank") {
      throw new AuthError("validation", "Select a trust bank account (not vault).");
    }
  }

  const parsed = parseBankCsv(input.csvText);
  const db = getDb();

  const [imp] = await db
    .insert(bankStatementImports)
    .values({
      firmId,
      accountKind: input.accountKind,
      bankAccountLabel: input.bankAccountLabel,
      trustAccountId: input.trustAccountId,
      currency: input.currency,
      sourceFilename: input.sourceFilename,
      notes: input.notes,
      lineCount: 0,
      importedBy: userId,
      updatedAt: new Date(),
    })
    .returning();

  let inserted = 0;
  let skippedDup = 0;
  for (const line of parsed) {
    const rawHash = bankLineHash({
      accountKind: input.accountKind,
      bankAccountLabel: input.bankAccountLabel,
      trustAccountId: input.trustAccountId,
      lineDate: line.lineDate,
      description: line.description,
      reference: line.reference,
      amountCents: line.amountCents,
    });
    try {
      await db.insert(bankStatementLines).values({
        firmId,
        importId: imp!.id,
        lineDate: line.lineDate,
        description: line.description,
        reference: line.reference,
        amountCents: line.amountCents,
        currency: input.currency,
        rawHash,
        status: "pending",
        updatedAt: new Date(),
      });
      inserted += 1;
    } catch {
      skippedDup += 1;
    }
  }

  await db
    .update(bankStatementImports)
    .set({ lineCount: inserted, updatedAt: new Date() })
    .where(and(eq(bankStatementImports.firmId, firmId), eq(bankStatementImports.id, imp!.id)));

  if (inserted === 0) {
    await db
      .delete(bankStatementImports)
      .where(and(eq(bankStatementImports.firmId, firmId), eq(bankStatementImports.id, imp!.id)));
    throw new AuthError(
      "validation",
      skippedDup
        ? "All CSV lines were duplicates of lines already imported for this firm."
        : "No lines were imported.",
    );
  }

  await applyRulesToPending(firmId, imp!.id);
  return { import: await getBankImport(firmId, imp!.id), inserted, skippedDup };
}

export async function listBankImports(firmId: string) {
  const db = getDb();
  return db
    .select()
    .from(bankStatementImports)
    .where(eq(bankStatementImports.firmId, firmId))
    .orderBy(desc(bankStatementImports.createdAt))
    .limit(50);
}

export async function getBankImport(firmId: string, id: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(bankStatementImports)
    .where(and(eq(bankStatementImports.firmId, firmId), eq(bankStatementImports.id, id)))
    .limit(1);
  return rows[0] ?? null;
}

export async function listBankImportLines(
  firmId: string,
  importId: string,
  opts?: { status?: string },
) {
  const db = getDb();
  const conditions = [
    eq(bankStatementLines.firmId, firmId),
    eq(bankStatementLines.importId, importId),
  ];
  if (opts?.status) conditions.push(eq(bankStatementLines.status, opts.status));
  return db
    .select()
    .from(bankStatementLines)
    .where(and(...conditions))
    .orderBy(asc(bankStatementLines.lineDate), asc(bankStatementLines.createdAt));
}

export async function getBankLine(firmId: string, id: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(bankStatementLines)
    .where(and(eq(bankStatementLines.firmId, firmId), eq(bankStatementLines.id, id)))
    .limit(1);
  return rows[0] ?? null;
}

export type MatchCandidate = {
  entityType: "cashbook" | "expense" | "fee_payment" | "trust_ledger";
  entityId: string;
  label: string;
  amountCents: number;
  occurredAt: string;
};

export async function suggestMatchesForLine(
  firmId: string,
  lineId: string,
): Promise<MatchCandidate[]> {
  const line = await getBankLine(firmId, lineId);
  if (!line) throw new AuthError("not_found", "Bank line not found.");
  const imp = await getBankImport(firmId, line.importId);
  if (!imp) throw new AuthError("not_found", "Import not found.");

  const abs = Math.abs(line.amountCents);
  const { from, to } = dayBounds(line.lineDate, 4);
  const db = getDb();
  const out: MatchCandidate[] = [];

  if (imp.accountKind === "business_bank") {
    const entryType = line.amountCents > 0 ? "in" : "out";
    const cash = await db
      .select()
      .from(businessCashbookEntries)
      .where(
        and(
          eq(businessCashbookEntries.firmId, firmId),
          eq(businessCashbookEntries.entryType, entryType),
          eq(businessCashbookEntries.amountCents, abs),
          gte(businessCashbookEntries.entryDate, from),
          lte(businessCashbookEntries.entryDate, to),
        ),
      )
      .limit(20);
    for (const c of cash) {
      if (imp.bankAccountLabel && c.bankAccountLabel && c.bankAccountLabel !== imp.bankAccountLabel) {
        continue;
      }
      out.push({
        entityType: "cashbook",
        entityId: c.id,
        label: `Cashbook ${c.entryType} ${c.notes ?? c.reference ?? ""}`.trim(),
        amountCents: c.entryType === "in" ? c.amountCents : -c.amountCents,
        occurredAt: c.entryDate.toISOString(),
      });
    }

    if (line.amountCents < 0) {
      const exps = await db
        .select()
        .from(firmExpenses)
        .where(
          and(
            eq(firmExpenses.firmId, firmId),
            eq(firmExpenses.amountCents, abs),
            gte(firmExpenses.expenseDate, from),
            lte(firmExpenses.expenseDate, to),
          ),
        )
        .limit(20);
      for (const e of exps) {
        out.push({
          entityType: "expense",
          entityId: e.id,
          label: `Expense ${e.payee} (${e.category})`,
          amountCents: -e.amountCents,
          occurredAt: e.expenseDate.toISOString(),
        });
      }
    } else {
      const fps = await db
        .select()
        .from(feePayments)
        .where(
          and(
            eq(feePayments.firmId, firmId),
            eq(feePayments.amountCents, abs),
            gte(feePayments.paidAt, from),
            lte(feePayments.paidAt, to),
          ),
        )
        .limit(20);
      for (const f of fps) {
        out.push({
          entityType: "fee_payment",
          entityId: f.id,
          label: `Fee payment ${f.reference ?? f.id.slice(0, 8)}`,
          amountCents: f.amountCents,
          occurredAt: f.paidAt.toISOString(),
        });
      }
    }
  } else {
    const ledger = await db
      .select()
      .from(trustLedgerEntries)
      .where(
        and(
          eq(trustLedgerEntries.firmId, firmId),
          eq(trustLedgerEntries.trustAccountId, imp.trustAccountId!),
          eq(trustLedgerEntries.amountCents, line.amountCents),
          gte(trustLedgerEntries.occurredAt, from),
          lte(trustLedgerEntries.occurredAt, to),
        ),
      )
      .limit(20);
    for (const t of ledger) {
      out.push({
        entityType: "trust_ledger",
        entityId: t.id,
        label: `Trust ${t.entryType} ${t.narrative ?? t.reference ?? ""}`.trim(),
        amountCents: t.amountCents,
        occurredAt: t.occurredAt.toISOString(),
      });
    }
  }

  return out;
}

export async function matchBankLine(
  firmId: string,
  lineId: string,
  input: MatchLineInput,
) {
  const line = await getBankLine(firmId, lineId);
  if (!line) throw new AuthError("not_found", "Bank line not found.");
  if (line.status !== "pending") {
    throw new AuthError("validation", "Only pending lines can be matched.");
  }
  const imp = await getBankImport(firmId, line.importId);
  if (!imp) throw new AuthError("not_found", "Import not found.");

  const db = getDb();
  if (input.matchedEntityType === "cashbook") {
    if (imp.accountKind !== "business_bank") {
      throw new AuthError("validation", "Cashbook match is only for business bank imports.");
    }
    const rows = await db
      .select()
      .from(businessCashbookEntries)
      .where(
        and(
          eq(businessCashbookEntries.firmId, firmId),
          eq(businessCashbookEntries.id, input.matchedEntityId),
        ),
      )
      .limit(1);
    if (!rows[0]) throw new AuthError("not_found", "Cashbook entry not found.");
  } else if (input.matchedEntityType === "expense") {
    const exp = await getFirmExpense(firmId, input.matchedEntityId);
    if (!exp) throw new AuthError("not_found", "Expense not found.");
  } else if (input.matchedEntityType === "fee_payment") {
    const rows = await db
      .select()
      .from(feePayments)
      .where(and(eq(feePayments.firmId, firmId), eq(feePayments.id, input.matchedEntityId)))
      .limit(1);
    if (!rows[0]) throw new AuthError("not_found", "Fee payment not found.");
  } else if (input.matchedEntityType === "trust_ledger") {
    if (imp.accountKind !== "trust_bank") {
      throw new AuthError("validation", "Trust ledger match is only for trust bank imports.");
    }
    const rows = await db
      .select()
      .from(trustLedgerEntries)
      .where(
        and(
          eq(trustLedgerEntries.firmId, firmId),
          eq(trustLedgerEntries.id, input.matchedEntityId),
          eq(trustLedgerEntries.trustAccountId, imp.trustAccountId!),
        ),
      )
      .limit(1);
    if (!rows[0]) throw new AuthError("not_found", "Trust ledger entry not found.");
  }

  const rows = await db
    .update(bankStatementLines)
    .set({
      status: "matched",
      matchedEntityType: input.matchedEntityType,
      matchedEntityId: input.matchedEntityId,
      updatedAt: new Date(),
    })
    .where(and(eq(bankStatementLines.firmId, firmId), eq(bankStatementLines.id, lineId)))
    .returning();
  return rows[0]!;
}

export async function ignoreBankLine(firmId: string, lineId: string) {
  const line = await getBankLine(firmId, lineId);
  if (!line) throw new AuthError("not_found", "Bank line not found.");
  if (line.status !== "pending") {
    throw new AuthError("validation", "Only pending lines can be ignored.");
  }
  const db = getDb();
  const rows = await db
    .update(bankStatementLines)
    .set({ status: "ignored", updatedAt: new Date() })
    .where(and(eq(bankStatementLines.firmId, firmId), eq(bankStatementLines.id, lineId)))
    .returning();
  return rows[0]!;
}

/** Post a money-out business line as firm expense (cash from operating bank) + cashbook out. */
export async function postExpenseFromBankLine(
  firmId: string,
  userId: string,
  lineId: string,
  input: PostExpenseFromLineInput,
) {
  const line = await getBankLine(firmId, lineId);
  if (!line) throw new AuthError("not_found", "Bank line not found.");
  if (line.status !== "pending") {
    throw new AuthError("validation", "Only pending lines can be posted.");
  }
  if (line.amountCents >= 0) {
    throw new AuthError("validation", "Expense posting is only for money-out lines.");
  }
  const imp = await getBankImport(firmId, line.importId);
  if (!imp || imp.accountKind !== "business_bank") {
    throw new AuthError("validation", "Expense posting is only for business bank imports.");
  }

  const expense = await createFirmExpense(firmId, userId, {
    expenseDate: line.lineDate,
    category: input.category,
    payee: input.payee,
    amountCents: Math.abs(line.amountCents),
    currency: line.currency,
    matterId: null,
    paymentMethod: "bank",
    notes: input.notes ?? `Bank import: ${line.description}`,
    glAccountId: null,
    paymentSource: "cash",
    budgetMonth: null,
  });

  await createCashbookEntry(firmId, userId, {
    entryDate: line.lineDate,
    entryType: "out",
    amountCents: Math.abs(line.amountCents),
    currency: line.currency,
    reference: line.reference,
    bankAccountLabel: imp.bankAccountLabel,
    expenseId: expense.id,
    feePaymentId: null,
    notes: line.description,
  });

  const db = getDb();
  const rows = await db
    .update(bankStatementLines)
    .set({
      status: "posted",
      matchedEntityType: "expense",
      matchedEntityId: expense.id,
      updatedAt: new Date(),
    })
    .where(and(eq(bankStatementLines.firmId, firmId), eq(bankStatementLines.id, lineId)))
    .returning();
  return { line: rows[0]!, expense };
}

/** Post money-in business line as other cashbook receipt (does not create fee invoices). */
export async function postCashbookInFromBankLine(
  firmId: string,
  userId: string,
  lineId: string,
  notes?: string | null,
) {
  const line = await getBankLine(firmId, lineId);
  if (!line) throw new AuthError("not_found", "Bank line not found.");
  if (line.status !== "pending") {
    throw new AuthError("validation", "Only pending lines can be posted.");
  }
  if (line.amountCents <= 0) {
    throw new AuthError("validation", "Cashbook-in posting is only for money-in lines.");
  }
  const imp = await getBankImport(firmId, line.importId);
  if (!imp || imp.accountKind !== "business_bank") {
    throw new AuthError("validation", "Cashbook posting is only for business bank imports.");
  }

  const entry = await createCashbookEntry(firmId, userId, {
    entryDate: line.lineDate,
    entryType: "in",
    amountCents: line.amountCents,
    currency: line.currency,
    reference: line.reference,
    bankAccountLabel: imp.bankAccountLabel,
    expenseId: null,
    feePaymentId: null,
    notes: notes ?? line.description,
  });

  const db = getDb();
  const rows = await db
    .update(bankStatementLines)
    .set({
      status: "posted",
      matchedEntityType: "cashbook",
      matchedEntityId: entry.id,
      updatedAt: new Date(),
    })
    .where(and(eq(bankStatementLines.firmId, firmId), eq(bankStatementLines.id, lineId)))
    .returning();
  return { line: rows[0]!, entry };
}

export async function closeBankImport(firmId: string, id: string) {
  const pending = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(bankStatementLines)
    .where(
      and(
        eq(bankStatementLines.firmId, firmId),
        eq(bankStatementLines.importId, id),
        eq(bankStatementLines.status, "pending"),
      ),
    );
  if ((pending[0]?.n ?? 0) > 0) {
    throw new AuthError(
      "validation",
      "Clear or ignore all pending lines before closing this import.",
    );
  }
  const rows = await getDb()
    .update(bankStatementImports)
    .set({ status: "closed", updatedAt: new Date() })
    .where(and(eq(bankStatementImports.firmId, firmId), eq(bankStatementImports.id, id)))
    .returning();
  return rows[0] ?? null;
}

export async function importCounts(firmId: string, importId: string) {
  const db = getDb();
  const rows = await db
    .select({
      status: bankStatementLines.status,
      n: sql<number>`count(*)::int`,
    })
    .from(bankStatementLines)
    .where(
      and(eq(bankStatementLines.firmId, firmId), eq(bankStatementLines.importId, importId)),
    )
    .groupBy(bankStatementLines.status);
  const counts = { pending: 0, matched: 0, ignored: 0, posted: 0 };
  for (const r of rows) {
    if (r.status in counts) counts[r.status as keyof typeof counts] = r.n;
  }
  return counts;
}
