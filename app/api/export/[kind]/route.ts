import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import {
  binaryDownloadResponse,
  safeExportFilename,
} from "@/lib/export/download-response";
import {
  EXPORT_REGISTRY,
  isExportKind,
  renderExport,
} from "@/lib/export/registry";
import { isExportFormat } from "@/lib/export/types";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

type RouteProps = { params: Promise<{ kind: string }> };

/**
 * GET /api/export/[kind]?format=pdf|docx|xlsx|csv&…filters
 * Universal branded export (Phase 7 P7-02). Pilot: debtors.
 */
export async function GET(request: Request, { params }: RouteProps) {
  try {
    const { kind: kindRaw } = await params;
    if (!isExportKind(kindRaw)) {
      throw new AuthError("not_found", `Unknown export kind: ${kindRaw}`);
    }

    const def = EXPORT_REGISTRY[kindRaw];
    const session = await requirePermission(def.permission);
    const firmId = tenantFirmId(session);

    const url = new URL(request.url);
    const formatRaw = url.searchParams.get("format");
    if (!isExportFormat(formatRaw)) {
      throw new AuthError(
        "validation",
        "format is required (pdf, docx, xlsx, or csv).",
      );
    }

    const { bytes, filenameBase } = await renderExport(kindRaw, formatRaw, {
      firmId,
      session,
      searchParams: url.searchParams,
    });

    await writeAuditLog({
      action: def.auditAction,
      firmId,
      userId: session.id,
      entityType: "export",
      entityId: kindRaw,
      metadata: {
        format: formatRaw,
        query: Object.fromEntries(url.searchParams.entries()),
      },
      ipOrUserAgent: clientInfo(request),
    });

    return binaryDownloadResponse(
      safeExportFilename(filenameBase, formatRaw),
      formatRaw,
      bytes,
    );
  } catch (err) {
    return jsonError(err);
  }
}
