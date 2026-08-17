import { jsonError, jsonOk } from "@/lib/auth/http";
import { buildCrmOverview, listLawyersForCrmFilter } from "@/lib/repos/crm";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

export async function GET(request: Request) {
  try {
    const session = await requirePermission("crm.view");
    const firmId = tenantFirmId(session);
    const url = new URL(request.url);
    const responsibleLawyerId =
      url.searchParams.get("responsibleLawyerId")?.trim() || undefined;

    const [overview, lawyers] = await Promise.all([
      buildCrmOverview(firmId, { responsibleLawyerId }),
      listLawyersForCrmFilter(firmId),
    ]);

    return jsonOk({
      overview,
      lawyers: lawyers.map((l) => ({
        id: l.id,
        label: l.fullName?.trim() || l.email,
      })),
    });
  } catch (err) {
    return jsonError(err, request);
  }
}
