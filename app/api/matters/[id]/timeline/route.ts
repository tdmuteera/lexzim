import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { serializeMatterEvent } from "@/lib/timeline/serialize";
import { parseTimelineNoteInput } from "@/lib/timeline/validation";
import { getMatterById, userCanAccessMatter } from "@/lib/repos/matters";
import {
  createTimelineNote,
  getMatterEventById,
  listMatterEvents,
} from "@/lib/repos/timeline";
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

export async function GET(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("matters.view");
    const firmId = tenantFirmId(session);
    const { id: matterId } = await context.params;
    const viewAll = canViewAllMatters(session);
    await assertMatterAccess(firmId, matterId, session.id, viewAll);

    const url = new URL(request.url);
    const typeFilter = url.searchParams.get("type");
    const sortDir = url.searchParams.get("sortDir") === "asc" ? "asc" : "desc";
    const eventTypes = typeFilter
      ? typeFilter.split(",").map((t) => t.trim()).filter(Boolean)
      : undefined;

    const rows = await listMatterEvents(firmId, matterId, { eventTypes, sortDir });

    return jsonOk({
      items: rows.map((row) =>
        serializeMatterEvent(row, { createdByName: row.createdByName }),
      ),
    });
  } catch (err) {
    return jsonError(err, request);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("matters.edit");
    const firmId = tenantFirmId(session);
    const { id: matterId } = await context.params;
    const viewAll = canViewAllMatters(session);
    await assertMatterAccess(firmId, matterId, session.id, viewAll);

    const body = await request.json();
    const input = parseTimelineNoteInput(body);
    const row = await createTimelineNote(firmId, matterId, session.id, input);

    await writeAuditLog({
      action: "timeline.create",
      firmId,
      userId: session.id,
      entityType: "matter_event",
      entityId: row.id,
      metadata: {
        matterId,
        eventType: row.eventType,
        title: row.title,
      },
      ipOrUserAgent: clientInfo(request),
    });

    const full = await getMatterEventById(firmId, row.id);

    return jsonOk(
      {
        event: serializeMatterEvent(full ?? row, {
          createdByName: full?.createdByName,
        }),
      },
      { status: 201 },
    );
  } catch (err) {
    return jsonError(err, request);
  }
}
