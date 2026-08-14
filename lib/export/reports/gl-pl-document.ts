import "server-only";

import { centsToDisplay } from "@/lib/billing/money";
import type { ExportDocument } from "@/lib/export/types";
import type { ProfitAndLossReport } from "@/lib/gl/types";

function sectionRows(
  rows: { code: string; name: string; amountCents: number }[],
  currency: string,
) {
  return rows.map((r) => ({
    section: "",
    code: r.code,
    name: r.name,
    amount: centsToDisplay(r.amountCents, currency),
  }));
}

export function profitAndLossToExportDocument(report: ProfitAndLossReport): ExportDocument {
  const from = new Date(report.from).toLocaleDateString(undefined, { dateStyle: "medium" });
  const to = new Date(report.to).toLocaleDateString(undefined, { dateStyle: "medium" });

  const rows = [
    ...sectionRows(report.revenue.rows, report.currency).map((r) => ({ ...r, section: "Revenue" })),
    {
      section: "Revenue",
      code: "",
      name: "Total revenue",
      amount: centsToDisplay(report.revenue.subtotalCents, report.currency),
    },
    ...sectionRows(report.directCosts.rows, report.currency).map((r) => ({
      ...r,
      section: "Direct costs",
    })),
    {
      section: "Direct costs",
      code: "",
      name: "Total direct costs",
      amount: centsToDisplay(report.directCosts.subtotalCents, report.currency),
    },
    {
      section: "Summary",
      code: "",
      name: "Gross profit",
      amount: centsToDisplay(report.grossProfitCents, report.currency),
    },
    ...sectionRows(report.operatingExpenses.rows, report.currency).map((r) => ({
      ...r,
      section: "Operating expenses",
    })),
    {
      section: "Operating expenses",
      code: "",
      name: "Total operating expenses",
      amount: centsToDisplay(report.operatingExpenses.subtotalCents, report.currency),
    },
    {
      section: "Summary",
      code: "",
      name: "Net profit",
      amount: centsToDisplay(report.netProfitCents, report.currency),
    },
  ];

  return {
    title: report.title,
    subtitle: `${from} to ${to}`,
    summaryLines: [
      `Gross profit: ${centsToDisplay(report.grossProfitCents, report.currency)}`,
      `Net profit: ${centsToDisplay(report.netProfitCents, report.currency)}`,
    ],
    columns: [
      { key: "section", header: "Section" },
      { key: "code", header: "Code" },
      { key: "name", header: "Account" },
      { key: "amount", header: "Amount", align: "right" },
    ],
    rows,
  };
}
