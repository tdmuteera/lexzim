import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { serializeMatterDeadline } from "@/lib/deadlines/serialize";
import { parseMatterDeadlineStatusUpdate } from "@/lib/deadlines/validation";
import {
  deleteMatterDeadline,
  getMatterDeadline,
  updateMatterDeadlineStatus,
} from "@/lib/repos/calendar";
import { userCanAccessMatter } from "@/lib/repos/matters";
import { canViewAllMatters, requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("calendar.manage");
    const firmId = tenantFirmId(session);
    const { id } = await context.params;
    const existing = await getMatterDeadline(firmId, id);
    if (!existing) {
      throw new AuthError("not_found", "Matter deadline not found.");
    }

    const viewAll = canViewAllMatters(session);
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
    const input = parseMatterDeadlineStatusUpdate(body);
    const row = await updateMatterDeadlineStatus(firmId, id, input);
    if (!row) {
      throw new AuthError("not_found", "Matter deadline not found.");
    }

    await writeAuditLog({
      action: "matter_deadlines.update",
      firmId,
      userId: session.id,
      entityType: "matter_deadline",
      entityId: row.id,
      metadata: {
        matterId: row.matterId,
        status: row.status,
      },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk({ deadline: serializeMatterDeadline(row) });
  } catch (err) {
    return jsonError(err);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("calendar.manage");
    const firmId = tenantFirmId(session);
    const { id } = await context.params;
    const existing = await getMatterDeadline(firmId, id);
    if (!existing) {
      throw new AuthError("not_found", "Matter deadline not found.");
    }

    const viewAll = canViewAllMatters(session);
    const allowed = await userCanAccessMatter(
      firmId,
      existing.matterId,
      session.id,
      viewAll,
    );
    if (!allowed) {
      throw new AuthError("forbidden", "You do not have access to this matter.");
    }

    const deleted = await deleteMatterDeadline(firmId, id);
    if (!deleted) {
      throw new AuthError("not_found", "Matter deadline not found.");
    }

    await writeAuditLog({
      action: "matter_deadlines.delete",
      firmId,
      userId: session.id,
      entityType: "matter_deadline",
      entityId: id,
      metadata: {
        matterId: existing.matterId,
        title: existing.title,
        calendarEventId: existing.calendarEventId,
      },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk({ deleted: true });
  } catch (err) {
    return jsonError(err);
  }
}
