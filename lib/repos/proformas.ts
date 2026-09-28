import "server-only";

import { and, asc, desc, eq, ne, sql } from "drizzle-orm";
import { AuthError } from "@/lib/auth/types";
import { getDb } from "@/lib/db";
import { clients, matters, proFormaLines, proFormas } from "@/lib/db/schema";
import { clientDisplayLabel } from "@/lib/clients/display";
import type { CreateProformaInput } from "@/lib/proforma/validation";
import type { ProformaStatus } from "@/lib/proforma/types";

function lineTotals(lines: Array<{ included: boolean; lineTotalCents: number; moneyClass: string }>) {
  let firmIncomeCents = 0;
  let clientCollectibleCents = 0;
  let totalCents = 0;
  for (const l of lines) {
    if (!l.included) continue;
    totalCents += l.lineTotalCents;
    if (l.moneyClass === "firm_income") firmIncomeCents += l.lineTotalCents;
    else clientCollectibleCents += l.lineTotalCents;
  }
  return { firmIncomeCents, clientCollectibleCents, totalCents };
}

export async function allocateProformaNumber(firmId: string): Promise<string> {
  const db = getDb();
  const rows = await db
    .select({
      maxNum: sql<string | null>`max(cast(substring(${proFormas.proformaNumber} from 4) as integer))`,
    })
    .from(proFormas)
    .where(
      sql`${proFormas.firmId} = ${firmId} AND ${proFormas.proformaNumber} ~ '^PF-[0-9]+$'`,
    );
  const next = Number(rows[0]?.maxNum ?? 0) + 1;
  if (next > 9999) throw new AuthError("validation", "Pro forma number sequence exhausted.");
  return `PF-${String(next).padStart(4, "0")}`;
}

async function assertClientMatter(
  firmId: string,
  clientId: string,
  matterId: string | null,
) {
  const db = getDb();
  const [client] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.firmId, firmId)))
    .limit(1);
  if (!client) throw new AuthError("not_found", "Client not found.");

  if (matterId) {
    const [matter] = await db
      .select({ id: matters.id })
      .from(matters)
      .where(and(eq(matters.id, matterId), eq(matters.firmId, firmId)))
      .limit(1);
    if (!matter) throw new AuthError("not_found", "Matter not found.");
  }
}

export async function createProforma(
  firmId: string,
  userId: string,
  input: CreateProformaInput,
  defaultCurrency: string,
) {
  await assertClientMatter(firmId, input.clientId, input.matterId);
  const db = getDb();
  const proformaNumber = await allocateProformaNumber(firmId);
  const currency = input.currency || defaultCurrency || "USD";

  return db.transaction(async (tx) => {
    const [header] = await tx
      .insert(proFormas)
      .values({
        firmId,
        clientId: input.clientId,
        matterId: input.matterId,
        proformaNumber,
        kind: input.kind,
        conveyancingCategory: input.conveyancingCategory,
        propertyValueCents: input.propertyValueCents,
        subject: input.subject,
        status: "draft",
        currency,
        notes: input.notes,
        createdBy: userId,
      })
      .returning();

    if (!header) throw new AuthError("server", "Could not create pro forma.");

    await tx.insert(proFormaLines).values(
      input.lines.map((line) => ({
        firmId,
        proformaId: header.id,
        lineCode: line.lineCode,
        description: line.description,
        moneyClass: line.moneyClass,
        included: line.included,
        isOptional: line.isOptional,
        qty: line.qty,
        unitPriceCents: line.unitPriceCents,
        lineTotalCents: line.included ? Math.round(line.qty * line.unitPriceCents) : 0,
        ratePct: line.ratePct,
        calcHint: line.calcHint,
        sortOrder: line.sortOrder,
      })),
    );

    return header;
  });
}

export async function updateProforma(
  firmId: string,
  id: string,
  input: CreateProformaInput,
) {
  const existing = await getProforma(firmId, id);
  if (!existing) throw new AuthError("not_found", "Pro forma not found.");
  if (existing.proforma.status === "void") {
    throw new AuthError("validation", "Voided pro formas cannot be edited.");
  }

  await assertClientMatter(firmId, input.clientId, input.matterId);
  const db = getDb();
  const currency = input.currency || existing.proforma.currency || "USD";

  return db.transaction(async (tx) => {
    const [header] = await tx
      .update(proFormas)
      .set({
        clientId: input.clientId,
        matterId: input.matterId,
        kind: input.kind,
        conveyancingCategory: input.conveyancingCategory,
        propertyValueCents: input.propertyValueCents,
        subject: input.subject,
        currency,
        notes: input.notes,
        updatedAt: new Date(),
      })
      .where(and(eq(proFormas.firmId, firmId), eq(proFormas.id, id)))
      .returning();

    if (!header) throw new AuthError("server", "Could not update pro forma.");

    await tx.delete(proFormaLines).where(eq(proFormaLines.proformaId, id));
    await tx.insert(proFormaLines).values(
      input.lines.map((line) => ({
        firmId,
        proformaId: id,
        lineCode: line.lineCode,
        description: line.description,
        moneyClass: line.moneyClass,
        included: line.included,
        isOptional: line.isOptional,
        qty: line.qty,
        unitPriceCents: line.unitPriceCents,
        lineTotalCents: line.included ? Math.round(line.qty * line.unitPriceCents) : 0,
        ratePct: line.ratePct,
        calcHint: line.calcHint,
        sortOrder: line.sortOrder,
      })),
    );

    return header;
  });
}

export async function deleteProforma(firmId: string, id: string) {
  const db = getDb();
  const [deleted] = await db
    .delete(proFormas)
    .where(and(eq(proFormas.firmId, firmId), eq(proFormas.id, id)))
    .returning({
      id: proFormas.id,
      proformaNumber: proFormas.proformaNumber,
      clientId: proFormas.clientId,
      status: proFormas.status,
    });
  if (!deleted) throw new AuthError("not_found", "Pro forma not found.");
  return deleted;
}

export type ListProformasOpts = {
  status?: ProformaStatus;
  kind?: string;
  clientId?: string;
};

async function hydrateRow(row: {
  proforma: typeof proFormas.$inferSelect;
  clientNumber: string | null;
  clientType: string;
  clientFirstName: string | null;
  clientSurname: string | null;
  clientFullName: string | null;
  clientLegalName: string | null;
  clientRegisteredName: string | null;
  clientTradingName: string | null;
  matterTitle: string | null;
  matterNumber: string | null;
}) {
  const db = getDb();
  const lines = await db
    .select()
    .from(proFormaLines)
    .where(eq(proFormaLines.proformaId, row.proforma.id))
    .orderBy(asc(proFormaLines.sortOrder));
  const sums = lineTotals(lines);
  return {
    ...row,
    lines,
    ...sums,
    clientDisplayLabel: clientDisplayLabel({
      clientType: row.clientType,
      firstName: row.clientFirstName,
      surname: row.clientSurname,
      fullName: row.clientFullName,
      legalName: row.clientLegalName,
      registeredName: row.clientRegisteredName,
      tradingName: row.clientTradingName,
      clientNumber: row.clientNumber,
    }),
  };
}

export async function listProformas(firmId: string, opts?: ListProformasOpts) {
  const db = getDb();
  const conditions = [eq(proFormas.firmId, firmId)];
  if (opts?.status) conditions.push(eq(proFormas.status, opts.status));
  if (opts?.kind) conditions.push(eq(proFormas.kind, opts.kind));
  if (opts?.clientId) conditions.push(eq(proFormas.clientId, opts.clientId));

  const rows = await db
    .select({
      proforma: proFormas,
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
    .from(proFormas)
    .innerJoin(clients, eq(clients.id, proFormas.clientId))
    .leftJoin(matters, eq(matters.id, proFormas.matterId))
    .where(and(...conditions))
    .orderBy(desc(proFormas.createdAt))
    .limit(200);

  const results = [];
  for (const row of rows) {
    results.push(await hydrateRow(row));
  }
  return results;
}

export async function getProforma(firmId: string, id: string) {
  const db = getDb();
  const rows = await db
    .select({
      proforma: proFormas,
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
    .from(proFormas)
    .innerJoin(clients, eq(clients.id, proFormas.clientId))
    .leftJoin(matters, eq(matters.id, proFormas.matterId))
    .where(and(eq(proFormas.firmId, firmId), eq(proFormas.id, id)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return hydrateRow(row);
}

/** Open (non-void) pro forma pipeline totals for dashboard. */
export async function sumOpenProformaPipeline(firmId: string): Promise<{
  firmIncomeCents: number;
  clientCollectibleCents: number;
  currency: string;
}> {
  const db = getDb();
  const rows = await db
    .select({
      currency: proFormas.currency,
      moneyClass: proFormaLines.moneyClass,
      lineTotalCents: proFormaLines.lineTotalCents,
      included: proFormaLines.included,
    })
    .from(proFormaLines)
    .innerJoin(proFormas, eq(proFormas.id, proFormaLines.proformaId))
    .where(and(eq(proFormas.firmId, firmId), ne(proFormas.status, "void")));

  let firmIncomeCents = 0;
  let clientCollectibleCents = 0;
  let currency = "USD";
  for (const r of rows) {
    if (!r.included) continue;
    if (r.currency) currency = r.currency;
    if (r.moneyClass === "firm_income") firmIncomeCents += r.lineTotalCents;
    else clientCollectibleCents += r.lineTotalCents;
  }
  return { firmIncomeCents, clientCollectibleCents, currency };
}
