/**
 * Billing repository (P3-01 stubs + P3-05 time + P3-06 disbursements + P3-07 invoices).
 * EVERY firm-scoped query MUST filter firmId.
 * Fee payments are separate from trust ledger. Never auto-post to trust.
 */
import { and, asc, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import type {
  CreateInvoiceInput,
  CreateServiceInvoiceInput,
  DisbursementInput,
  FeePaymentInput,
  InvoiceStatusValue,
  TimeEntryInput,
} from "@/lib/billing/validation";
import { assertInvoiceStatusTransition } from "@/lib/billing/validation";
import { postDisbursementGl } from "@/lib/gl/posting-disbursements";
import { describeTimeLine } from "@/lib/billing/serialize";
import { timeEntryAmountCents } from "@/lib/billing/money";
import { AuthError } from "@/lib/auth/types";
import { getDb } from "@/lib/db";
import {
  clients,
  disbursements,
  feePayments,
  firmServices,
  invoiceLines,
  invoices,
  matters,
  timeEntries,
  users,
} from "@/lib/db/schema";
import {
  postFeePaymentGl,
  postInvoiceSentGl,
  reverseInvoiceSentGl,
} from "@/lib/gl/posting-invoices";
import { lineTotalCents } from "@/lib/quotes/validation";
import {
  quotationDiscountCents,
  quotationSubtotalCents,
  quotationTotalCents,
} from "@/lib/quotes/totals";
import {
  allocateInvoiceNumber,
  allocateReceiptNumber,
  getInvoiceDueDays,
} from "@/lib/repos/firm-settings";

export async function listTimeEntries(firmId: string, matterId?: string) {
  const db = getDb();
  const conditions = [eq(timeEntries.firmId, firmId)];
  if (matterId) conditions.push(eq(timeEntries.matterId, matterId));
  return db
    .select({
      entry: timeEntries,
      userName: users.fullName,
    })
    .from(timeEntries)
    .leftJoin(users, eq(users.id, timeEntries.userId))
    .where(and(...conditions))
    .orderBy(desc(timeEntries.workedAt));
}

export async function getTimeEntry(firmId: string, id: string) {
  const db = getDb();
  const rows = await db
    .select({
      entry: timeEntries,
      userName: users.fullName,
    })
    .from(timeEntries)
    .leftJoin(users, eq(users.id, timeEntries.userId))
    .where(and(eq(timeEntries.firmId, firmId), eq(timeEntries.id, id)))
    .limit(1);
  return rows[0] ?? null;
}

export async function createTimeEntry(
  firmId: string,
  matterId: string,
  input: TimeEntryInput,
) {
  const db = getDb();
  const rows = await db
    .insert(timeEntries)
    .values({
      firmId,
      matterId,
      userId: input.userId,
      workedAt: input.workedAt,
      minutes: input.minutes,
      billable: input.billable,
      rateCents: input.rateCents,
      currency: input.currency,
      description: input.description,
      updatedAt: new Date(),
    })
    .returning();
  return rows[0]!;
}

export async function updateTimeEntry(
  firmId: string,
  id: string,
  input: TimeEntryInput,
) {
  const existing = await getTimeEntry(firmId, id);
  if (!existing) return null;
  if (existing.entry.invoiceId) {
    throw new AuthError(
      "validation",
      "This time entry is locked on an invoice and cannot be edited.",
    );
  }

  const db = getDb();
  const rows = await db
    .update(timeEntries)
    .set({
      userId: input.userId,
      workedAt: input.workedAt,
      minutes: input.minutes,
      billable: input.billable,
      rateCents: input.rateCents,
      currency: input.currency,
      description: input.description,
      updatedAt: new Date(),
    })
    .where(and(eq(timeEntries.firmId, firmId), eq(timeEntries.id, id)))
    .returning();
  return rows[0] ?? null;
}

export async function deleteTimeEntry(firmId: string, id: string) {
  const existing = await getTimeEntry(firmId, id);
  if (!existing) return null;
  if (existing.entry.invoiceId) {
    throw new AuthError(
      "validation",
      "This time entry is locked on an invoice and cannot be deleted.",
    );
  }

  const db = getDb();
  const rows = await db
    .delete(timeEntries)
    .where(and(eq(timeEntries.firmId, firmId), eq(timeEntries.id, id)))
    .returning({ id: timeEntries.id });
  return rows[0] ?? null;
}

export async function getMatterTimeTotals(firmId: string, matterId: string) {
  const rows = await listTimeEntries(firmId, matterId);
  let billableMinutes = 0;
  let nonBillableMinutes = 0;
  let unbilledMinutes = 0;
  let unbilledAmountCents = 0;
  let lockedMinutes = 0;
  const currencyCounts = new Map<string, number>();

  for (const { entry } of rows) {
    if (entry.billable) {
      billableMinutes += entry.minutes;
      if (!entry.invoiceId) {
        unbilledMinutes += entry.minutes;
        const amt = timeEntryAmountCents(entry.minutes, entry.rateCents);
        if (amt != null) {
          unbilledAmountCents += amt;
          const cur = entry.currency || "USD";
          currencyCounts.set(cur, (currencyCounts.get(cur) ?? 0) + 1);
        }
      } else {
        lockedMinutes += entry.minutes;
      }
    } else {
      nonBillableMinutes += entry.minutes;
    }
  }

  let currency = "USD";
  let best = 0;
  for (const [cur, n] of currencyCounts) {
    if (n > best) {
      best = n;
      currency = cur;
    }
  }

  return {
    entryCount: rows.length,
    billableMinutes,
    nonBillableMinutes,
    unbilledMinutes,
    unbilledAmountCents,
    lockedMinutes,
    currency,
  };
}

export async function listDisbursements(firmId: string, matterId?: string) {
  const db = getDb();
  const conditions = [eq(disbursements.firmId, firmId)];
  if (matterId) conditions.push(eq(disbursements.matterId, matterId));
  return db
    .select()
    .from(disbursements)
    .where(and(...conditions))
    .orderBy(desc(disbursements.incurredAt));
}

export async function getDisbursement(firmId: string, id: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(disbursements)
    .where(and(eq(disbursements.firmId, firmId), eq(disbursements.id, id)))
    .limit(1);
  return rows[0] ?? null;
}

export async function createDisbursement(
  firmId: string,
  matterId: string,
  userId: string,
  input: DisbursementInput,
) {
  const db = getDb();
  const rows = await db
    .insert(disbursements)
    .values({
      firmId,
      matterId,
      description: input.description,
      amountCents: input.amountCents,
      currency: input.currency,
      incurredAt: input.incurredAt,
      billable: input.billable,
      paidFrom: input.paidFrom,
      createdBy: userId,
    })
    .returning();
  const row = rows[0]!;
  if (row.billable) {
    await postDisbursementGl(firmId, userId, row.id);
  }
  return row;
}

export async function updateDisbursement(
  firmId: string,
  id: string,
  input: DisbursementInput,
) {
  const existing = await getDisbursement(firmId, id);
  if (!existing) return null;
  if (existing.invoiceId) {
    throw new AuthError(
      "validation",
      "This disbursement is locked on an invoice and cannot be edited.",
    );
  }

  const db = getDb();
  const rows = await db
    .update(disbursements)
    .set({
      description: input.description,
      amountCents: input.amountCents,
      currency: input.currency,
      incurredAt: input.incurredAt,
      billable: input.billable,
      paidFrom: input.paidFrom,
    })
    .where(and(eq(disbursements.firmId, firmId), eq(disbursements.id, id)))
    .returning();
  return rows[0] ?? null;
}

export async function deleteDisbursement(firmId: string, id: string) {
  const existing = await getDisbursement(firmId, id);
  if (!existing) return null;
  if (existing.invoiceId) {
    throw new AuthError(
      "validation",
      "This disbursement is locked on an invoice and cannot be deleted.",
    );
  }

  const db = getDb();
  const rows = await db
    .delete(disbursements)
    .where(and(eq(disbursements.firmId, firmId), eq(disbursements.id, id)))
    .returning({ id: disbursements.id });
  return rows[0] ?? null;
}

export async function getMatterDisbursementTotals(firmId: string, matterId: string) {
  const rows = await listDisbursements(firmId, matterId);
  let billableAmountCents = 0;
  let nonBillableAmountCents = 0;
  let unbilledAmountCents = 0;
  let lockedAmountCents = 0;
  const currencyCounts = new Map<string, number>();

  for (const row of rows) {
    if (row.billable) {
      billableAmountCents += row.amountCents;
      if (!row.invoiceId) {
        unbilledAmountCents += row.amountCents;
        currencyCounts.set(row.currency, (currencyCounts.get(row.currency) ?? 0) + 1);
      } else {
        lockedAmountCents += row.amountCents;
      }
    } else {
      nonBillableAmountCents += row.amountCents;
    }
  }

  let currency = "USD";
  let best = 0;
  for (const [cur, n] of currencyCounts) {
    if (n > best) {
      best = n;
      currency = cur;
    }
  }
  if (!currencyCounts.size && rows[0]) currency = rows[0].currency;

  return {
    entryCount: rows.length,
    billableAmountCents,
    nonBillableAmountCents,
    unbilledAmountCents,
    lockedAmountCents,
    currency,
  };
}

export async function listInvoices(
  firmId: string,
  opts?: { matterId?: string; status?: string },
) {
  const db = getDb();
  const conditions = [eq(invoices.firmId, firmId)];
  if (opts?.matterId) conditions.push(eq(invoices.matterId, opts.matterId));
  if (opts?.status) conditions.push(eq(invoices.status, opts.status));

  return db
    .select({
      invoice: invoices,
      matterTitle: matters.title,
      matterNumber: matters.matterNumber,
      clientFullName: clients.fullName,
      clientLegalName: clients.legalName,
      clientTradingName: clients.tradingName,
      clientType: clients.clientType,
      clientNumber: clients.clientNumber,
    })
    .from(invoices)
    .innerJoin(matters, and(eq(matters.id, invoices.matterId), eq(matters.firmId, firmId)))
    .leftJoin(clients, and(eq(clients.id, invoices.clientId), eq(clients.firmId, firmId)))
    .where(and(...conditions))
    .orderBy(desc(invoices.createdAt));
}

/** Invoices awaiting pre-send approval (approval_state = pending). */
export async function listPendingApprovalInvoices(firmId: string, limit = 50) {
  const db = getDb();
  return db
    .select({
      invoice: invoices,
      matterTitle: matters.title,
      matterNumber: matters.matterNumber,
      clientFullName: clients.fullName,
      clientLegalName: clients.legalName,
      clientTradingName: clients.tradingName,
      clientType: clients.clientType,
      clientNumber: clients.clientNumber,
    })
    .from(invoices)
    .innerJoin(matters, and(eq(matters.id, invoices.matterId), eq(matters.firmId, firmId)))
    .leftJoin(clients, and(eq(clients.id, invoices.clientId), eq(clients.firmId, firmId)))
    .where(and(eq(invoices.firmId, firmId), eq(invoices.approvalState, "pending")))
    .orderBy(desc(invoices.submittedAt), desc(invoices.createdAt))
    .limit(limit);
}

export async function getInvoice(firmId: string, invoiceId: string) {
  const db = getDb();
  const rows = await db
    .select({
      invoice: invoices,
      matterTitle: matters.title,
      matterNumber: matters.matterNumber,
      clientFullName: clients.fullName,
      clientLegalName: clients.legalName,
      clientTradingName: clients.tradingName,
      clientType: clients.clientType,
      clientNumber: clients.clientNumber,
      clientEmail: clients.email,
      clientPhysicalAddress: clients.physicalAddress,
      clientPostalAddress: clients.postalAddress,
    })
    .from(invoices)
    .innerJoin(matters, and(eq(matters.id, invoices.matterId), eq(matters.firmId, firmId)))
    .leftJoin(clients, and(eq(clients.id, invoices.clientId), eq(clients.firmId, firmId)))
    .where(and(eq(invoices.firmId, firmId), eq(invoices.id, invoiceId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function listInvoiceLines(firmId: string, invoiceId: string) {
  const db = getDb();
  return db
    .select()
    .from(invoiceLines)
    .where(and(eq(invoiceLines.firmId, firmId), eq(invoiceLines.invoiceId, invoiceId)))
    .orderBy(asc(invoiceLines.sortOrder), asc(invoiceLines.createdAt));
}

export async function listFeePayments(firmId: string, invoiceId?: string) {
  const db = getDb();
  const conditions = [eq(feePayments.firmId, firmId)];
  if (invoiceId) conditions.push(eq(feePayments.invoiceId, invoiceId));
  return db
    .select()
    .from(feePayments)
    .where(and(...conditions))
    .orderBy(desc(feePayments.paidAt));
}

export async function sumFeePayments(firmId: string, invoiceId: string): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({ total: sql<number>`coalesce(sum(${feePayments.amountCents}), 0)::int` })
    .from(feePayments)
    .where(and(eq(feePayments.firmId, firmId), eq(feePayments.invoiceId, invoiceId)));
  return rows[0]?.total ?? 0;
}

export async function sumFeePaymentsByInvoice(
  firmId: string,
): Promise<Map<string, number>> {
  const db = getDb();
  const rows = await db
    .select({
      invoiceId: feePayments.invoiceId,
      total: sql<number>`coalesce(sum(${feePayments.amountCents}), 0)::int`,
    })
    .from(feePayments)
    .where(eq(feePayments.firmId, firmId))
    .groupBy(feePayments.invoiceId);
  const map = new Map<string, number>();
  for (const r of rows) {
    map.set(r.invoiceId, Number(r.total) || 0);
  }
  return map;
}

/** Fee payments received in a date range (P&L income, cash basis). */
export async function sumFeePaymentsInPeriod(
  firmId: string,
  from: Date,
  to: Date,
): Promise<Array<{ currency: string; totalCents: number; paymentCount: number }>> {
  const db = getDb();
  const rows = await db
    .select({
      currency: feePayments.currency,
      total: sql<number>`coalesce(sum(${feePayments.amountCents}), 0)::int`,
      count: sql<number>`count(*)::int`,
    })
    .from(feePayments)
    .where(
      and(
        eq(feePayments.firmId, firmId),
        gte(feePayments.paidAt, from),
        lte(feePayments.paidAt, to),
      ),
    )
    .groupBy(feePayments.currency);
  return rows.map((r) => ({
    currency: r.currency,
    totalCents: Number(r.total) || 0,
    paymentCount: Number(r.count) || 0,
  }));
}

export async function countUnbilledTimeEntries(firmId: string, matterId: string) {
  const db = getDb();
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(timeEntries)
    .where(
      and(
        eq(timeEntries.firmId, firmId),
        eq(timeEntries.matterId, matterId),
        eq(timeEntries.billable, true),
        isNull(timeEntries.invoiceId),
      ),
    );
  return rows[0]?.count ?? 0;
}

export async function countUnbilledDisbursements(firmId: string, matterId: string) {
  const db = getDb();
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(disbursements)
    .where(
      and(
        eq(disbursements.firmId, firmId),
        eq(disbursements.matterId, matterId),
        eq(disbursements.billable, true),
        isNull(disbursements.invoiceId),
      ),
    );
  return rows[0]?.count ?? 0;
}

/**
 * Create draft fee note from unbilled time/disbursements.
 * Locks source rows with invoice_id. Does NOT touch trust.
 */
export async function createInvoiceFromUnbilled(
  firmId: string,
  userId: string,
  matter: { id: string; clientId: string },
  input: CreateInvoiceInput,
  defaults: { currency: string },
) {
  const db = getDb();

  const timeRows = input.includeTime
    ? (
        await db
          .select()
          .from(timeEntries)
          .where(
            and(
              eq(timeEntries.firmId, firmId),
              eq(timeEntries.matterId, matter.id),
              eq(timeEntries.billable, true),
              isNull(timeEntries.invoiceId),
            ),
          )
          .orderBy(asc(timeEntries.workedAt))
      ).filter((t) => !input.timeEntryIds || input.timeEntryIds.includes(t.id))
    : [];

  const disbRows = input.includeDisbursements
    ? (
        await db
          .select()
          .from(disbursements)
          .where(
            and(
              eq(disbursements.firmId, firmId),
              eq(disbursements.matterId, matter.id),
              eq(disbursements.billable, true),
              isNull(disbursements.invoiceId),
            ),
          )
          .orderBy(asc(disbursements.incurredAt))
      ).filter((d) => !input.disbursementIds || input.disbursementIds.includes(d.id))
    : [];

  const lineSpecs: Array<{
    lineType: string;
    description: string;
    quantity: number;
    unitAmountCents: number;
    amountCents: number;
    sourceId: string;
  }> = [];

  for (const t of timeRows) {
    const amount = timeEntryAmountCents(t.minutes, t.rateCents);
    if (amount == null || amount < 1) {
      throw new AuthError(
        "validation",
        `Time entry needs a positive hourly rate before invoicing (${t.id.slice(0, 8)}…).`,
      );
    }
    const hours = t.minutes / 60;
    lineSpecs.push({
      lineType: "time",
      description: describeTimeLine(t),
      quantity: hours,
      unitAmountCents: t.rateCents ?? 0,
      amountCents: amount,
      sourceId: t.id,
    });
  }

  for (const d of disbRows) {
    lineSpecs.push({
      lineType: "disbursement",
      description: d.description,
      quantity: 1,
      unitAmountCents: d.amountCents,
      amountCents: d.amountCents,
      sourceId: d.id,
    });
  }

  if (!lineSpecs.length) {
    throw new AuthError(
      "validation",
      "No unbilled billable time or disbursements to invoice for this matter.",
    );
  }

  const subtotalCents = lineSpecs.reduce((sum, l) => sum + l.amountCents, 0);
  const taxCents = 0;
  const totalCents = subtotalCents + taxCents;
  const invoiceNumber = await allocateInvoiceNumber(firmId);
  const currency =
    timeRows.find((t) => t.currency)?.currency ||
    disbRows.find((d) => d.currency)?.currency ||
    defaults.currency;

  const [invoice] = await db
    .insert(invoices)
    .values({
      firmId,
      matterId: matter.id,
      clientId: matter.clientId,
      invoiceNumber,
      status: "draft",
      currency,
      subtotalCents,
      taxCents,
      totalCents,
      notes: input.notes,
      createdBy: userId,
      updatedAt: new Date(),
    })
    .returning();

  let sortOrder = 0;
  for (const line of lineSpecs) {
    await db.insert(invoiceLines).values({
      firmId,
      invoiceId: invoice!.id,
      lineType: line.lineType,
      description: line.description,
      quantity: line.quantity,
      unitAmountCents: line.unitAmountCents,
      amountCents: line.amountCents,
      sourceId: line.sourceId,
      sortOrder: sortOrder++,
    });
  }

  for (const t of timeRows) {
    await db
      .update(timeEntries)
      .set({ invoiceId: invoice!.id, updatedAt: new Date() })
      .where(and(eq(timeEntries.firmId, firmId), eq(timeEntries.id, t.id)));
  }
  for (const d of disbRows) {
    await db
      .update(disbursements)
      .set({ invoiceId: invoice!.id })
      .where(and(eq(disbursements.firmId, firmId), eq(disbursements.id, d.id)));
  }

  return invoice!;
}

/** Create draft invoice from service catalogue lines (Phase 7). */
export async function createInvoiceFromServices(
  firmId: string,
  userId: string,
  input: CreateServiceInvoiceInput,
  defaults: { currency: string },
) {
  const db = getDb();
  const client = await db
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.firmId, firmId), eq(clients.id, input.clientId)))
    .limit(1);
  if (!client[0]) throw new AuthError("not_found", "Client not found.");

  const matter = await db
    .select({ id: matters.id, clientId: matters.clientId })
    .from(matters)
    .where(and(eq(matters.firmId, firmId), eq(matters.id, input.matterId)))
    .limit(1);
  if (!matter[0]) throw new AuthError("not_found", "Matter not found.");
  if (matter[0].clientId !== input.clientId) {
    throw new AuthError("validation", "Matter does not belong to this client.");
  }

  const serviceIds = input.lines
    .map((l) => l.firmServiceId)
    .filter(Boolean) as string[];
  const serviceGlById = new Map<string, string>();
  if (serviceIds.length) {
    const rows = await db
      .select({
        id: firmServices.id,
        revenueGlAccountId: firmServices.revenueGlAccountId,
      })
      .from(firmServices)
      .where(and(eq(firmServices.firmId, firmId)));
    for (const s of rows) {
      if (s.revenueGlAccountId) serviceGlById.set(s.id, s.revenueGlAccountId);
    }
  }

  const lineAmounts = input.lines.map((line) =>
    lineTotalCents(line.qty, line.unitPriceCents),
  );
  const subtotalCents = quotationSubtotalCents(
    lineAmounts.map((lineTotalCents) => ({ lineTotalCents })),
  );
  const discountApplied = quotationDiscountCents(
    subtotalCents,
    input.discountCents ?? 0,
    input.discountPct,
  );
  const totalCents = quotationTotalCents(
    subtotalCents,
    input.discountCents ?? 0,
    input.discountPct,
  );
  const invoiceNumber = await allocateInvoiceNumber(firmId);
  const currency = input.currency ?? defaults.currency;

  return db.transaction(async (tx) => {
    const [invoice] = await tx
      .insert(invoices)
      .values({
        firmId,
        matterId: input.matterId,
        clientId: input.clientId,
        invoiceNumber,
        status: "draft",
        currency,
        subtotalCents,
        discountCents: input.discountCents ?? 0,
        discountPct: input.discountPct ?? null,
        taxCents: 0,
        totalCents,
        notes: input.notes ?? null,
        subject: input.subject ?? null,
        paymentTerms: input.paymentTerms ?? "-",
        createdBy: userId,
        updatedAt: new Date(),
      })
      .returning();

    let sortOrder = 0;
    for (let i = 0; i < input.lines.length; i++) {
      const line = input.lines[i]!;
      const amountCents = lineAmounts[i]!;
      const revenueGlAccountId =
        line.revenueGlAccountId ??
        (line.firmServiceId ? (serviceGlById.get(line.firmServiceId) ?? null) : null);
      await tx.insert(invoiceLines).values({
        firmId,
        invoiceId: invoice!.id,
        lineType: "fee",
        description: line.description,
        workDate: line.workDate ?? null,
        quantity: line.qty,
        unitAmountCents: line.unitPriceCents,
        amountCents,
        firmServiceId: line.firmServiceId ?? null,
        revenueGlAccountId,
        sortOrder: sortOrder++,
      });
    }

    return invoice!;
  });
}

export async function updateInvoiceStatus(
  firmId: string,
  invoiceId: string,
  status: InvoiceStatusValue,
  userId?: string,
) {
  const full = await getInvoice(firmId, invoiceId);
  if (!full) return null;
  const previousStatus = full.invoice.status;
  assertInvoiceStatusTransition(previousStatus, status);

  if (status === "sent" && previousStatus === "draft") {
    const { getRequireInvoiceApproval } = await import("@/lib/billing/invoice-approval");
    const requireApproval = await getRequireInvoiceApproval(firmId);
    if (requireApproval && full.invoice.approvalState !== "approved") {
      throw new AuthError(
        "validation",
        "This fee note must be approved before it can be marked sent.",
      );
    }
  }

  const patch: {
    status: string;
    updatedAt: Date;
    issueDate?: Date;
    dueDate?: Date | null;
    approvalState?: string;
    rejectionNote?: string | null;
  } = {
    status,
    updatedAt: new Date(),
  };

  if (status === "sent" && !full.invoice.issueDate) {
    const now = new Date();
    patch.issueDate = now;
    const dueDays = await getInvoiceDueDays(firmId);
    const due = new Date(now);
    due.setDate(due.getDate() + dueDays);
    patch.dueDate = due;
  }

  if (status === "void") {
    const db = getDb();
    await db
      .update(timeEntries)
      .set({ invoiceId: null, updatedAt: new Date() })
      .where(and(eq(timeEntries.firmId, firmId), eq(timeEntries.invoiceId, invoiceId)));
    await db
      .update(disbursements)
      .set({ invoiceId: null })
      .where(and(eq(disbursements.firmId, firmId), eq(disbursements.invoiceId, invoiceId)));
  }

  const db = getDb();
  const rows = await db
    .update(invoices)
    .set(patch)
    .where(and(eq(invoices.firmId, firmId), eq(invoices.id, invoiceId)))
    .returning();
  const updated = rows[0] ?? null;

  if (updated && userId) {
    // GL posts only on first Mark sent (from draft). Approved is pre-send only.
    if (status === "sent" && previousStatus === "draft") {
      await postInvoiceSentGl(firmId, userId, invoiceId);
    }
    if (status === "void" && previousStatus !== "draft") {
      await reverseInvoiceSentGl(firmId, userId, invoiceId);
    }
  }

  return updated;
}

export async function applyInvoiceApprovalAction(
  firmId: string,
  invoiceId: string,
  actorUserId: string,
  action: "submit" | "approve" | "reject",
  rejectionNote?: string | null,
) {
  const full = await getInvoice(firmId, invoiceId);
  if (!full) {
    throw new AuthError("not_found", "Invoice not found.");
  }
  if (full.invoice.status !== "draft") {
    throw new AuthError(
      "validation",
      "Approval actions only apply to draft fee notes before send.",
    );
  }

  const {
    assertApprovalTransition,
    getRequireInvoiceApproval,
    notifyInvoiceApprovers,
    notifyInvoiceCreator,
  } = await import("@/lib/billing/invoice-approval");

  if (action === "submit") {
    const required = await getRequireInvoiceApproval(firmId);
    if (!required) {
      throw new AuthError(
        "validation",
        "Invoice approval is turned off for this firm. You can Mark sent directly.",
      );
    }
  }

  const nextState = assertApprovalTransition(full.invoice.approvalState, action);
  const now = new Date();
  const patch: {
    approvalState: string;
    updatedAt: Date;
    submittedAt?: Date;
    submittedBy?: string;
    approvedAt?: Date | null;
    approvedBy?: string | null;
    rejectionNote?: string | null;
  } = {
    approvalState: nextState,
    updatedAt: now,
  };

  if (action === "submit") {
    patch.submittedAt = now;
    patch.submittedBy = actorUserId;
    patch.approvedAt = null;
    patch.approvedBy = null;
    patch.rejectionNote = null;
  } else if (action === "approve") {
    patch.approvedAt = now;
    patch.approvedBy = actorUserId;
    patch.rejectionNote = null;
  } else {
    patch.approvedAt = null;
    patch.approvedBy = null;
    patch.rejectionNote = rejectionNote?.trim() || null;
  }

  const db = getDb();
  const rows = await db
    .update(invoices)
    .set(patch)
    .where(and(eq(invoices.firmId, firmId), eq(invoices.id, invoiceId)))
    .returning();
  const updated = rows[0];
  if (!updated) throw new AuthError("not_found", "Invoice not found.");

  if (action === "submit") {
    await notifyInvoiceApprovers({
      firmId,
      invoiceId,
      invoiceNumber: updated.invoiceNumber,
      excludeUserId: actorUserId,
    });
  } else {
    await notifyInvoiceCreator({
      firmId,
      creatorUserId: full.invoice.createdBy ?? full.invoice.submittedBy,
      invoiceId,
      invoiceNumber: updated.invoiceNumber,
      outcome: action === "approve" ? "approved" : "rejected",
      rejectionNote: updated.rejectionNote,
      actorUserId,
    });
  }

  return { previous: full.invoice.approvalState, invoice: updated };
}

export async function createFeePayment(
  firmId: string,
  userId: string,
  invoiceId: string,
  input: FeePaymentInput,
) {
  const full = await getInvoice(firmId, invoiceId);
  if (!full) {
    throw new AuthError("not_found", "Invoice not found.");
  }
  if (full.invoice.status === "void" || full.invoice.status === "draft") {
    throw new AuthError(
      "validation",
      "Fee payments are only allowed on sent, overdue, or paid invoices.",
    );
  }

  const receiptNumber = await allocateReceiptNumber(firmId);
  const db = getDb();
  const [payment] = await db
    .insert(feePayments)
    .values({
      firmId,
      invoiceId,
      receiptNumber,
      amountCents: input.amountCents,
      currency: input.currency || full.invoice.currency,
      paidAt: input.paidAt,
      method: input.method,
      reference: input.reference,
      notes: input.notes,
      createdBy: userId,
    })
    .returning();

  await postFeePaymentGl(firmId, userId, payment!.id);

  const paid = await sumFeePayments(firmId, invoiceId);
  const retainerApplied = full.invoice.retainerAppliedCents ?? 0;
  if (
    paid + retainerApplied >= full.invoice.totalCents &&
    full.invoice.status !== "paid"
  ) {
    await db
      .update(invoices)
      .set({ status: "paid", updatedAt: new Date() })
      .where(and(eq(invoices.firmId, firmId), eq(invoices.id, invoiceId)));
  }

  return payment!;
}
