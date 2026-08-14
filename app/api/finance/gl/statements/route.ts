import { jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { buildBalanceSheet, buildProfitAndLoss } from "@/lib/gl/statements";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

function parseDate(value: string | null, label: string): Date {
  if (!value) throw new AuthError("validation", `${label} is required.`);
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new AuthError("validation", `Invalid ${label}.`);
  }
  return d;
}

export async function GET(request: Request) {
  try {
    const session = await requirePermission("finance.gl.view");
    const firmId = tenantFirmId(session);
    const url = new URL(request.url);
    const kind = url.searchParams.get("kind")?.trim() || "pl";
    const currency = session.firm.defaultCurrency || "USD";

    if (kind === "balance_sheet") {
      const asOfRaw = url.searchParams.get("asOf");
      const asOf = asOfRaw ? parseDate(asOfRaw, "asOf") : new Date();
      const report = await buildBalanceSheet(firmId, asOf, currency);
      return jsonOk({ report, kind: "balance_sheet" });
    }

    const from = parseDate(url.searchParams.get("from"), "from");
    const to = parseDate(url.searchParams.get("to"), "to");
    const report = await buildProfitAndLoss(firmId, from, to, currency);
    return jsonOk({ report, kind: "pl" });
  } catch (err) {
    return jsonError(err);
  }
}
