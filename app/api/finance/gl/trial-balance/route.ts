import { jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { buildTrialBalance } from "@/lib/gl/statements";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

function parseAsOf(url: URL): Date {
  const raw = url.searchParams.get("asOf")?.trim();
  const d = raw ? new Date(raw) : new Date();
  if (Number.isNaN(d.getTime())) {
    throw new AuthError("validation", "Invalid asOf date.");
  }
  return d;
}

export async function GET(request: Request) {
  try {
    const session = await requirePermission("finance.gl.view");
    const firmId = tenantFirmId(session);
    const url = new URL(request.url);
    const asOf = parseAsOf(url);
    const currency = session.firm.defaultCurrency || "USD";
    const report = await buildTrialBalance(firmId, asOf, currency);
    return jsonOk({ report });
  } catch (err) {
    return jsonError(err);
  }
}
