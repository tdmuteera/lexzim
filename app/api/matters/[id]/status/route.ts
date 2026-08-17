import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { serializeMatter } from "@/lib/matters/serialize";
import { parseMatterStatus, statusLabel } from "@/lib/matters/validation";
import { createMatterEvent } from "@/lib/repos/matter-workflow";
import {
  getMatterById,
  updateMatterStatus,
  userCanAccessMatter,
} from "@/lib/repos/matters";
import { canViewAllMatters, requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
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
    const status = parseMatterStatus(body);
    if (status === existing.status) {
      return jsonOk({
        matter: serializeMatter(existing, {
          clientDisplayName: existing.clientDisplayName,
          responsibleLawyerName: existing.responsibleLawyerName,
        }),
      });
    }

    const row = await updateMatterStatus(firmId, id, status);
    if (!row) {
      throw new AuthError("not_found", "Matter not found.");
    }

    await createMatterEvent({
      firmId,
      matterId: row.id,
      eventType: "status_change",
      title: `Status changed to ${statusLabel(status)}`,
      body: `Previous status: ${statusLabel(existing.status)}.`,
      createdBy: session.id,
    });

    await writeAuditLog({
      action: "matters.status_change",
      firmId,
      userId: session.id,
      entityType: "matter",
      entityId: row.id,
      metadata: {
        from: existing.status,
        to: status,
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
