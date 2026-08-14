import "server-only";

import { centsToDisplay } from "@/lib/billing/money";
import type { ExportDocument } from "@/lib/export/types";
import { buildPettyCashSummary } from "@/lib/repos/petty-cash";

const MOVEMENT_LABELS: Record<string, string> = {
  vault_to_petty: "Vault to petty",
  petty_spend: "Petty spend",
  petty_return: "Return to vault",
};

export async function pettyCashSummaryToExportDocument(firmId: string): Promise<ExportDocument> {
  const summary = await buildPettyCashSummary(firmId);
  const currency = summary.float?.currency ?? "USD";

  return {
    title: "Petty cash summary",
    subtitle: summary.float
      ? `Float opened ${summary.float.openingDate.toLocaleDateString()}`
      : "No open float",
    note: "Firm operating money only. Not client trust.",
    asOf: new Date().toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }),
    summaryLines: [
      `Current balance: ${centsToDisplay(summary.balanceCents, currency)}`,
      summary.float
        ? `Opening float: ${centsToDisplay(summary.float.amountCents, currency)}`
        : "No open petty cash float",
    ],
    columns: [
      { key: "date", header: "Date" },
      { key: "type", header: "Type" },
      { key: "amount", header: "Amount", align: "right" },
      { key: "reference", header: "Reference" },
      { key: "notes", header: "Notes" },
    ],
    rows: summary.movements.map((m) => ({
      date: m.movementDate.toLocaleDateString(),
      type: MOVEMENT_LABELS[m.movementType] ?? m.movementType,
      amount: centsToDisplay(m.amountCents, m.currency),
      reference: m.reference ?? "",
      notes: m.notes ?? "",
    })),
  };
}
