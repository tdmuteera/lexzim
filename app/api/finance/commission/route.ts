/**
 * GET /api/finance/commission?month=YYYY-MM
 * Per-lawyer commission for a calendar month (collected fees above target).
 */
import { jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import {
  buildCommissionMonthReport,
  currentYearMonth,
} from "@/lib/repos/finance-commission";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

export async function GET(request: Request) {
  try {
    const session = await requirePermission("finance.commission.view");
    const firmId = tenantFirmId(session);
    const url = new URL(request.url);
    const month = (url.searchParams.get("month") || currentYearMonth()).trim();
    if (!/^\d{4}-\d{2}$/.test(month)) {
      throw new AuthError("validation", "month must be YYYY-MM.");
    }

    const report = await buildCommissionMonthReport({
      firmId,
      yearMonth: month,
      currencyFallback: session.firm.defaultCurrency || "USD",
    });

    return jsonOk({ report });
  } catch (err) {
    return jsonError(err, request);
  }
}
