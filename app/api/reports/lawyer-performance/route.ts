import { jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import {
  buildLawyerPerformance,
  defaultLawyerPerformanceRange,
} from "@/lib/repos/lawyer-performance";
import {
  canViewAllLawyerPerformance,
  hasPermission,
  requirePermission,
} from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

function parseDate(value: string | null, label: string): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new AuthError("validation", `${label} is invalid.`);
  }
  return d;
}

/**
 * GET /api/reports/lawyer-performance?from=&to=
 * Caseload + collected fees by responsible lawyer.
 */
export async function GET(request: Request) {
  try {
    const session = await requirePermission("reports.view");
    const firmId = tenantFirmId(session);
    const url = new URL(request.url);
    const defaults = defaultLawyerPerformanceRange();
    const from = parseDate(url.searchParams.get("from"), "from") ?? defaults.from;
    const to = parseDate(url.searchParams.get("to"), "to") ?? defaults.to;
    if (from > to) {
      throw new AuthError("validation", "from must be on or before to.");
    }

    const viewAll = canViewAllLawyerPerformance(session);
    const includeGlCheck =
      viewAll && hasPermission(session, "finance.gl.view");

    const report = await buildLawyerPerformance({
      firmId,
      from,
      to,
      currency: session.firm.defaultCurrency || "USD",
      viewAll,
      lawyerId: session.id,
      includeGlCheck,
    });

    return jsonOk({ report });
  } catch (err) {
    return jsonError(err, request);
  }
}
