import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { serializeCalendarEvent } from "@/lib/calendar/serialize";
import { parseCalendarEventInput } from "@/lib/calendar/validation";
import {
  deleteCalendarEvent,
  getCalendarEvent,
  updateCalendarEvent,
} from "@/lib/repos/calendar";
import { getMatterById } from "@/lib/repos/matters";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("calendar.view");
    const firmId = tenantFirmId(session);
    const { id } = await context.params;

    const full = await getCalendarEvent(firmId, id);
    if (!full) {
      throw new AuthError("not_found", "Calendar event not found.");
    }

    return jsonOk({
      event: serializeCalendarEvent(full.event, {
        matterNumber: full.matterNumber,
        title: full.matterTitle,
      }),
    });
  } catch (err) {
    return jsonError(err);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("calendar.manage");
    const firmId = tenantFirmId(session);
    const { id } = await context.params;
    const body = await request.json();
    const input = parseCalendarEventInput(body);

    const existing = await getCalendarEvent(firmId, id);
    if (!existing) {
      throw new AuthError("not_found", "Calendar event not found.");
    }

    if (input.matterId) {
      const matter = await getMatterById(firmId, input.matterId);
      if (!matter) {
        throw new AuthError("validation", "Matter not found for this firm.");
      }
    }

    const row = await updateCalendarEvent(firmId, id, input);
    if (!row) {
      throw new AuthError("not_found", "Calendar event not found.");
    }

    const full = await getCalendarEvent(firmId, row.id);

    await writeAuditLog({
      action: "calendar.update",
      firmId,
      userId: session.id,
      entityType: "calendar_event",
      entityId: row.id,
      metadata: {
        eventType: row.eventType,
        title: row.title,
        matterId: row.matterId,
        startsAt: row.startsAt.toISOString(),
      },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk({
      event: full
        ? serializeCalendarEvent(full.event, {
            matterNumber: full.matterNumber,
            title: full.matterTitle,
          })
        : serializeCalendarEvent(row),
    });
  } catch (err) {
    return jsonError(err);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("calendar.manage");
    const firmId = tenantFirmId(session);
    const { id } = await context.params;

    const existing = await getCalendarEvent(firmId, id);
    if (!existing) {
      throw new AuthError("not_found", "Calendar event not found.");
    }

    const deleted = await deleteCalendarEvent(firmId, id);
    if (!deleted) {
      throw new AuthError("not_found", "Calendar event not found.");
    }

    await writeAuditLog({
      action: "calendar.delete",
      firmId,
      userId: session.id,
      entityType: "calendar_event",
      entityId: id,
      metadata: {
        eventType: existing.event.eventType,
        title: existing.event.title,
        matterId: existing.event.matterId,
      },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk({ deleted: true });
  } catch (err) {
    return jsonError(err);
  }
}
