import "server-only";

import { agingBucketDisplay } from "@/lib/billing/aging";
import { centsToDisplay } from "@/lib/billing/money";
import type { ExportDocument } from "@/lib/export/types";
import type { DebtorsReport } from "@/lib/repos/debtors";

export function debtorsToExportDocument(report: DebtorsReport): ExportDocument {
  const asOf = new Date(report.asOf).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const summaryLines = report.summaryByCurrency.map(
    (s) =>
      `${s.currency}: ${s.invoiceCount} invoice(s), ${centsToDisplay(s.totalBalanceCents, s.currency)} outstanding`,
  );

  return {
    title: report.title,
    subtitle: "Outstanding fee invoices by due-date ageing",
    note: report.note,
    asOf,
    summaryLines,
    columns: [
      { key: "invoiceNumber", header: "Invoice" },
      { key: "clientName", header: "Client" },
      { key: "matter", header: "Matter" },
      { key: "dueDate", header: "Due" },
      { key: "bucket", header: "Bucket" },
      { key: "balance", header: "Balance", align: "right" },
    ],
    rows: report.rows.map((r) => ({
      invoiceNumber: r.invoiceNumber,
      clientName: r.clientName,
      matter: r.matterNumber ? `${r.matterNumber} · ${r.matterTitle}` : r.matterTitle,
      dueDate: r.dueDate ?? "n/a",
      bucket: agingBucketDisplay(r.bucket),
      balance: centsToDisplay(r.balanceCents, r.currency),
    })),
  };
}
