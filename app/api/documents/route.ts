import { jsonError, jsonOk } from "@/lib/auth/http";
import { serializeDocument } from "@/lib/documents/serialize";
import {
  listAccessibleClientIds,
} from "@/lib/repos/clients";
import { listClientDocumentsForFirm } from "@/lib/repos/documents";
import {
  canViewAllClients,
  requirePermission,
} from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

/** Firm-wide document search. Empty until a search query is provided. Custody filtered. */
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

    if (!q?.trim()) {
      return jsonOk({ items: [], requiresSearch: true });
    }

    const viewAll = canViewAllClients(session);
    const accessibleClientIds = viewAll
      ? null
      : await listAccessibleClientIds(firmId, session.id);

    const rows = await listClientDocumentsForFirm(firmId, {
      q,
      accessibleClientIds,
    });
    return jsonOk({
      items: rows.map((row) => ({
        ...serializeDocument(row, { createdByName: row.createdByName }),
        clientDisplayName: row.clientDisplayName,
        clientNumber: row.clientNumber,
        matterNumber: row.matterNumber ?? null,
        matterTitle: row.matterTitle ?? null,
      })),
      requiresSearch: false,
    });
  } catch (err) {
    return jsonError(err, request);
  }
}
