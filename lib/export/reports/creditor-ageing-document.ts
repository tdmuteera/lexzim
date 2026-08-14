import "server-only";

import { centsToDisplay } from "@/lib/billing/money";
import type { ExportDocument } from "@/lib/export/types";
import { buildCreditorAging } from "@/lib/gl/posting-creditors";

const BUCKET_LABELS: Record<string, string> = {
  current: "Current",
  "1-30": "1 to 30 days",
  "31-60": "31 to 60 days",
  "61-90": "61 to 90 days",
  "90+": "Over 90 days",
};

export async function creditorAgeingToExportDocument(firmId: string): Promise<ExportDocument> {
  const rows = await buildCreditorAging(firmId);
  const totalBalance = rows.reduce((sum, r) => sum + r.balanceCents, 0);

  return {
    title: "Creditor ageing",
    subtitle: "Outstanding supplier bills (accounts payable)",
    note: "Open bills only. Payments reduce balances on the AP ledger.",
    asOf: new Date().toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }),
    summaryLines: [
      `${rows.length} open bill line(s)`,
      `Total outstanding: ${centsToDisplay(totalBalance, "USD")}`,
    ],
    columns: [
      { key: "creditor", header: "Creditor" },
      { key: "reference", header: "Reference" },
      { key: "due", header: "Due" },
      { key: "bucket", header: "Age" },
      { key: "amount", header: "Bill", align: "right" },
      { key: "paid", header: "Paid", align: "right" },
      { key: "balance", header: "Balance", align: "right" },
    ],
    rows: rows.map((r) => ({
      creditor: r.creditorName,
      reference: r.reference ?? "",
      due: r.dueDate ? new Date(r.dueDate).toLocaleDateString() : "",
      bucket: BUCKET_LABELS[r.bucket] ?? r.bucket,
      amount: centsToDisplay(r.amountCents, "USD"),
      paid: centsToDisplay(r.paidCents, "USD"),
      balance: centsToDisplay(r.balanceCents, "USD"),
    })),
  };
}
