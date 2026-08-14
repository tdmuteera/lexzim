import "server-only";

import type { ExportDocument } from "@/lib/export/types";
import { buildBirthdayReport, type CrmBirthdayReport } from "@/lib/repos/crm";

function formatBirthdayDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function birthdayReportToExportDocument(report: CrmBirthdayReport): ExportDocument {
  return {
    title: `Client birthdays: ${report.monthLabel} ${report.year}`,
    subtitle: "For secretary follow-up and client care",
    note: "Individual clients with date of birth on file. No automated emails are sent from this report.",
    asOf: new Date().toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }),
    summaryLines: [`${report.rows.length} birthday(s) in ${report.monthLabel}`],
    columns: [
      { key: "client", header: "Client" },
      { key: "number", header: "CL no." },
      { key: "birthday", header: "Birthday" },
      { key: "age", header: "Turning" },
      { key: "lawyers", header: "Responsible lawyer(s)" },
    ],
    rows: report.rows.map((r) => ({
      client: r.displayName,
      number: r.clientNumber,
      birthday: formatBirthdayDate(r.dateOfBirth),
      age: r.ageTurning != null ? String(r.ageTurning) : "",
      lawyers: r.responsibleLawyers.join(", "),
    })),
  };
}

export async function birthdayListToExportDocument(
  firmId: string,
  month: number,
  opts?: { responsibleLawyerId?: string },
): Promise<ExportDocument> {
  const report = await buildBirthdayReport(firmId, month, opts);
  return birthdayReportToExportDocument(report);
}
