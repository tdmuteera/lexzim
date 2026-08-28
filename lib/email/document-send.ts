import "server-only";

import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { clients, feePayments, invoices, quotations } from "@/lib/db/schema";
import { clientDisplayLabel } from "@/lib/clients/display";
import { AuthError } from "@/lib/auth/types";

export type SendableDocumentKind = "quotation" | "invoice" | "receipt";

export const SENDABLE_DOCUMENT_KINDS: SendableDocumentKind[] = [
  "quotation",
  "invoice",
  "receipt",
];

export function isSendableDocumentKind(value: string): value is SendableDocumentKind {
  return (SENDABLE_DOCUMENT_KINDS as readonly string[]).includes(value);
}

export type ResolvedDocumentRecipient = {
  clientId: string | null;
  clientEmail: string | null;
  clientLabel: string;
  /** Human label for the document, e.g. "Invoice INV-0001". */
  documentLabel: string;
  documentNumber: string;
};

/** Human-readable PDF attachment name shown in the send modal and used on send. */
export function documentAttachmentFilename(
  kind: SendableDocumentKind,
  documentNumber: string,
): string {
  const prefix =
    kind === "quotation" ? "Quotation" : kind === "invoice" ? "Invoice" : "Receipt";
  const safe = documentNumber.replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "") || "document";
  return `${prefix}-${safe}.pdf`;
}

function labelFromClientRow(row: {
  clientNumber: string | null;
  clientType: string | null;
  firstName?: string | null;
  surname?: string | null;
  fullName: string | null;
  legalName: string | null;
  registeredName?: string | null;
  tradingName: string | null;
}): string {
  if (!row.clientType) return "Client";
  return clientDisplayLabel({
    clientNumber: row.clientNumber ?? undefined,
    clientType: row.clientType,
    firstName: row.firstName ?? undefined,
    surname: row.surname ?? undefined,
    fullName: row.fullName,
    legalName: row.legalName,
    registeredName: row.registeredName ?? undefined,
    tradingName: row.tradingName,
  });
}

/**
 * Resolve the default recipient (client email) and human labels for a sendable
 * document. All queries are firm-scoped. Throws not_found when the entity is
 * missing so callers never leak cross-tenant ids.
 */
export async function resolveDocumentRecipient(
  firmId: string,
  kind: SendableDocumentKind,
  id: string,
): Promise<ResolvedDocumentRecipient> {
  const db = getDb();

  if (kind === "invoice") {
    const rows = await db
      .select({
        invoiceNumber: invoices.invoiceNumber,
        clientId: clients.id,
        clientEmail: clients.email,
        clientNumber: clients.clientNumber,
        clientType: clients.clientType,
        firstName: clients.firstName,
        surname: clients.surname,
        fullName: clients.fullName,
        legalName: clients.legalName,
        registeredName: clients.registeredName,
        tradingName: clients.tradingName,
      })
      .from(invoices)
      .leftJoin(clients, and(eq(clients.id, invoices.clientId), eq(clients.firmId, firmId)))
      .where(and(eq(invoices.firmId, firmId), eq(invoices.id, id)))
      .limit(1);
    const row = rows[0];
    if (!row) throw new AuthError("not_found", "Invoice not found.");
    return {
      clientId: row.clientId ?? null,
      clientEmail: row.clientEmail?.trim() || null,
      clientLabel: labelFromClientRow(row),
      documentLabel: `Invoice ${row.invoiceNumber}`,
      documentNumber: row.invoiceNumber,
    };
  }

  if (kind === "quotation") {
    const rows = await db
      .select({
        quoteNumber: quotations.quoteNumber,
        clientId: clients.id,
        clientEmail: clients.email,
        clientNumber: clients.clientNumber,
        clientType: clients.clientType,
        firstName: clients.firstName,
        surname: clients.surname,
        fullName: clients.fullName,
        legalName: clients.legalName,
        registeredName: clients.registeredName,
        tradingName: clients.tradingName,
      })
      .from(quotations)
      .leftJoin(clients, and(eq(clients.id, quotations.clientId), eq(clients.firmId, firmId)))
      .where(and(eq(quotations.firmId, firmId), eq(quotations.id, id)))
      .limit(1);
    const row = rows[0];
    if (!row) throw new AuthError("not_found", "Quotation not found.");
    return {
      clientId: row.clientId ?? null,
      clientEmail: row.clientEmail?.trim() || null,
      clientLabel: labelFromClientRow(row),
      documentLabel: `Quotation ${row.quoteNumber}`,
      documentNumber: row.quoteNumber,
    };
  }

  // receipt (fee payment)
  const rows = await db
    .select({
      receiptNumber: feePayments.receiptNumber,
      paymentId: feePayments.id,
      clientId: clients.id,
      clientEmail: clients.email,
      clientNumber: clients.clientNumber,
      clientType: clients.clientType,
      firstName: clients.firstName,
      surname: clients.surname,
      fullName: clients.fullName,
      legalName: clients.legalName,
      registeredName: clients.registeredName,
      tradingName: clients.tradingName,
    })
    .from(feePayments)
    .innerJoin(invoices, eq(invoices.id, feePayments.invoiceId))
    .leftJoin(clients, and(eq(clients.id, invoices.clientId), eq(clients.firmId, firmId)))
    .where(and(eq(feePayments.firmId, firmId), eq(feePayments.id, id)))
    .limit(1);
  const row = rows[0];
  if (!row) throw new AuthError("not_found", "Receipt not found.");
  const number = row.receiptNumber ?? row.paymentId.slice(0, 8);
  return {
    clientId: row.clientId ?? null,
    clientEmail: row.clientEmail?.trim() || null,
    clientLabel: labelFromClientRow(row),
    documentLabel: `Receipt ${number}`,
    documentNumber: number,
  };
}
