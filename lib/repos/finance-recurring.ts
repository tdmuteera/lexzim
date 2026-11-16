/**
 * Recurring finance templates: create expenses, creditor bills, or draft fee invoices.
 */
import "server-only";

import { and, asc, eq, lte, sql } from "drizzle-orm";
import { AuthError } from "@/lib/auth/types";
import { getDb } from "@/lib/db";
import { financeRecurringTemplates, firms } from "@/lib/db/schema";
import {
  advanceRunDate,
  todayIsoHarareApprox,
  type CreditorBillPayload,
  type ExpensePayload,
  type FeeInvoicePayload,
  type RecurringTemplateInput,
} from "@/lib/finance/recurring-validation";
import { createInvoiceFromServices } from "@/lib/repos/billing";
import { createCreditorInvoice } from "@/lib/repos/creditors";
import { createFirmExpense } from "@/lib/repos/firm-finance";

export async function listRecurringTemplates(firmId: string, opts?: { activeOnly?: boolean }) {
  const db = getDb();
  const conditions = [eq(financeRecurringTemplates.firmId, firmId)];
  if (opts?.activeOnly) conditions.push(eq(financeRecurringTemplates.isActive, true));
  return db
    .select()
    .from(financeRecurringTemplates)
    .where(and(...conditions))
    .orderBy(asc(financeRecurringTemplates.nextRunOn), asc(financeRecurringTemplates.name));
}

export async function getRecurringTemplate(firmId: string, id: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(financeRecurringTemplates)
    .where(
      and(eq(financeRecurringTemplates.firmId, firmId), eq(financeRecurringTemplates.id, id)),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function createRecurringTemplate(
  firmId: string,
  userId: string,
  input: RecurringTemplateInput,
) {
  const db = getDb();
  const rows = await db
    .insert(financeRecurringTemplates)
    .values({
      firmId,
      name: input.name,
      kind: input.kind,
      mode: input.mode,
      intervalUnit: input.intervalUnit,
      intervalCount: input.intervalCount,
      nextRunOn: input.nextRunOn,
      endOn: input.endOn,
      isActive: input.isActive,
      currency: input.currency,
      amountCents: input.amountCents,
      payloadJson: input.payload as unknown as Record<string, unknown>,
      createdBy: userId,
      updatedAt: new Date(),
    })
    .returning();
  return rows[0]!;
}

export async function updateRecurringTemplate(
  firmId: string,
  id: string,
  input: RecurringTemplateInput,
) {
  const db = getDb();
  const rows = await db
    .update(financeRecurringTemplates)
    .set({
      name: input.name,
      kind: input.kind,
      mode: input.mode,
      intervalUnit: input.intervalUnit,
      intervalCount: input.intervalCount,
      nextRunOn: input.nextRunOn,
      endOn: input.endOn,
      isActive: input.isActive,
      currency: input.currency,
      amountCents: input.amountCents,
      payloadJson: input.payload as unknown as Record<string, unknown>,
      updatedAt: new Date(),
    })
    .where(
      and(eq(financeRecurringTemplates.firmId, firmId), eq(financeRecurringTemplates.id, id)),
    )
    .returning();
  return rows[0] ?? null;
}

export async function deleteRecurringTemplate(firmId: string, id: string) {
  const db = getDb();
  const rows = await db
    .delete(financeRecurringTemplates)
    .where(
      and(eq(financeRecurringTemplates.firmId, firmId), eq(financeRecurringTemplates.id, id)),
    )
    .returning();
  return rows[0] ?? null;
}

type TemplateRow = typeof financeRecurringTemplates.$inferSelect;

function isoToDate(iso: string): Date {
  return new Date(iso + "T12:00:00.000Z");
}

async function createFromTemplate(
  firmId: string,
  actorUserId: string,
  row: TemplateRow,
): Promise<{ entityType: string; entityId: string }> {
  if (row.kind === "expense") {
    const payload = row.payloadJson as unknown as ExpensePayload;
    if (!row.amountCents) throw new AuthError("validation", "Template amount is missing.");
    const expense = await createFirmExpense(firmId, actorUserId, {
      expenseDate: isoToDate(row.nextRunOn),
      category: payload.category,
      payee: payload.payee,
      amountCents: row.amountCents,
      currency: row.currency,
      matterId: null,
      paymentMethod: "recurring",
      notes: payload.notes ?? `Recurring: ${row.name}`,
      glAccountId: null,
      paymentSource: payload.paymentSource ?? "cash",
      budgetMonth: row.nextRunOn.slice(0, 7),
    });
    return { entityType: "expense", entityId: expense.id };
  }

  if (row.kind === "creditor_bill") {
    const payload = row.payloadJson as unknown as CreditorBillPayload;
    if (!row.amountCents) throw new AuthError("validation", "Template amount is missing.");
    const invoiceDate = isoToDate(row.nextRunOn);
    const due = new Date(invoiceDate);
    due.setUTCDate(due.getUTCDate() + (payload.dueDays ?? 14));
    const bill = await createCreditorInvoice(firmId, actorUserId, {
      creditorId: payload.creditorId,
      invoiceDate,
      dueDate: due,
      amountCents: row.amountCents,
      currency: row.currency,
      reference: payload.reference ?? row.name,
      expenseAccountId: payload.expenseAccountId,
      notes: payload.notes ?? `Recurring: ${row.name}`,
    });
    return { entityType: "creditor_invoice", entityId: bill.id };
  }

  if (row.kind === "fee_invoice") {
    const payload = row.payloadJson as unknown as FeeInvoicePayload;
    const invoice = await createInvoiceFromServices(
      firmId,
      actorUserId,
      {
        clientId: payload.clientId,
        matterId: payload.matterId,
        notes: payload.notes ?? `Recurring: ${row.name}`,
        subject: payload.subject,
        currency: row.currency,
        lines: payload.lines.map((l) => ({
          description: l.description,
          qty: l.qty,
          unitPriceCents: l.unitPriceCents,
          firmServiceId: l.firmServiceId,
        })),
      },
      { currency: row.currency },
    );
    return { entityType: "invoice", entityId: invoice.id };
  }

  throw new AuthError("validation", `Unsupported recurring kind: ${row.kind}`);
}

function nextAfterRun(row: TemplateRow): string | null {
  const next = advanceRunDate(row.nextRunOn, row.intervalUnit as "weekly" | "monthly" | "yearly", row.intervalCount);
  if (row.endOn && next > row.endOn) return null;
  return next;
}

/**
 * Run one template.
 * - scheduled / unscheduled (force): create the document
 * - reminder without forceCreate: acknowledge due only (advance date, no post)
 * - reminder with forceCreate: create then advance
 */
export async function runRecurringTemplate(
  firmId: string,
  id: string,
  actorUserId: string,
  opts?: { forceCreate?: boolean; ignoreDueDate?: boolean },
) {
  const row = await getRecurringTemplate(firmId, id);
  if (!row) throw new AuthError("not_found", "Recurring template not found.");
  if (!row.isActive) throw new AuthError("validation", "Template is inactive.");

  const today = todayIsoHarareApprox();
  if (!opts?.ignoreDueDate && row.mode !== "unscheduled" && row.nextRunOn > today) {
    throw new AuthError("validation", `Not due yet (next run ${row.nextRunOn}).`);
  }

  const shouldCreate =
    row.mode === "scheduled" ||
    row.mode === "unscheduled" ||
    Boolean(opts?.forceCreate);

  const db = getDb();
  try {
    let entityType: string | null = null;
    let entityId: string | null = null;
    if (shouldCreate) {
      const created = await createFromTemplate(firmId, actorUserId, row);
      entityType = created.entityType;
      entityId = created.entityId;
    }

    const next = nextAfterRun(row);
    const [updated] = await db
      .update(financeRecurringTemplates)
      .set({
        lastRunOn: today,
        lastRunStatus: shouldCreate ? "created" : "reminded",
        lastRunEntityType: entityType,
        lastRunEntityId: entityId,
        lastRunError: null,
        nextRunOn: next ?? row.nextRunOn,
        isActive: next ? row.isActive : false,
        updatedAt: new Date(),
      })
      .where(
        and(eq(financeRecurringTemplates.firmId, firmId), eq(financeRecurringTemplates.id, id)),
      )
      .returning();

    return {
      template: updated!,
      created: shouldCreate,
      entityType,
      entityId,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Run failed.";
    await db
      .update(financeRecurringTemplates)
      .set({
        lastRunOn: today,
        lastRunStatus: "error",
        lastRunError: message.slice(0, 500),
        updatedAt: new Date(),
      })
      .where(
        and(eq(financeRecurringTemplates.firmId, firmId), eq(financeRecurringTemplates.id, id)),
      );
    throw err;
  }
}

/** Due scheduled templates for a firm (next_run_on <= today). */
export async function listDueRecurringTemplates(firmId: string, asOf = todayIsoHarareApprox()) {
  const db = getDb();
  return db
    .select()
    .from(financeRecurringTemplates)
    .where(
      and(
        eq(financeRecurringTemplates.firmId, firmId),
        eq(financeRecurringTemplates.isActive, true),
        lte(financeRecurringTemplates.nextRunOn, asOf),
        sql`${financeRecurringTemplates.mode} in ('scheduled', 'reminder')`,
      ),
    )
    .orderBy(asc(financeRecurringTemplates.nextRunOn));
}

export async function runDueRecurringForFirm(
  firmId: string,
  actorUserId: string,
  asOf = todayIsoHarareApprox(),
) {
  const due = await listDueRecurringTemplates(firmId, asOf);
  const results: Array<{
    id: string;
    name: string;
    ok: boolean;
    created?: boolean;
    entityType?: string | null;
    entityId?: string | null;
    error?: string;
  }> = [];

  for (const row of due) {
    try {
      // Reminders: acknowledge only. Scheduled: create.
      const forceCreate = false;
      const out = await runRecurringTemplate(firmId, row.id, actorUserId, {
        forceCreate,
        ignoreDueDate: true,
      });
      results.push({
        id: row.id,
        name: row.name,
        ok: true,
        created: out.created,
        entityType: out.entityType,
        entityId: out.entityId,
      });
    } catch (err) {
      results.push({
        id: row.id,
        name: row.name,
        ok: false,
        error: err instanceof Error ? err.message : "failed",
      });
    }
  }
  return results;
}

/** Cron: run scheduled (create) / reminder (ack) templates for every firm. */
export async function runDueRecurringForAllFirms(asOf = todayIsoHarareApprox()) {
  const db = getDb();
  const firmRows = await db
    .select({ id: firms.id, name: firms.name })
    .from(firms)
    .where(sql`${firms.status} in ('active', 'trial', 'demo')`);

  const out: Array<{ firmId: string; firmName: string; results: Awaited<ReturnType<typeof runDueRecurringForFirm>> }> =
    [];

  for (const firm of firmRows) {
    const due = await listDueRecurringTemplates(firm.id, asOf);
    if (!due.length) {
      out.push({ firmId: firm.id, firmName: firm.name, results: [] });
      continue;
    }
    // Prefer template owner; fall back to skipping if none.
    const results: Awaited<ReturnType<typeof runDueRecurringForFirm>> = [];
    for (const row of due) {
      const actor = row.createdBy;
      if (!actor) {
        results.push({
          id: row.id,
          name: row.name,
          ok: false,
          error: "Template has no createdBy user for cron runs.",
        });
        continue;
      }
      try {
        const ran = await runRecurringTemplate(firm.id, row.id, actor, {
          ignoreDueDate: true,
        });
        results.push({
          id: row.id,
          name: row.name,
          ok: true,
          created: ran.created,
          entityType: ran.entityType,
          entityId: ran.entityId,
        });
      } catch (err) {
        results.push({
          id: row.id,
          name: row.name,
          ok: false,
          error: err instanceof Error ? err.message : "failed",
        });
      }
    }
    out.push({ firmId: firm.id, firmName: firm.name, results });
  }
  return out;
}
