import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { serializeParty } from "@/lib/parties/serialize";
import { parsePartyInput, partyRoleLabel } from "@/lib/parties/validation";
import { createMatterEvent } from "@/lib/repos/timeline";
import { userCanAccessMatter } from "@/lib/repos/matters";
import {
  deleteParty,
  getPartyById,
  updateParty,
} from "@/lib/repos/parties";
import {
  canViewAllMatters,
  requireAny,
  requirePermission,
} from "@/lib/rbac/guards";
import { hasPermission } from "@/lib/rbac/permissions";
import { tenantFirmId } from "@/lib/tenant/scope";

type RouteContext = { params: Promise<{ id: string }> };

async function assertCanMutateParty(
  firmId: string,
  party: { matterId: string | null; clientId: string | null },
  session: { id: string; permissions: string[] | readonly string[] },
) {
  if (party.matterId) {
    await requirePermission("matters.edit");
    const allowed = await userCanAccessMatter(
      firmId,
      party.matterId,
      session.id,
      canViewAllMatters(session as never),
    );
    if (!allowed) {
      throw new AuthError("forbidden", "You do not have access to this matter.");
    }
    return;
  }

  if (party.clientId) {
    if (!hasPermission(session as never, "clients.edit")) {
      throw new AuthError("forbidden", "Permission required: clients.edit");
    }
    return;
  }

  await requireAny(["matters.edit", "clients.edit"]);
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const session = await requireAny(["matters.edit", "clients.edit"]);
    const firmId = tenantFirmId(session);
    const { id } = await context.params;
    const existing = await getPartyById(firmId, id);
    if (!existing) {
      throw new AuthError("not_found", "Related party not found.");
    }

    await assertCanMutateParty(firmId, existing, session);

    const body = await request.json();
    const input = parsePartyInput({
      ...body,
      matterId: body.matterId ?? existing.matterId,
      clientId: body.clientId ?? existing.clientId,
    });

    if (input.matterId && input.matterId !== existing.matterId) {
      const allowed = await userCanAccessMatter(
        firmId,
        input.matterId,
        session.id,
        canViewAllMatters(session),
      );
      if (!allowed) {
        throw new AuthError("forbidden", "You do not have access to this matter.");
      }
    }

    const row = await updateParty(firmId, id, input);
    if (!row) {
      throw new AuthError("not_found", "Related party not found.");
    }

    await writeAuditLog({
      action: "parties.update",
      firmId,
      userId: session.id,
      entityType: "related_party",
      entityId: row.id,
      metadata: { name: row.name, partyRole: row.partyRole },
      ipOrUserAgent: clientInfo(request),
    });

    const full = await getPartyById(firmId, id);
    return jsonOk({
      party: serializeParty(full ?? row, {
        matterTitle: full?.matterTitle,
        clientDisplayName: full?.clientDisplayName,
      }),
    });
  } catch (err) {
    return jsonError(err, request);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const session = await requireAny(["matters.edit", "clients.edit"]);
    const firmId = tenantFirmId(session);
    const { id } = await context.params;
    const existing = await getPartyById(firmId, id);
    if (!existing) {
      throw new AuthError("not_found", "Related party not found.");
    }

    await assertCanMutateParty(firmId, existing, session);

    const row = await deleteParty(firmId, id);
    if (!row) {
      throw new AuthError("not_found", "Related party not found.");
    }

    if (row.matterId) {
      await createMatterEvent({
        firmId,
        matterId: row.matterId,
        eventType: "system",
        title: `Related party removed: ${row.name}`,
        body: partyRoleLabel(row.partyRole),
        createdBy: session.id,
      });
    }

    await writeAuditLog({
      action: "parties.delete",
      firmId,
      userId: session.id,
      entityType: "related_party",
      entityId: row.id,
      metadata: { name: row.name, partyRole: row.partyRole },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk({ deleted: true, id: row.id });
  } catch (err) {
    return jsonError(err, request);
  }
}
