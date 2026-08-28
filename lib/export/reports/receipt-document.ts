import "server-only";

import { and, eq } from "drizzle-orm";
import { centsToDisplay } from "@/lib/billing/money";
import { feePaymentChannelLabel } from "@/lib/billing/fee-payment-methods";
import { clientDisplayLabel } from "@/lib/clients/display";
import { getDb } from "@/lib/db";
import { clients, feePayments, invoices, matters } from "@/lib/db/schema";
import type { ExportDocument } from "@/lib/export/types";
import { sumFeePayments } from "@/lib/repos/billing";

export async function receiptToExportDocument(
  firmId: string,
  paymentId: string,
): Promise<ExportDocument> {
  const db = getDb();
  const rows = await db
    .select({
      payment: feePayments,
      invoice: invoices,
      clientNumber: clients.clientNumber,
      clientType: clients.clientType,
      clientFullName: clients.fullName,
      clientLegalName: clients.legalName,
      clientTradingName: clients.tradingName,
      matterTitle: matters.title,
      matterNumber: matters.matterNumber,
    })
    .from(feePayments)
    .innerJoin(invoices, eq(invoices.id, feePayments.invoiceId))
    .innerJoin(matters, eq(matters.id, invoices.matterId))
    .leftJoin(clients, eq(clients.id, invoices.clientId))
    .where(and(eq(feePayments.firmId, firmId), eq(feePayments.id, paymentId)))
    .limit(1);

  const row = rows[0];
  if (!row) throw new Error("Receipt not found.");

  const paidTotal = await sumFeePayments(firmId, row.invoice.id);
  const balanceCents = Math.max(0, row.invoice.totalCents - paidTotal);

  const clientLabel = row.clientType
    ? clientDisplayLabel({
        clientNumber: row.clientNumber,
        clientType: row.clientType,
        fullName: row.clientFullName,
        legalName: row.clientLegalName,
        tradingName: row.clientTradingName,
      })
    : "Client";

  const paidAt = new Date(row.payment.paidAt).toLocaleDateString(undefined, {
    dateStyle: "medium",
  });

  const channel = feePaymentChannelLabel(row.payment.method);

  return {
    title: `Receipt ${row.payment.receiptNumber ?? row.payment.id.slice(0, 8)}`,
    subtitle: clientLabel,
    summaryLines: [
      row.clientNumber ? `Client number: ${row.clientNumber}` : "",
      `Invoice: ${row.invoice.invoiceNumber}`,
      row.matterNumber ? `Matter: ${row.matterNumber} · ${row.matterTitle ?? ""}` : "",
      `Paid: ${centsToDisplay(row.payment.amountCents, row.payment.currency)}`,
      `Date: ${paidAt}`,
      `Channel: ${channel}`,
      row.payment.method ? `Method: ${row.payment.method}` : "",
      row.payment.reference ? `Reference: ${row.payment.reference}` : "",
      `Balance remaining: ${centsToDisplay(balanceCents, row.invoice.currency)}`,
    ].filter(Boolean),
    columns: [
      { key: "label", header: "Field" },
      { key: "value", header: "Value" },
    ],
    rows: [
      { label: "Amount paid", value: centsToDisplay(row.payment.amountCents, row.payment.currency) },
      { label: "Invoice total", value: centsToDisplay(row.invoice.totalCents, row.invoice.currency) },
      { label: "Balance remaining", value: centsToDisplay(balanceCents, row.invoice.currency) },
    ],
    note: row.payment.notes ?? undefined,
  };
}
