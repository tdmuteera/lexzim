import { jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { isMissingRelationError } from "@/lib/db/missing-relation";
import { serializeProformaDetail } from "@/lib/proforma/serialize";
import { getProforma } from "@/lib/repos/proformas";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

const MIGRATION_HINT =
  "Pro forma tables are missing on this database. Run npm run db:migrate (migration 0050_pro_formas), then refresh.";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Ctx) {
  try {
    const session = await requirePermission("billing.view");
    const firmId = tenantFirmId(session);
    const { id } = await ctx.params;
    try {
      const row = await getProforma(firmId, id);
      if (!row) throw new AuthError("not_found", "Pro forma not found.");
      return jsonOk({ proforma: serializeProformaDetail(row) });
    } catch (err) {
      if (isMissingRelationError(err)) {
        throw new AuthError("validation", MIGRATION_HINT);
      }
      throw err;
    }
  } catch (err) {
    return jsonError(err, request);
  }
}
