import "server-only";

import { centsToDisplay } from "@/lib/billing/money";
import { clientDisplayName } from "@/lib/clients/display";
import type { ExportDocument } from "@/lib/export/types";
import { getClientById } from "@/lib/repos/clients";
import { getClientTrustStatement } from "@/lib/repos/trust";

export async function trustStatementToExportDocument(
  firmId: string,
  clientId: string,
): Promise<ExportDocument> {
  const client = await getClientById(firmId, clientId);
  if (!client) {
    throw new Error("Client not found.");
  }

  const displayName = clientDisplayName({
    clientType: client.clientType,
    fullName: client.fullName,
    legalName: client.legalName,
    tradingName: client.tradingName,
  });

  const { lines, balanceCents } = await getClientTrustStatement(firmId, clientId);
  const currency = lines[0]?.entry.currency ?? "USD";

  return {
    title: `Trust statement: ${displayName}`,
    subtitle: client.clientNumber ? `Client ${client.clientNumber}` : undefined,
    note: "Trust ledger only. Fee invoices and fee payments are not included.",
    asOf: new Date().toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }),
    summaryLines: [
      `Closing balance: ${centsToDisplay(balanceCents, currency)}`,
      `${lines.length} movement(s)`,
    ],
    columns: [
      { key: "date", header: "Date" },
      { key: "type", header: "Type" },
      { key: "ref", header: "Reference" },
      { key: "account", header: "Account" },
      { key: "amount", header: "Amount", align: "right" },
      { key: "balance", header: "Balance", align: "right" },
    ],
    rows: lines.map((line) => ({
      date: line.entry.occurredAt.toLocaleDateString(),
      type: line.entry.entryType,
      ref: line.entry.referenceNumber ?? line.entry.reference ?? "",
      account: line.accountName ?? "",
      amount: centsToDisplay(line.entry.amountCents, line.entry.currency),
      balance: centsToDisplay(line.runningBalanceCents, line.entry.currency),
    })),
  };
}
