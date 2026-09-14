import { jsonError, jsonOk } from "@/lib/auth/http";
import { serializeDocument } from "@/lib/documents/serialize";
import { listClientDocumentsForFirm } from "@/lib/repos/documents";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

/** Firm-wide client documents (matter files excluded). */
export async function GET(request: Request) {
  try {
    const session = await requirePermission("documents.view");
    const firmId = tenantFirmId(session);
    const url = new URL(request.url);
    const q = url.searchParams.get("q") ?? undefined;
    const scope = url.searchParams.get("scope") ?? "client";

    if (scope !== "client") {
      return jsonOk({ items: [] });
    }

    const rows = await listClientDocumentsForFirm(firmId, { q });
    return jsonOk({
      items: rows.map((row) => ({
        ...serializeDocument(row, { createdByName: row.createdByName }),
        clientDisplayName: row.clientDisplayName,
        clientNumber: row.clientNumber,
        matterNumber: row.matterNumber ?? null,
        matterTitle: row.matterTitle ?? null,
      })),
    });
  } catch (err) {
    return jsonError(err, request);
  }
}
