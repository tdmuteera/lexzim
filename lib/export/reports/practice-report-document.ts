import "server-only";

import { agingBucketDisplay } from "@/lib/billing/aging";
import { centsToDisplay, formatMinutes } from "@/lib/billing/money";
import type { ExportDocument } from "@/lib/export/types";
import {
  isReportType,
  reportArAging,
  reportTime,
  reportToCsv,
  reportTrustBalances,
  reportTrustMovements,
  reportUpcoming,
  reportWorkload,
  runReport,
  type ReportFilters,
  type ReportType,
} from "@/lib/repos/reports";
import { AuthError } from "@/lib/auth/types";

function shortDate(value: string | null | undefined): string {
  if (!value) return "n/a";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value.slice(0, 10);
  return d.toLocaleDateString(undefined, { dateStyle: "medium" });
}

export function practiceReportFiltersFromParams(params: URLSearchParams): {
  type: ReportType;
  filters: ReportFilters;
} {
  const typeRaw = params.get("type")?.trim() ?? "";
  if (!isReportType(typeRaw)) {
    throw new AuthError(
      "validation",
      "type is required (ar-aging, time, trust-balances, trust-movements, workload, or upcoming).",
    );
  }
  const groupBy = params.get("groupBy") === "matter" ? "matter" : "lawyer";
  const parse = (key: string) => {
    const raw = params.get(key);
    if (!raw) return undefined;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) {
      throw new AuthError("validation", `Invalid date: ${raw}`);
    }
    return d;
  };
  return {
    type: typeRaw,
    filters: {
      from: parse("from"),
      to: parse("to"),
      lawyerId: params.get("lawyerId")?.trim() || undefined,
      matterId: params.get("matterId")?.trim() || undefined,
      clientId: params.get("clientId")?.trim() || undefined,
      trustAccountId: params.get("trustAccountId")?.trim() || undefined,
      groupBy,
    },
  };
}

export async function practiceReportToExportDocument(
  firmId: string,
  type: ReportType,
  filters: ReportFilters,
): Promise<ExportDocument> {
  const asOf = new Date().toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  if (type === "ar-aging") {
    const data = await reportArAging(firmId, filters);
    const currency = data.rows[0]?.currency ?? "USD";
    return {
      title: data.title,
      subtitle: "Outstanding fee invoices by due-date ageing",
      note: data.note,
      asOf,
      summaryLines: data.summary.map(
        (s) =>
          `${agingBucketDisplay(s.bucket)}: ${s.count} invoice(s), ${centsToDisplay(s.balanceCents, currency)}`,
      ),
      columns: [
        { key: "invoiceNumber", header: "Invoice" },
        { key: "clientName", header: "Client" },
        { key: "matter", header: "Matter" },
        { key: "dueDate", header: "Due" },
        { key: "bucket", header: "Bucket" },
        { key: "balance", header: "Balance", align: "right" },
      ],
      rows: data.rows.map((r) => ({
        invoiceNumber: r.invoiceNumber,
        clientName: r.clientName,
        matter: r.matterNumber ? `${r.matterNumber} · ${r.matterTitle}` : r.matterTitle,
        dueDate: r.dueDate ?? "n/a",
        bucket: agingBucketDisplay(r.bucket),
        balance: centsToDisplay(r.balanceCents, r.currency),
      })),
    };
  }

  if (type === "time") {
    const data = await reportTime(firmId, filters);
    return {
      title: data.title,
      subtitle: `Grouped by ${data.groupBy}`,
      note: data.note,
      asOf,
      summaryLines: [
        `${data.rows.length} group(s)`,
        `Total time: ${formatMinutes(data.rows.reduce((s, r) => s + r.minutes, 0))}`,
      ],
      columns: [
        { key: "label", header: data.groupBy === "matter" ? "Matter" : "Lawyer" },
        { key: "entries", header: "Entries", align: "right" },
        { key: "minutes", header: "Time", align: "right" },
        { key: "billable", header: "Billable", align: "right" },
        { key: "amount", header: "Amount", align: "right" },
      ],
      rows: data.rows.map((r) => ({
        label: r.label,
        entries: String(r.entries),
        minutes: formatMinutes(r.minutes),
        billable: formatMinutes(r.billableMinutes),
        amount: centsToDisplay(r.amountCents, "USD"),
      })),
    };
  }

  if (type === "trust-balances") {
    const data = await reportTrustBalances(firmId);
    return {
      title: data.title,
      subtitle: "Trust accounts and client balances",
      note: data.note,
      asOf,
      summaryLines: [
        `${data.accounts.length} trust account(s)`,
        `${data.clients.length} client balance(s)`,
      ],
      columns: [
        { key: "section", header: "Section" },
        { key: "name", header: "Name" },
        { key: "currency", header: "Currency" },
        { key: "balance", header: "Balance", align: "right" },
      ],
      rows: [
        ...data.accounts.map((a) => ({
          section: "Account",
          name: a.name,
          currency: a.currency,
          balance: centsToDisplay(a.balanceCents, a.currency),
        })),
        ...data.clients.map((c) => ({
          section: "Client",
          name: c.clientName,
          currency: c.currency,
          balance: centsToDisplay(c.balanceCents, c.currency),
        })),
      ],
    };
  }

  if (type === "trust-movements") {
    const data = await reportTrustMovements(firmId, filters);
    return {
      title: data.title,
      subtitle: "Trust ledger movements",
      note: data.note,
      asOf,
      summaryLines: [`${data.rows.length} movement(s)`],
      columns: [
        { key: "when", header: "Date" },
        { key: "entryType", header: "Type" },
        { key: "accountName", header: "Account" },
        { key: "clientName", header: "Client" },
        { key: "amount", header: "Amount", align: "right" },
        { key: "reference", header: "Reference" },
      ],
      rows: data.rows.map((r) => ({
        when: shortDate(r.occurredAt),
        entryType: r.entryType,
        accountName: r.accountName,
        clientName: r.clientName ?? "n/a",
        amount: centsToDisplay(r.amountCents, r.currency),
        reference: r.reference ?? r.narrative ?? "",
      })),
    };
  }

  if (type === "workload") {
    const data = await reportWorkload(firmId, filters);
    return {
      title: data.title,
      subtitle: "Open matters by responsible lawyer",
      asOf,
      summaryLines: data.summary.map((s) => `${s.lawyerName}: ${s.count} matter(s)`),
      columns: [
        { key: "matterNumber", header: "Number" },
        { key: "title", header: "Matter" },
        { key: "status", header: "Status" },
        { key: "lawyerName", header: "Lawyer" },
        { key: "clientName", header: "Client" },
        { key: "hearing", header: "Next hearing" },
      ],
      rows: data.rows.map((r) => ({
        matterNumber: r.matterNumber ?? "",
        title: r.title,
        status: r.status,
        lawyerName: r.lawyerName,
        clientName: r.clientName,
        hearing: shortDate(r.nextHearingAt),
      })),
    };
  }

  const data = await reportUpcoming(firmId, filters);
  return {
    title: data.title,
    subtitle: `${shortDate(data.from)} to ${shortDate(data.to)}`,
    asOf,
    summaryLines: [
      `${data.hearings.length} calendar event(s)`,
      `${data.deadlines.length} deadline(s)`,
    ],
    columns: [
      { key: "kind", header: "Kind" },
      { key: "when", header: "When" },
      { key: "title", header: "Title" },
      { key: "matter", header: "Matter" },
    ],
    rows: [
      ...data.hearings.map((h) => ({
        kind: h.eventType,
        when: shortDate(h.startsAt),
        title: h.title,
        matter: h.matterNumber ? `${h.matterNumber} · ${h.matterTitle ?? ""}` : (h.matterTitle ?? ""),
      })),
      ...data.deadlines.map((d) => ({
        kind: "deadline",
        when: shortDate(d.dueAt),
        title: d.title,
        matter: d.matterNumber ? `${d.matterNumber} · ${d.matterTitle}` : d.matterTitle,
      })),
    ],
  };
}

export async function practiceReportToCsv(
  firmId: string,
  type: ReportType,
  filters: ReportFilters,
): Promise<string> {
  const data = await runReport(firmId, type, filters);
  return reportToCsv(type, data);
}
