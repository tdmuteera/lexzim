import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { serializeParty } from "@/lib/parties/serialize";
import { parsePartyInput, partyRoleLabel } from "@/lib/parties/validation";
import { createMatterEvent } from "@/lib/repos/timeline";
import { getMatterById, userCanAccessMatter } from "@/lib/repos/matters";
import {
  createParty,
  getPartyById,
  listPartiesForMatter,
} from "@/lib/repos/parties";
import { canViewAllMatters, requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

type RouteContext = { params: Promise<{ id: string }> };

async function assertMatterAccess(
  firmId: string,
  matterId: string,
  userId: string,
  viewAll: boolean,
) {
  const allowed = await userCanAccessMatter(firmId, matterId, userId, viewAll);
  if (!allowed) {
    throw new AuthError("forbidden", "You do not have access to this matter.");
  }
  const matter = await getMatterById(firmId, matterId);
  if (!matter) {
    throw new AuthError("not_found", "Matter not found.");
  }
  return matter;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("matters.view");
    const firmId = tenantFirmId(session);
    const { id: matterId } = await context.params;
    await assertMatterAccess(firmId, matterId, session.id, canViewAllMatters(session));

    const rows = await listPartiesForMatter(firmId, matterId);
    return jsonOk({
      items: rows.map((row) =>
        serializeParty(row, {
          matterTitle: row.matterTitle,
          clientDisplayName: row.clientDisplayName,
        }),
      ),
    });
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("matters.edit");
    const firmId = tenantFirmId(session);
    const { id: matterId } = await context.params;
    const matter = await assertMatterAccess(
      firmId,
      matterId,
      session.id,
      canViewAllMatters(session),
    );

    const body = await request.json();
    const input = parsePartyInput({
      ...body,
      matterId,
      clientId: body.clientId ?? matter.clientId,
    });

    const row = await createParty(firmId, input);

    await createMatterEvent({
      firmId,
      matterId,
      eventType: "system",
      title: `Related party added: ${row.name}`,
      body: partyRoleLabel(row.partyRole),
      createdBy: session.id,
    });

    await writeAuditLog({
      action: "parties.create",
      firmId,
      userId: session.id,
      entityType: "related_party",
      entityId: row.id,
      metadata: {
        matterId,
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
    return jsonError(err);
  }
}
