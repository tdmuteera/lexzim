import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { serializeParty } from "@/lib/parties/serialize";
import { parsePartyInput } from "@/lib/parties/validation";
import { getClientById } from "@/lib/repos/clients";
import { userCanAccessMatter } from "@/lib/repos/matters";
import {
  createParty,
  getPartyById,
  listPartiesForClient,
} from "@/lib/repos/parties";
import { canViewAllMatters, requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("clients.view");
    const firmId = tenantFirmId(session);
    const viewAll = canViewAllMatters(session);
    const { id: clientId } = await context.params;

    const client = await getClientById(firmId, clientId);
    if (!client) {
      throw new AuthError("not_found", "Client not found.");
    }

    const rows = await listPartiesForClient(firmId, clientId, {
      viewAll,
      userId: session.id,
    });
    return jsonOk({
      items: rows.map((row) =>
        serializeParty(row, {
          matterTitle: row.matterTitle,
          clientDisplayName: row.clientDisplayName,
        }),
      ),
    });
  } catch (err) {
    return jsonError(err, request);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("clients.edit");
    const firmId = tenantFirmId(session);
    const viewAll = canViewAllMatters(session);
    const { id: clientId } = await context.params;

    const client = await getClientById(firmId, clientId);
    if (!client) {
      throw new AuthError("not_found", "Client not found.");
    }

    const body = await request.json();
    const input = parsePartyInput({
      ...body,
      clientId,
      matterId: body.matterId ?? null,
    });

    if (input.matterId) {
      const allowed = await userCanAccessMatter(
        firmId,
        input.matterId,
        session.id,
        viewAll,
      );
      if (!allowed) {
        throw new AuthError("forbidden", "You do not have access to this matter.");
      }
    }

    const row = await createParty(firmId, input);

    await writeAuditLog({
      action: "parties.create",
      firmId,
      userId: session.id,
      entityType: "related_party",
      entityId: row.id,
      metadata: {
        clientId,
        matterId: row.matterId,
        name: row.name,
        partyRole: row.partyRole,
      },
      ipOrUserAgent: clientInfo(request),
    });

    const full = await getPartyById(firmId, row.id);
    return jsonOk(
      {
        party: serializeParty(full ?? row, {
          matterTitle: full?.matterTitle,
          clientDisplayName: full?.clientDisplayName,
        }),
      },
      { status: 201 },
    );
  } catch (err) {
    return jsonError(err, request);
  }
}
