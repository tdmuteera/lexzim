import { jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { getFinanceKpis } from "@/lib/repos/finance-kpis";
import { canViewAllMatters, requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

function parsePeriod(url: URL): { year?: number; month?: number } {
  const yearRaw = url.searchParams.get("year");
  const monthRaw = url.searchParams.get("month");
  if (!yearRaw && !monthRaw) return {};
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new AuthError("validation", "year must be a valid year (2000-2100).");
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new AuthError("validation", "month must be between 1 and 12.");
  }
  return { year, month };
}

/**
 * GET /api/finance/kpis?year=&month=
 * Permission: finance.view
 */
export async function GET(request: Request) {
  try {
    const session = await requirePermission("finance.view");
    const firmId = tenantFirmId(session);
    const viewAll = canViewAllMatters(session);
    const url = new URL(request.url);
    const { year, month } = parsePeriod(url);

    const kpis = await getFinanceKpis(firmId, {
      userId: session.id,
      viewAll,
      periodYear: year,
      periodMonth: month,
      defaultCurrency: session.firm.defaultCurrency || "USD",
    });

    return jsonOk({ kpis });
  } catch (err) {
    return jsonError(err);
  }
}
