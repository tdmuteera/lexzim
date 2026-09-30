import "server-only";

import { centsToDisplay } from "@/lib/billing/money";
import type { ExportDocument } from "@/lib/export/types";
import { listCashMovements } from "@/lib/repos/firm-cash";

export async function pettyCashSummaryToExportDocument(firmId: string): Promise<ExportDocument> {
  const movements = await listCashMovements(firmId, "1050", 1000);
  const balanceCents = movements[0]?.balanceAfterCents ?? 0;
  const currency = "USD";

  return {
    title: "Petty cash summary",
    subtitle: "GL account 1050 Petty Cash",
    note: "Firm operating money only. Not client trust.",
    asOf: new Date().toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }),
    summaryLines: [
      `Current balance: ${centsToDisplay(balanceCents, currency)}`,
      `Postings: ${movements.length}`,
    ],
    columns: [
      { key: "date", header: "Date" },
      { key: "detail", header: "Detail" },
      { key: "in", header: "In", align: "right" },
      { key: "out", header: "Out", align: "right" },
      { key: "balance", header: "Balance", align: "right" },
      { key: "by", header: "Posted by" },
    ],
    rows: movements.map((m) => ({
      date: m.entryDate.toLocaleDateString(),
      detail: `${m.memo ?? m.reference ?? m.sourceType}${m.reversed ? " (reversed)" : ""}`,
      in: m.inCents ? centsToDisplay(m.inCents, currency) : "",
      out: m.outCents ? centsToDisplay(m.outCents, currency) : "",
      balance: centsToDisplay(m.balanceAfterCents, currency),
      by: m.postedBy ?? "",
    })),
  };
}
