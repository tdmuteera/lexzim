import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { serializeCalendarEventRow } from "@/lib/calendar/serialize";
import { parsePostponeInput } from "@/lib/calendar/validation";
import {
  canEditCalendarEvent,
  getCalendarEvent,
  postponeCalendarEvent,
} from "@/lib/repos/calendar";
import { hasPermission, requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("calendar.manage");
    const firmId = tenantFirmId(session);
    const canManage = hasPermission(session, "calendar.manage");
    const { id } = await context.params;
    const body = await request.json();
    const input = parsePostponeInput(body);

    const existing = await getCalendarEvent(firmId, id);
    if (!existing) {
      throw new AuthError("not_found", "Calendar event not found.");
    }

    const sharedUserIds = existing.sharedUserIds ?? [];
    if (
      !canEditCalendarEvent(existing.event, session.id, {
        canManage,
        sharedUserIds,
      })
    ) {
      throw new AuthError("forbidden", "You cannot postpone this calendar event.");
    }

    const previousStartsAt = existing.event.startsAt;
    const full = await postponeCalendarEvent(firmId, id, input);
    if (!full) {
      throw new AuthError("not_found", "Calendar event not found.");
    }

    await writeAuditLog({
      action: "calendar.postpone",
      firmId,
      userId: session.id,
      entityType: "calendar_event",
      entityId: id,
      metadata: {
        title: full.event.title,
        previousStartsAt: previousStartsAt.toISOString(),
        startsAt: full.event.startsAt.toISOString(),
        endsAt: full.event.endsAt ? full.event.endsAt.toISOString() : null,
      },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk({
      event: serializeCalendarEventRow({
        ...full,
        canEdit: true,
      }),
    });
  } catch (err) {
    return jsonError(err, request);
  }
}
