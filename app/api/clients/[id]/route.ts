import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { serializeClient, serializeClientLite } from "@/lib/clients/serialize";
import { parseClientInput } from "@/lib/clients/validation";
import { getClientById, updateClient } from "@/lib/repos/clients";
import { getMatterCountsForClient } from "@/lib/repos/matters";
import {
  canLookupClients,
  canViewAllMatters,
  hasPermission,
  requireAny,
} from "@/lib/rbac/guards";
import { requireSession } from "@/lib/auth/session";
import { tenantFirmId } from "@/lib/tenant/scope";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const session = await requireSession();
    if (!canLookupClients(session)) {
      throw new AuthError("forbidden", "Permission required: clients.view or billing.");
    }
    const firmId = tenantFirmId(session);
    const { id } = await context.params;
    const fullAccess = hasPermission(session, "clients.view");

    const row = await getClientById(firmId, id);
    if (!row) {
      throw new AuthError("not_found", "Client not found.");
    }

    if (!fullAccess) {
      return jsonOk({ client: serializeClientLite(row), lite: true });
    }

    const matterCounts = await getMatterCountsForClient(firmId, id, {
      viewAll: canViewAllMatters(session),
      userId: session.id,
    });

    return jsonOk({
      client: serializeClient(row),
      matterCounts,
      lite: false,
    });
  } catch (err) {
    return jsonError(err, request);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const session = await requireAny(["clients.edit", "clients.kyc.manage"]);
    const firmId = tenantFirmId(session);
    const { id } = await context.params;
    const body = await request.json();
    const input = parseClientInput(body);

    const existing = await getClientById(firmId, id);
    if (!existing) {
      throw new AuthError("not_found", "Client not found.");
    }

    const row = await updateClient(firmId, id, input);
    if (!row) {
      throw new AuthError("not_found", "Client not found.");
    }

    await writeAuditLog({
      action: "clients.update",
      firmId,
      userId: session.id,
      entityType: "client",
      entityId: row.id,
      metadata: {
        clientType: row.clientType,
        displayName: serializeClient(row).displayName,
      },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk({ client: serializeClient(row) });
  } catch (err) {
    return jsonError(err, request);
  }
}
