import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { getClientById } from "@/lib/repos/clients";
import { assertClearConflictForOpenMatter } from "@/lib/repos/conflict-checks";
import { serializeMatter } from "@/lib/matters/serialize";
import { parseMatterInput, statusLabel } from "@/lib/matters/validation";
import { createMatterEvent, listMatterEvents } from "@/lib/repos/timeline";
import { serializeMatterEvent } from "@/lib/timeline/serialize";
import {
  getMatterById,
  updateMatter,
  userCanAccessMatter,
} from "@/lib/repos/matters";
import { canViewAllMatters, requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("matters.view");
    const firmId = tenantFirmId(session);
    const { id } = await context.params;
    const viewAll = canViewAllMatters(session);

    const allowed = await userCanAccessMatter(firmId, id, session.id, viewAll);
    if (!allowed) {
      throw new AuthError("forbidden", "You do not have access to this matter.");
    }

    const row = await getMatterById(firmId, id);
    if (!row) {
      throw new AuthError("not_found", "Matter not found.");
    }

    const events = await listMatterEvents(firmId, id);

    return jsonOk({
      matter: serializeMatter(row, {
        clientDisplayName: row.clientDisplayName,
        responsibleLawyerName: row.responsibleLawyerName,
      }),
      events: events.map((e) =>
        serializeMatterEvent(e, { createdByName: e.createdByName }),
      ),
    });
  } catch (err) {
    return jsonError(err, request);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("matters.edit");
    const firmId = tenantFirmId(session);
    const { id } = await context.params;
    const viewAll = canViewAllMatters(session);

    const allowed = await userCanAccessMatter(firmId, id, session.id, viewAll);
    if (!allowed) {
      throw new AuthError("forbidden", "You do not have access to this matter.");
    }

    const existing = await getMatterById(firmId, id);
    if (!existing) {
      throw new AuthError("not_found", "Matter not found.");
    }

    const body = await request.json();
    const input = parseMatterInput(
      { ...body, clientId: body.clientId ?? existing.clientId },
      { requireClientId: true },
    );

    if (input.clientId !== existing.clientId) {
      const client = await getClientById(firmId, input.clientId);
      if (!client) {
        throw new AuthError("validation", "Client not found in this firm.");
      }
    }

    const previousStatus = existing.status;
    const nextStatus = input.status ?? existing.status;
    if (nextStatus === "open" && previousStatus !== "open") {
      await assertClearConflictForOpenMatter(firmId, input.clientId, nextStatus);
    }

    const row = await updateMatter(firmId, id, input, session.id);
    if (!row) {
      throw new AuthError("not_found", "Matter not found.");
    }

    if (row.status !== previousStatus) {
      await createMatterEvent({
        firmId,
        matterId: row.id,
        eventType: "status_change",
        title: `Status changed to ${statusLabel(row.status)}`,
        body: `Previous status: ${statusLabel(previousStatus)}.`,
        createdBy: session.id,
      });
    }

    await writeAuditLog({
      action: "matters.update",
      firmId,
      userId: session.id,
      entityType: "matter",
      entityId: row.id,
      metadata: {
        title: row.title,
        status: row.status,
        previousStatus,
      },
      ipOrUserAgent: clientInfo(request),
    });

    const full = await getMatterById(firmId, id);
    return jsonOk({
      matter: serializeMatter(full ?? row, {
        clientDisplayName: full?.clientDisplayName,
        responsibleLawyerName: full?.responsibleLawyerName,
      }),
    });
  } catch (err) {
    return jsonError(err, request);
  }
}
