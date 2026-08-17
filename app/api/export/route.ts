import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { buildFirmArchive } from "@/lib/export/build-firm-archive";
import {
  getFirmSetting,
  LAST_EXPORT_AT_KEY,
  upsertFirmSetting,
} from "@/lib/repos/firm-settings";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

export async function GET(request: Request) {
  try {
    const session = await requirePermission("settings.manage");
    const firmId = tenantFirmId(session);
    const lastExportAt = await getFirmSetting(firmId, LAST_EXPORT_AT_KEY);

    return jsonOk({
      lastExportAt,
      warnings: [
        "Exports contain confidential client and matter data. Store them securely.",
        "Binary files in Supabase Storage are listed by path only; download those separately if you need full file copies.",
        "This is not a one-click restore. Restoration into a fresh firm is support-assisted in MVP.",
      ],
    });
  } catch (err) {
    return jsonError(err, request);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requirePermission("settings.manage");
    const firmId = tenantFirmId(session);

    const archive = await buildFirmArchive(firmId);

    await upsertFirmSetting(firmId, LAST_EXPORT_AT_KEY, archive.exportedAt);

    await writeAuditLog({
      action: "export_created",
      firmId,
      userId: session.id,
      entityType: "firm_export",
      entityId: firmId,
      metadata: {
        fileName: archive.fileName,
        exportedAt: archive.exportedAt,
        counts: archive.counts,
        storageKeyCount: archive.storageKeyCount,
      },
      ipOrUserAgent: clientInfo(request),
    });

    return new Response(Buffer.from(archive.zipBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${archive.fileName}"`,
        "X-Lexzim-Export-At": archive.exportedAt,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return jsonError(err, request);
  }
}
