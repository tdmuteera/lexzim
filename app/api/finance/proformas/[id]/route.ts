import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { isMissingRelationError } from "@/lib/db/missing-relation";
import { serializeProformaDetail } from "@/lib/proforma/serialize";
import { parseUpdateProformaInput } from "@/lib/proforma/validation";
import { deleteProforma, getProforma, updateProforma } from "@/lib/repos/proformas";
import { requireAny, requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

const MIGRATION_HINT =
  "Pro forma tables are missing on this database. Run npm run db:migrate (migration 0050_pro_formas / 0051_proforma_money_class), then refresh.";

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

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    const session = await requireAny(["finance.quote.manage", "billing.manage"]);
    const firmId = tenantFirmId(session);
    const { id } = await ctx.params;
    const body = await request.json();
    const input = parseUpdateProformaInput(body);

    let updated;
    try {
      updated = await updateProforma(firmId, id, input);
    } catch (err) {
      if (isMissingRelationError(err)) {
        throw new AuthError("validation", MIGRATION_HINT);
      }
      throw err;
    }

    await writeAuditLog({
      action: "proformas.update",
      firmId,
      userId: session.id,
      entityType: "pro_forma",
      entityId: updated.id,
      metadata: {
        proformaNumber: updated.proformaNumber,
        kind: updated.kind,
        conveyancingCategory: updated.conveyancingCategory,
        clientId: updated.clientId,
      },
      ipOrUserAgent: clientInfo(request),
    }).catch(() => undefined);

    const row = await getProforma(firmId, updated.id);
    if (!row) throw new AuthError("server", "Pro forma updated but could not reload.");
    return jsonOk({ proforma: serializeProformaDetail(row) });
  } catch (err) {
    return jsonError(err, request);
  }
}

export async function DELETE(request: Request, ctx: Ctx) {
  try {
    const session = await requirePermission("finance.proforma.delete");
    const firmId = tenantFirmId(session);
    const { id } = await ctx.params;

    let deleted;
    try {
      deleted = await deleteProforma(firmId, id);
    } catch (err) {
      if (isMissingRelationError(err)) {
        throw new AuthError("validation", MIGRATION_HINT);
      }
      throw err;
    }

    await writeAuditLog({
      action: "proformas.delete",
      firmId,
      userId: session.id,
      entityType: "pro_forma",
      entityId: deleted.id,
      metadata: {
        proformaNumber: deleted.proformaNumber,
        clientId: deleted.clientId,
        status: deleted.status,
      },
      ipOrUserAgent: clientInfo(request),
    }).catch(() => undefined);

    return jsonOk({ deleted: { id: deleted.id, proformaNumber: deleted.proformaNumber } });
  } catch (err) {
    return jsonError(err, request);
  }
}
