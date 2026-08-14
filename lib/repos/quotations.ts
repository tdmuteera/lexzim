import "server-only";

import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { AuthError } from "@/lib/auth/types";
import { getDb } from "@/lib/db";
import {
  clients,
  invoiceLines,
  invoices,
  matters,
  quotationLines,
  quotations,
  firmServices,
} from "@/lib/db/schema";
import { clientDisplayLabel } from "@/lib/clients/display";
import { allocateInvoiceNumber } from "@/lib/repos/firm-settings";
import type { CreateQuotationInput } from "@/lib/quotes/validation";
import { lineTotalCents } from "@/lib/quotes/validation";
import {
  assertQuoteStatusTransition,
  quotationDiscountCents,
  quotationSubtotalCents,
  quotationTotalCents,
  type QuoteStatus,
} from "@/lib/quotes/totals";

export async function allocateQuoteNumber(firmId: string): Promise<string> {
  const db = getDb();
  const rows = await db
    .select({
      maxNum: sql<string | null>`max(cast(substring(${quotations.quoteNumber} from 4) as integer))`,
    })
    .from(quotations)
    .where(
      sql`${quotations.firmId} = ${firmId} AND ${quotations.quoteNumber} ~ '^QT-[0-9]+$'`,
    );
  const next = Number(rows[0]?.maxNum ?? 0) + 1;
  if (next > 9999) throw new AuthError("validation", "Quote number sequence exhausted.");
  return `QT-${String(next).padStart(4, "0")}`;
}

export type ListQuotationsOpts = {
  status?: QuoteStatus;
  clientId?: string;
  from?: Date;
  to?: Date;
};

export async function listQuotations(firmId: string, opts?: ListQuotationsOpts) {
  const db = getDb();
  const conditions = [eq(quotations.firmId, firmId)];
  if (opts?.status) conditions.push(eq(quotations.status, opts.status));
  if (opts?.clientId) conditions.push(eq(quotations.clientId, opts.clientId));
  if (opts?.from) conditions.push(gte(quotations.createdAt, opts.from));
  if (opts?.to) conditions.push(lte(quotations.createdAt, opts.to));

  const rows = await db
    .select({
      quote: quotations,
      clientNumber: clients.clientNumber,
      clientType: clients.clientType,
      clientFirstName: clients.firstName,
      clientSurname: clients.surname,
      clientFullName: clients.fullName,
      clientLegalName: clients.legalName,
      clientRegisteredName: clients.registeredName,
      clientTradingName: clients.tradingName,
      matterTitle: matters.title,
      matterNumber: matters.matterNumber,
    })
    .from(quotations)
    .innerJoin(clients, eq(clients.id, quotations.clientId))
    .leftJoin(matters, eq(matters.id, quotations.matterId))
    .where(and(...conditions))
    .orderBy(desc(quotations.createdAt));

  const results = [];
  for (const row of rows) {
    const lines = await db
      .select()
      .from(quotationLines)
      .where(
        and(
          eq(quotationLines.firmId, firmId),
          eq(quotationLines.quotationId, row.quote.id),
        ),
      )
      .orderBy(quotationLines.sortOrder);

    const subtotalCents = quotationSubtotalCents(lines);
    const discountApplied = quotationDiscountCents(
      subtotalCents,
      row.quote.discountCents,
      row.quote.discountPct,
    );
    const totalCents = quotationTotalCents(
      subtotalCents,
      row.quote.discountCents,
      row.quote.discountPct,
    );

    results.push({
      ...row,
      lines,
      subtotalCents,
      discountAppliedCents: discountApplied,
      totalCents,
      clientDisplayLabel: clientDisplayLabel({
        clientNumber: row.clientNumber,
        clientType: row.clientType,
        firstName: row.clientFirstName,
        surname: row.clientSurname,
        fullName: row.clientFullName,
        legalName: row.clientLegalName,
        registeredName: row.clientRegisteredName,
        tradingName: row.clientTradingName,
      }),
    });
  }

  return results;
}

export async function getQuotation(firmId: string, quotationId: string) {
  const db = getDb();
  const rows = await db
    .select({
      quote: quotations,
      clientNumber: clients.clientNumber,
      clientType: clients.clientType,
      clientFirstName: clients.firstName,
      clientSurname: clients.surname,
      clientFullName: clients.fullName,
      clientLegalName: clients.legalName,
      clientRegisteredName: clients.registeredName,
      clientTradingName: clients.tradingName,
      matterTitle: matters.title,
      matterNumber: matters.matterNumber,
    })
    .from(quotations)
    .innerJoin(clients, eq(clients.id, quotations.clientId))
    .leftJoin(matters, eq(matters.id, quotations.matterId))
    .where(and(eq(quotations.firmId, firmId), eq(quotations.id, quotationId)))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  const lines = await db
    .select()
    .from(quotationLines)
    .where(
      and(eq(quotationLines.firmId, firmId), eq(quotationLines.quotationId, quotationId)),
    )
    .orderBy(quotationLines.sortOrder);

  const subtotalCents = quotationSubtotalCents(lines);
  const discountAppliedCents = quotationDiscountCents(
    subtotalCents,
    row.quote.discountCents,
    row.quote.discountPct,
  );
  const totalCents = quotationTotalCents(
    subtotalCents,
    row.quote.discountCents,
    row.quote.discountPct,
  );

  return {
    ...row,
    lines,
    subtotalCents,
    discountAppliedCents,
    totalCents,
    clientDisplayLabel: clientDisplayLabel({
      clientNumber: row.clientNumber,
      clientType: row.clientType,
      firstName: row.clientFirstName,
      surname: row.clientSurname,
      fullName: row.clientFullName,
      legalName: row.clientLegalName,
      registeredName: row.clientRegisteredName,
      tradingName: row.clientTradingName,
    }),
  };
}

export async function createQuotation(
  firmId: string,
  userId: string,
  input: CreateQuotationInput,
  defaultCurrency: string,
) {
  const db = getDb();
  const client = await db
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.firmId, firmId), eq(clients.id, input.clientId)))
    .limit(1);
  if (!client[0]) throw new AuthError("not_found", "Client not found.");

  if (input.matterId) {
    const matter = await db
      .select({ id: matters.id, clientId: matters.clientId })
      .from(matters)
      .where(and(eq(matters.firmId, firmId), eq(matters.id, input.matterId)))
      .limit(1);
    if (!matter[0]) throw new AuthError("not_found", "Matter not found.");
    if (matter[0].clientId !== input.clientId) {
      throw new AuthError("validation", "Matter does not belong to this client.");
    }
  }

  const quoteNumber = await allocateQuoteNumber(firmId);
  const currency = input.currency ?? defaultCurrency;

  return db.transaction(async (tx) => {
    const [quote] = await tx
      .insert(quotations)
      .values({
        firmId,
        clientId: input.clientId,
        matterId: input.matterId ?? null,
        quoteNumber,
        status: "draft",
        currency,
        validUntil: input.validUntil ?? null,
        discountCents: input.discountCents ?? 0,
        discountPct: input.discountPct ?? null,
        notes: input.notes ?? null,
        createdBy: userId,
      })
      .returning();

    let sortOrder = 0;
    for (const line of input.lines) {
      await tx.insert(quotationLines).values({
        firmId,
        quotationId: quote!.id,
        firmServiceId: line.firmServiceId ?? null,
        description: line.description,
        qty: line.qty,
        unitPriceCents: line.unitPriceCents,
        lineTotalCents: lineTotalCents(line.qty, line.unitPriceCents),
        sortOrder: sortOrder++,
      });
    }

    return quote!;
  });
}

export async function updateQuotationStatus(
  firmId: string,
  quotationId: string,
  status: QuoteStatus,
) {
  const existing = await getQuotation(firmId, quotationId);
  if (!existing) return null;

  try {
    assertQuoteStatusTransition(existing.quote.status, status);
  } catch (err) {
    throw new AuthError("validation", err instanceof Error ? err.message : "Invalid status change.");
  }

  const db = getDb();
  const rows = await db
    .update(quotations)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(quotations.firmId, firmId), eq(quotations.id, quotationId)))
    .returning();
  return rows[0] ?? null;
}

/** Convert accepted/sent quote to draft invoice (no GL until P7-06). */
export async function convertQuotationToInvoice(
  firmId: string,
  userId: string,
  quotationId: string,
  opts?: { matterId?: string },
) {
  const full = await getQuotation(firmId, quotationId);
  if (!full) throw new AuthError("not_found", "Quotation not found.");

  if (full.quote.status !== "sent" && full.quote.status !== "accepted") {
    throw new AuthError(
      "validation",
      "Only sent or accepted quotations can be converted to an invoice.",
    );
  }

  const matterId = opts?.matterId ?? full.quote.matterId;
  if (!matterId) {
    throw new AuthError("validation", "A matter is required to create an invoice.");
  }

  const db = getDb();
  const matterRows = await db
    .select({ id: matters.id, clientId: matters.clientId })
    .from(matters)
    .where(and(eq(matters.firmId, firmId), eq(matters.id, matterId)))
    .limit(1);
  const matter = matterRows[0];
  if (!matter) throw new AuthError("not_found", "Matter not found.");
  if (matter.clientId !== full.quote.clientId) {
    throw new AuthError("validation", "Matter client does not match quotation client.");
  }

  const subtotalCents = full.subtotalCents;
  const discountApplied = full.discountAppliedCents;
  const totalCents = full.totalCents;
  const invoiceNumber = await allocateInvoiceNumber(firmId);

  const serviceIds = full.lines.map((l) => l.firmServiceId).filter(Boolean) as string[];
  const serviceGlById = new Map<string, string>();
  if (serviceIds.length) {
    const services = await db
      .select({
        id: firmServices.id,
        revenueGlAccountId: firmServices.revenueGlAccountId,
      })
      .from(firmServices)
      .where(eq(firmServices.firmId, firmId));
    for (const s of services) {
      if (s.revenueGlAccountId) serviceGlById.set(s.id, s.revenueGlAccountId);
    }
  }

  return db.transaction(async (tx) => {
    const [invoice] = await tx
      .insert(invoices)
      .values({
        firmId,
        matterId,
        clientId: full.quote.clientId,
        invoiceNumber,
        status: "draft",
        currency: full.quote.currency,
        subtotalCents,
        discountCents: full.quote.discountCents,
        discountPct: full.quote.discountPct,
        taxCents: 0,
        totalCents,
        notes: [full.quote.notes, `Converted from ${full.quote.quoteNumber}.`]
          .filter(Boolean)
          .join("\n"),
        createdBy: userId,
        updatedAt: new Date(),
      })
      .returning();

    let sortOrder = 0;
    for (const line of full.lines) {
      await tx.insert(invoiceLines).values({
        firmId,
        invoiceId: invoice!.id,
        lineType: "fee",
        description: line.description,
        quantity: line.qty,
        unitAmountCents: line.unitPriceCents,
        amountCents: line.lineTotalCents,
        firmServiceId: line.firmServiceId,
        revenueGlAccountId: line.firmServiceId
          ? (serviceGlById.get(line.firmServiceId) ?? null)
          : null,
        sortOrder: sortOrder++,
      });
    }

    await tx
      .update(quotations)
      .set({ status: "accepted", updatedAt: new Date() })
      .where(and(eq(quotations.firmId, firmId), eq(quotations.id, quotationId)));

    return { invoice: invoice!, subtotalBeforeDiscount: subtotalCents, discountAppliedCents: discountApplied };
  });
}
