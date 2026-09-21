import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { isMissingRelationError } from "@/lib/db/missing-relation";
import { binaryDownloadResponse, safeExportFilename } from "@/lib/export/download-response";
import { exportProformaDocx, exportProformaPdf } from "@/lib/export/to-proforma-pdf";
import { getProforma } from "@/lib/repos/proformas";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

const MIGRATION_HINT =
  "Pro forma tables are missing on this database. Run npm run db:migrate (migration 0050_pro_formas / 0051_proforma_money_class), then refresh.";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Ctx) {
  try {
    const session = await requirePermission("billing.view");
    const firmId = tenantFirmId(session);
    const { id } = await ctx.params;
    const url = new URL(request.url);
    const formatRaw = (url.searchParams.get("format") || "pdf").toLowerCase();
    if (formatRaw !== "pdf" && formatRaw !== "docx") {
      throw new AuthError("validation", "format must be pdf or docx.");
    }

    let row;
    try {
      row = await getProforma(firmId, id);
    } catch (err) {
      if (isMissingRelationError(err)) {
        throw new AuthError("validation", MIGRATION_HINT);
      }
      throw err;
    }
    if (!row) throw new AuthError("not_found", "Pro forma not found.");

    const bytes =
      formatRaw === "docx"
        ? await exportProformaDocx(firmId, id)
        : await exportProformaPdf(firmId, id);

    await writeAuditLog({
      action: "proformas.export",
      firmId,
      userId: session.id,
      entityType: "pro_forma",
      entityId: id,
      metadata: {
        proformaNumber: row.proforma.proformaNumber,
        format: formatRaw,
      },
      ipOrUserAgent: clientInfo(request),
    }).catch(() => undefined);

    const filename = safeExportFilename(
      `ProForma-${row.proforma.proformaNumber}`,
      formatRaw,
    );
    return binaryDownloadResponse(filename, formatRaw, bytes);
  } catch (err) {
    return jsonError(err, request);
  }
}
