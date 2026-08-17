import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { serializeClient } from "@/lib/clients/serialize";
import { archiveClient, getClientById } from "@/lib/repos/clients";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("clients.delete");
    const firmId = tenantFirmId(session);
    const { id } = await context.params;

    const existing = await getClientById(firmId, id);
    if (!existing) {
      throw new AuthError("not_found", "Client not found.");
    }
    if (existing.archivedAt) {
      throw new AuthError("validation", "Client is already archived.");
    }

    const row = await archiveClient(firmId, id);
    if (!row) {
      throw new AuthError("not_found", "Client not found.");
    }

    await writeAuditLog({
      action: "clients.archive",
      firmId,
      userId: session.id,
      entityType: "client",
      entityId: row.id,
      metadata: { displayName: serializeClient(row).displayName },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk({ client: serializeClient(row) });
  } catch (err) {
    return jsonError(err, request);
  }
}
