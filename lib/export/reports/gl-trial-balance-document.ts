import "server-only";

import { centsToDisplay } from "@/lib/billing/money";
import type { ExportDocument } from "@/lib/export/types";
import type { TrialBalanceReport } from "@/lib/gl/types";

export function trialBalanceToExportDocument(report: TrialBalanceReport): ExportDocument {
  const asOf = new Date(report.asOf).toLocaleDateString(undefined, { dateStyle: "long" });
  return {
    title: report.title,
    subtitle: `As of ${asOf}`,
    asOf,
    summaryLines: [
      `Total debits: ${centsToDisplay(report.totalDebitCents, report.currency)}`,
      `Total credits: ${centsToDisplay(report.totalCreditCents, report.currency)}`,
    ],
    columns: [
      { key: "code", header: "Code" },
      { key: "name", header: "Account" },
      { key: "type", header: "Type" },
      { key: "debit", header: "Debit", align: "right" },
      { key: "credit", header: "Credit", align: "right" },
    ],
    rows: report.rows.map((r) => ({
      code: r.code,
      name: r.name,
      type: r.type,
      debit: r.debitCents ? centsToDisplay(r.debitCents, report.currency) : "",
      credit: r.creditCents ? centsToDisplay(r.creditCents, report.currency) : "",
    })),
  };
}
