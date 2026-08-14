import { jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { csvDownloadResponse } from "@/lib/reports/csv";
import {
  getMonthlyFinancePack,
  getWeeklyFinancePack,
  monthlyPackToCsv,
  weeklyPackToCsv,
} from "@/lib/repos/finance-reports";
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

function parsePeriodYearMonth(url: URL): { year: number; month: number } {
  const year = Number(url.searchParams.get("year"));
  const month = Number(url.searchParams.get("month"));
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new AuthError("validation", "year must be a valid year (2000-2100).");
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new AuthError("validation", "month must be between 1 and 12.");
  }
  return { year, month };
}

/**
 * GET /api/finance/reports?pack=weekly|monthly&asOf=&year=&month=&format=json|csv
 * Permission: finance.view
 */
export async function GET(request: Request) {
  try {
    const session = await requirePermission("finance.view");
    const firmId = tenantFirmId(session);
    const viewAll = canViewAllMatters(session);
    const url = new URL(request.url);
    const pack = url.searchParams.get("pack") ?? "weekly";
    const format = url.searchParams.get("format") === "csv" ? "csv" : "json";
    const defaultCurrency = session.firm.defaultCurrency || "USD";
    const stamp = new Date().toISOString().slice(0, 10);

    if (pack === "monthly") {
      const { year, month } = parsePeriodYearMonth(url);
      const data = await getMonthlyFinancePack(firmId, year, month, {
        defaultCurrency,
      });

      if (format === "csv") {
        return csvDownloadResponse(
          `lexzim-finance-monthly-${year}-${String(month).padStart(2, "0")}.csv`,
          monthlyPackToCsv(data),
        );
      }

      return jsonOk({ pack: data });
    }

    if (pack !== "weekly") {
      throw new AuthError("validation", "pack must be weekly or monthly.");
    }

    const asOf = parseDate(url.searchParams.get("asOf"));
    const data = await getWeeklyFinancePack(firmId, {
      userId: session.id,
      viewAll,
      asOf,
      defaultCurrency,
    });

    if (format === "csv") {
      return csvDownloadResponse(`lexzim-finance-weekly-${stamp}.csv`, weeklyPackToCsv(data));
    }

    return jsonOk({ pack: data });
  } catch (err) {
    return jsonError(err);
  }
}
