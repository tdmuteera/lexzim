import "server-only";

import { centsToDisplay } from "@/lib/billing/money";
import type { ExportDocument } from "@/lib/export/types";
import {
  buildLawyerPerformance,
  type LawyerPerformanceReport,
} from "@/lib/repos/lawyer-performance";
import { toCsv } from "@/lib/reports/csv";

function formatRange(fromIso: string, toIso: string): string {
  const from = new Date(fromIso).toLocaleDateString(undefined, { dateStyle: "medium" });
  const to = new Date(toIso).toLocaleDateString(undefined, { dateStyle: "medium" });
  return `${from} to ${to}`;
}

export function lawyerPerformanceToExportDocument(
  report: LawyerPerformanceReport,
): ExportDocument {
  const currency = report.currency;
  const summaryLines = [
    `Open matters: ${report.totals.openMatters}`,
    `Fees collected: ${centsToDisplay(report.totals.collectedCents, currency)}`,
    report.viewAll ? "Scope: firm-wide" : "Scope: your matters only",
  ];
  if (report.glCheck) {
    summaryLines.push(
      `GL revenue (accrual): ${centsToDisplay(report.glCheck.glRevenueCents, currency)}`,
      report.glCheck.mismatch
        ? `Variance vs cash collected: ${centsToDisplay(report.glCheck.varianceCents, currency)}`
        : "Cash collected matches GL revenue for this window.",
    );
  }

  return {
    title: "Lawyer performance",
    subtitle: `Caseload and fees collected · ${formatRange(report.from, report.to)}`,
    note: report.attributionPolicy,
    asOf: new Date().toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }),
    summaryLines,
    columns: [
      { key: "lawyer", header: "Lawyer" },
      { key: "openMatters", header: "Open matters", align: "right" },
      { key: "collected", header: "Fees collected", align: "right" },
    ],
    rows: report.rows.map((r) => ({
      lawyer: r.lawyerName,
      openMatters: String(r.openMatters),
      collected: centsToDisplay(r.collectedCents, currency),
    })),
  };
}

export async function lawyerPerformanceExportDocument(input: {
  firmId: string;
  from: Date;
  to: Date;
  currency: string;
  viewAll: boolean;
  lawyerId: string;
  includeGlCheck: boolean;
}): Promise<ExportDocument> {
  const report = await buildLawyerPerformance(input);
  return lawyerPerformanceToExportDocument(report);
}

export function lawyerPerformanceToCsv(report: LawyerPerformanceReport): string {
  return toCsv(
    ["lawyerName", "lawyerId", "openMatters", "collectedCents", "currency"],
    report.rows.map((r) => [
      r.lawyerName,
      r.lawyerId,
      r.openMatters,
      r.collectedCents,
      report.currency,
    ]),
  );
}
