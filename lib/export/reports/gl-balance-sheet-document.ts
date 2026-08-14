import "server-only";

import { centsToDisplay } from "@/lib/billing/money";
import type { ExportDocument } from "@/lib/export/types";
import type { BalanceSheetReport } from "@/lib/gl/types";

function sectionRows(
  label: string,
  rows: { code: string; name: string; balanceCents: number }[],
  currency: string,
) {
  return rows.map((r) => ({
    section: label,
    code: r.code,
    name: r.name,
    balance: centsToDisplay(r.balanceCents, currency),
  }));
}

export function balanceSheetToExportDocument(report: BalanceSheetReport): ExportDocument {
  const asOf = new Date(report.asOf).toLocaleDateString(undefined, { dateStyle: "long" });

  const rows = [
    ...sectionRows("Assets", report.assets.rows, report.currency),
    {
      section: "Assets",
      code: "",
      name: "Total assets",
      balance: centsToDisplay(report.assets.subtotalCents, report.currency),
    },
    ...sectionRows("Liabilities", report.liabilities.rows, report.currency),
    {
      section: "Liabilities",
      code: "",
      name: "Total liabilities",
      balance: centsToDisplay(report.liabilities.subtotalCents, report.currency),
    },
    ...sectionRows("Equity", report.equity.rows, report.currency),
    {
      section: "Equity",
      code: "",
      name: "Current year earnings",
      balance: centsToDisplay(report.currentYearEarningsCents, report.currency),
    },
    {
      section: "Equity",
      code: "",
      name: "Total liabilities and equity",
      balance: centsToDisplay(report.totalLiabilitiesAndEquityCents, report.currency),
    },
  ];

  return {
    title: report.title,
    subtitle: `As of ${asOf}`,
    asOf,
    summaryLines: [
      `Total assets: ${centsToDisplay(report.assets.subtotalCents, report.currency)}`,
      `Total liabilities and equity: ${centsToDisplay(report.totalLiabilitiesAndEquityCents, report.currency)}`,
    ],
    columns: [
      { key: "section", header: "Section" },
      { key: "code", header: "Code" },
      { key: "name", header: "Account" },
      { key: "balance", header: "Balance", align: "right" },
    ],
    rows,
  };
}
