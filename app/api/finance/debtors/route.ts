import { jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { AR_AGING_BUCKETS, type ArAgingBucket } from "@/lib/billing/aging";
import { csvDownloadResponse } from "@/lib/reports/csv";
import {
  debtorsToCsv,
  listDebtors,
  type DebtorsFilters,
} from "@/lib/repos/debtors";
import { assertInvoiceMatterAccess } from "@/lib/billing/access";
import { canViewAllMatters, requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

function parseDate(value: string | null): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new AuthError("validation", `Invalid date: ${value}`);
  }
  return d;
}

function parseBucket(value: string | null): ArAgingBucket | undefined {
  if (!value) return undefined;
  if ((AR_AGING_BUCKETS as readonly string[]).includes(value)) {
    return value as ArAgingBucket;
  }
  throw new AuthError("validation", `Invalid bucket. Use: ${AR_AGING_BUCKETS.join(", ")}`);
}

function filtersFromUrl(url: URL): DebtorsFilters {
  return {
    matterId: url.searchParams.get("matterId")?.trim() || undefined,
    clientId: url.searchParams.get("clientId")?.trim() || undefined,
    bucket: parseBucket(url.searchParams.get("bucket")),
    from: parseDate(url.searchParams.get("from")),
    to: parseDate(url.searchParams.get("to")),
  };
}

/**
 * GET /api/finance/debtors?format=json|csv&matterId=&clientId=&bucket=&from=&to=
 * Permission: billing.view (Finance → Debtors desk).
 */
export async function GET(request: Request) {
  try {
    const session = await requirePermission("billing.view");
    const firmId = tenantFirmId(session);
    const viewAll = canViewAllMatters(session);
    const url = new URL(request.url);
    const filters = filtersFromUrl(url);
    const format = url.searchParams.get("format") === "csv" ? "csv" : "json";

    if (filters.matterId) {
      await assertInvoiceMatterAccess(session, firmId, filters.matterId);
    }

    const report = await listDebtors(firmId, {
      userId: session.id,
      viewAll,
      filters,
    });

    if (format === "csv") {
      const stamp = new Date().toISOString().slice(0, 10);
      return csvDownloadResponse(`lexzim-debtors-${stamp}.csv`, debtorsToCsv(report));
    }

    return jsonOk({
      filters: {
        matterId: filters.matterId ?? null,
        clientId: filters.clientId ?? null,
        bucket: filters.bucket ?? null,
        from: filters.from?.toISOString() ?? null,
        to: filters.to?.toISOString() ?? null,
      },
      report,
    });
  } catch (err) {
    return jsonError(err, request);
  }
}
