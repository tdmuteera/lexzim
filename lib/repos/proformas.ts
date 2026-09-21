import "server-only";

import { and, asc, desc, eq, sql } from "drizzle-orm";
import { AuthError } from "@/lib/auth/types";
import { getDb } from "@/lib/db";
import { clients, matters, proFormaLines, proFormas } from "@/lib/db/schema";
import { clientDisplayLabel } from "@/lib/clients/display";
import type { CreateProformaInput } from "@/lib/proforma/validation";
import type { ProformaStatus } from "@/lib/proforma/types";

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

export async function createProforma(
  firmId: string,
  userId: string,
  input: CreateProformaInput,
  defaultCurrency: string,
) {
  const db = getDb();
  const [client] = await db
    .select({ id: clients.id, firmId: clients.firmId })
    .from(clients)
    .where(and(eq(clients.id, input.clientId), eq(clients.firmId, firmId)))
    .limit(1);
  if (!client) throw new AuthError("not_found", "Client not found.");

  if (input.matterId) {
    const [matter] = await db
      .select({ id: matters.id })
      .from(matters)
      .where(and(eq(matters.id, input.matterId), eq(matters.firmId, firmId)))
      .limit(1);
    if (!matter) throw new AuthError("not_found", "Matter not found.");
  }

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
        included: line.included,
        isOptional: line.isOptional,
        qty: line.qty,
        unitPriceCents: line.unitPriceCents,
        lineTotalCents: line.included
          ? Math.round(line.qty * line.unitPriceCents)
          : 0,
        ratePct: line.ratePct,
        calcHint: line.calcHint,
        sortOrder: line.sortOrder,
      })),
    );

    return header;
  });
}

export type ListProformasOpts = {
  status?: ProformaStatus;
  kind?: string;
  clientId?: string;
};

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
    const lines = await db
      .select()
      .from(proFormaLines)
      .where(eq(proFormaLines.proformaId, row.proforma.id))
      .orderBy(asc(proFormaLines.sortOrder));
    const totalCents = lines
      .filter((l) => l.included)
      .reduce((sum, l) => sum + l.lineTotalCents, 0);
    results.push({
      ...row,
      lines,
      totalCents,
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
    });
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
  const lines = await db
    .select()
    .from(proFormaLines)
    .where(eq(proFormaLines.proformaId, row.proforma.id))
    .orderBy(asc(proFormaLines.sortOrder));
  const totalCents = lines
    .filter((l) => l.included)
    .reduce((sum, l) => sum + l.lineTotalCents, 0);
  return {
    ...row,
    lines,
    totalCents,
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
