import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import {
  countFirmTasks,
  createFirmTask,
  getFirmTask,
  listFirmTasks,
  serializeFirmTask,
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

/**
 * GET /api/workflow/tasks?scope=mine|assigned_by_me|completed|all&counts=1
 * POST /api/workflow/tasks
 */
export async function GET(request: Request) {
  try {
    const session = await requirePermission("dashboard.view");
    const firmId = tenantFirmId(session);
    const url = new URL(request.url);
    const scope = url.searchParams.get("scope")?.trim() || "mine";
    const wantCounts = url.searchParams.get("counts") === "1";

    let rows;
    if (scope === "mine") {
      rows = await listFirmTasks(firmId, {
        mineUserId: session.id,
        status: "pending",
      });
    } else if (scope === "assigned_by_me") {
      rows = await listFirmTasks(firmId, {
        assignedByUserId: session.id,
        status: "pending",
      });
    } else if (scope === "completed") {
      rows = await listFirmTasks(firmId, { status: "done" });
      rows = rows.filter(
        (r) =>
          r.task.assigneeUserId === session.id ||
          r.task.assignerUserId === session.id,
      );
    } else if (scope === "all") {
      rows = await listFirmTasks(firmId);
    } else {
      throw new AuthError("validation", "Invalid scope.");
    }

    const payload: {
      items: ReturnType<typeof serializeFirmTask>[];
      counts?: Awaited<ReturnType<typeof countFirmTasks>>;
    } = {
      items: rows.map((r) => serializeFirmTask(r)),
    };
    if (wantCounts) {
      payload.counts = await countFirmTasks(firmId, session.id);
    }
    return jsonOk(payload);
  } catch (err) {
    return jsonError(err, request);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requirePermission("dashboard.view");
    const firmId = tenantFirmId(session);
    const body = (await request.json()) as {
      title?: string;
      description?: string | null;
      assigneeUserId?: string;
      dueAt?: string | null;
      priority?: string;
    };

    if (!body.title?.trim()) {
      throw new AuthError("validation", "Title is required.");
    }
    if (!body.assigneeUserId?.trim()) {
      throw new AuthError("validation", "Assignee is required.");
    }

    const created = await createFirmTask(firmId, session.id, {
      title: body.title,
      description: body.description,
      assigneeUserId: body.assigneeUserId,
      dueAt: parseDueAt(body.dueAt) ?? null,
      priority: body.priority,
    });

    await writeAuditLog({
      action: "tasks.create",
      firmId,
      userId: session.id,
      entityType: "firm_task",
      entityId: created.task.id,
      metadata: {
        assigneeUserId: created.task.assigneeUserId,
        priority: created.task.priority,
      },
      ipOrUserAgent: clientInfo(request),
    });

    const full = await getFirmTask(firmId, created.task.id);
    return jsonOk(
      { task: full ? serializeFirmTask(full) : null },
      { status: 201 },
    );
  } catch (err) {
    return jsonError(err, request);
  }
}
