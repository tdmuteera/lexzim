import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import {
  completeFirmTask,
  getFirmTask,
  reopenFirmTask,
  serializeFirmTask,
  updateFirmTask,
} from "@/lib/repos/firm-tasks";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

function parseDueAt(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) {
    throw new AuthError("validation", "Invalid due date.");
  }
  return d;
}

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/workflow/tasks/[id]
 * PATCH /api/workflow/tasks/[id] — complete | reopen | update pending fields
 */
export async function GET(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("dashboard.view");
    const firmId = tenantFirmId(session);
    const { id } = await context.params;
    const full = await getFirmTask(firmId, id);
    if (!full) {
      throw new AuthError("not_found", "Task not found.");
    }
    return jsonOk({ task: serializeFirmTask(full) });
  } catch (err) {
    return jsonError(err, request);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("dashboard.view");
    const firmId = tenantFirmId(session);
    const { id } = await context.params;
    const body = (await request.json()) as {
      action?: string;
      feedback?: string | null;
      title?: string;
      description?: string | null;
      assigneeUserId?: string;
      dueAt?: string | null;
      priority?: string;
    };

    const action = body.action?.trim() || "update";

    if (action === "complete") {
      const full = await completeFirmTask(firmId, id, session.id, body.feedback);
      await writeAuditLog({
        action: "tasks.complete",
        firmId,
        userId: session.id,
        entityType: "firm_task",
        entityId: id,
        metadata: { hasFeedback: Boolean(body.feedback?.trim()) },
        ipOrUserAgent: clientInfo(request),
      });
      return jsonOk({ task: full ? serializeFirmTask(full) : null });
    }

    if (action === "reopen") {
      const full = await reopenFirmTask(firmId, id, session.id);
      return jsonOk({ task: full ? serializeFirmTask(full) : null });
    }

    if (action === "update") {
      const full = await updateFirmTask(firmId, id, session.id, {
        title: body.title,
        description: body.description,
        assigneeUserId: body.assigneeUserId,
        dueAt: parseDueAt(body.dueAt),
        priority: body.priority,
      });
      return jsonOk({ task: full ? serializeFirmTask(full) : null });
    }

    throw new AuthError("validation", "Unknown action.");
  } catch (err) {
    return jsonError(err, request);
  }
}
