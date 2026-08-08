import { jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { csvDownloadResponse } from "@/lib/reports/csv";
import {
  isReportType,
  reportToCsv,
  runReport,
  type ReportFilters,
  type ReportType,
} from "@/lib/repos/reports";
import { requirePermission } from "@/lib/rbac/guards";
import { assertCanUse } from "@/lib/licensing/policy";
import { tenantFirmId } from "@/lib/tenant/scope";

type RouteContext = { params: Promise<{ type: string }> };

function parseDate(value: string | null): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new AuthError("validation", `Invalid date: ${value}`);
  }
  return d;
}

function filtersFromUrl(url: URL): ReportFilters {
  return {
    from: parseDate(url.searchParams.get("from")),
    to: parseDate(url.searchParams.get("to")),
    lawyerId: url.searchParams.get("lawyerId") ?? undefined,
    matterId: url.searchParams.get("matterId") ?? undefined,
    clientId: url.searchParams.get("clientId") ?? undefined,
    trustAccountId: url.searchParams.get("trustAccountId") ?? undefined,
    groupBy:
      url.searchParams.get("groupBy") === "matter" ? "matter" : "lawyer",
  };
}

/**
 * GET /api/reports/[type]?format=json|csv&from=&to=&lawyerId=&matterId=&clientId=&trustAccountId=&groupBy=
 * Permission: reports.view only.
 */
export async function GET(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("reports.view");
    const firmId = tenantFirmId(session);
    await assertCanUse(firmId, "reports");
    const { type: rawType } = await context.params;
    if (!isReportType(rawType)) {
      throw new AuthError(
        "validation",
        "Unknown report type. Use ar-aging, time, trust-balances, trust-movements, workload, or upcoming.",
      );
    }
    const type = rawType as ReportType;
    const url = new URL(request.url);
    const filters = filtersFromUrl(url);
    const format = url.searchParams.get("format") === "csv" ? "csv" : "json";

    const data = await runReport(firmId, type, filters);

    if (format === "csv") {
      const csv = reportToCsv(type, data);
      return csvDownloadResponse(`lexzim-${type}.csv`, csv);
    }

    return jsonOk({ type, filters: {
      from: filters.from?.toISOString() ?? null,
      to: filters.to?.toISOString() ?? null,
      lawyerId: filters.lawyerId ?? null,
      matterId: filters.matterId ?? null,
      clientId: filters.clientId ?? null,
      trustAccountId: filters.trustAccountId ?? null,
      groupBy: filters.groupBy ?? null,
    }, report: data });
  } catch (err) {
    return jsonError(err);
  }
}
