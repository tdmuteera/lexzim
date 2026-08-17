import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { serializeProcedure } from "@/lib/procedures/serialize";
import { parseProcedureInput } from "@/lib/procedures/validation";
import { createMatterEvent } from "@/lib/repos/matter-workflow";
import { userCanAccessMatter } from "@/lib/repos/matters";
import {
  getProcedureById,
  updateProcedure,
} from "@/lib/repos/procedures";
import { canViewAllMatters, requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("matters.edit");
    const firmId = tenantFirmId(session);
    const { id } = await context.params;
    const viewAll = canViewAllMatters(session);

    const existing = await getProcedureById(firmId, id);
    if (!existing) {
      throw new AuthError("not_found", "Procedure not found.");
    }

    const allowed = await userCanAccessMatter(
      firmId,
      existing.matterId,
      session.id,
      viewAll,
    );
    if (!allowed) {
      throw new AuthError("forbidden", "You do not have access to this matter.");
    }

    const body = await request.json();
    const input = parseProcedureInput(body);
    const row = await updateProcedure(firmId, id, input);
    if (!row) {
      throw new AuthError("not_found", "Procedure not found.");
    }

    await writeAuditLog({
      action: "procedures.update",
      firmId,
      userId: session.id,
      entityType: "pending_procedure",
      entityId: row.id,
      metadata: { matterId: row.matterId, title: row.title, status: row.status },
      ipOrUserAgent: clientInfo(request),
    });

    if (input.status && input.status !== existing.status) {
      await createMatterEvent({
        firmId,
        matterId: row.matterId,
        eventType: "procedure",
        title: `Procedure ${input.status}: ${row.title}`,
        createdBy: session.id,
      });
    }

    const full = await getProcedureById(firmId, id);
    return jsonOk({
      procedure: serializeProcedure(full ?? row, {
        assigneeName: full?.assigneeName,
        matterTitle: full?.matterTitle,
      }),
    });
  } catch (err) {
    return jsonError(err, request);
  }
}
