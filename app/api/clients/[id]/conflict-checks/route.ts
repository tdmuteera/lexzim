import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { parseConflictCheckInput } from "@/lib/conflict/validation";
import { getClientById } from "@/lib/repos/clients";
import {
  createConflictCheck,
  listConflictChecksByClient,
  serializeConflictCheck,
} from "@/lib/repos/conflict-checks";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET/POST /api/clients/[id]/conflict-checks
 */
export async function GET(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("clients.view");
    const firmId = tenantFirmId(session);
    const { id: clientId } = await context.params;

    const client = await getClientById(firmId, clientId);
    if (!client) {
      throw new AuthError("not_found", "Client not found.");
    }

    const rows = await listConflictChecksByClient(firmId, clientId);
    return jsonOk({
      items: rows.map(serializeConflictCheck),
      latest: rows[0] ? serializeConflictCheck(rows[0]) : null,
    });
  } catch (err) {
    return jsonError(err, request);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("clients.edit");
    const firmId = tenantFirmId(session);
    const { id: clientId } = await context.params;

    const client = await getClientById(firmId, clientId);
    if (!client) {
      throw new AuthError("not_found", "Client not found.");
    }

    const body = await request.json();
    const input = parseConflictCheckInput({
      ...(body && typeof body === "object" ? body : {}),
      clientId,
    });

    const row = await createConflictCheck(firmId, session.id, input);

    await writeAuditLog({
      action: "conflict.check.create",
      firmId,
      userId: session.id,
      entityType: "conflict_check",
      entityId: row.id,
      metadata: {
        clientId,
        result: row.result,
        matterId: row.matterId,
        query: row.query,
      },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk({ item: serializeConflictCheck(row) }, { status: 201 });
  } catch (err) {
    return jsonError(err, request);
  }
}
