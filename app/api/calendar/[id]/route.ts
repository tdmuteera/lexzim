import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { syncMeetingRemindersForFirm } from "@/lib/calendar/meeting-notifications";
import { resolveCalendarClientId } from "@/lib/calendar/resolve-client";
import { serializeCalendarEventRow } from "@/lib/calendar/serialize";
import { parseCalendarEventInput } from "@/lib/calendar/validation";
import {
  assertSharedUsersInFirm,
  canEditCalendarEvent,
  canViewCalendarEvent,
  deleteCalendarEvent,
  getCalendarEvent,
  updateCalendarEvent,
} from "@/lib/repos/calendar";
import { canViewAllMatters, hasPermission, requirePermission } from "@/lib/rbac/guards";
import { userCanAccessMatter } from "@/lib/repos/matters";
import { tenantFirmId } from "@/lib/tenant/scope";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("calendar.view");
    const firmId = tenantFirmId(session);
    const canManage = hasPermission(session, "calendar.manage");
    const { id } = await context.params;

    const full = await getCalendarEvent(firmId, id);
    if (!full) {
      throw new AuthError("not_found", "Calendar event not found.");
    }

    const sharedUserIds = full.sharedUserIds ?? [];
    if (!canViewCalendarEvent(full.event, session.id, sharedUserIds)) {
      throw new AuthError("not_found", "Calendar event not found.");
    }

    return jsonOk({
      event: serializeCalendarEventRow({
        ...full,
        canEdit: canEditCalendarEvent(full.event, session.id, {
          canManage,
          sharedUserIds,
        }),
      }),
    });
  } catch (err) {
    return jsonError(err, request);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("calendar.manage");
    const firmId = tenantFirmId(session);
    const viewAll = canViewAllMatters(session);
    const canManage = hasPermission(session, "calendar.manage");
    const { id } = await context.params;
    const body = await request.json();
    const parsed = parseCalendarEventInput(body);
    const input = await resolveCalendarClientId(firmId, parsed);

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
      throw new AuthError("forbidden", "You cannot edit this calendar event.");
    }

    if (input.matterId) {
      const allowed = await userCanAccessMatter(
        firmId,
        input.matterId,
        session.id,
        viewAll,
      );
      if (!allowed) {
        throw new AuthError("forbidden", "You do not have access to this matter.");
      }
    }

    if (input.visibility === "people") {
      await assertSharedUsersInFirm(firmId, input.sharedUserIds);
    }

    const previousVisibility = existing.event.visibility;
    const row = await updateCalendarEvent(firmId, id, input);
    if (!row) {
      throw new AuthError("not_found", "Calendar event not found.");
    }

    const full = await getCalendarEvent(firmId, row.id);

    if (row.eventType === "appointment") {
      void syncMeetingRemindersForFirm(firmId).catch(() => undefined);
    }

    const visibilityChanged = previousVisibility !== row.visibility;
    await writeAuditLog({
      action: visibilityChanged ? "calendar.visibility_change" : "calendar.update",
      firmId,
      userId: session.id,
      entityType: "calendar_event",
      entityId: row.id,
      metadata: {
        eventType: row.eventType,
        title: row.title,
        matterId: row.matterId,
        clientId: row.clientId,
        startsAt: row.startsAt.toISOString(),
        visibility: row.visibility,
        previousVisibility,
        sharedUserIds: input.sharedUserIds,
      },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk({
      event: full
        ? serializeCalendarEventRow({
            ...full,
            canEdit: true,
          })
        : serializeCalendarEventRow({ event: row, canEdit: true }),
    });
  } catch (err) {
    return jsonError(err, request);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("calendar.manage");
    const firmId = tenantFirmId(session);
    const canManage = hasPermission(session, "calendar.manage");
    const { id } = await context.params;

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
      throw new AuthError("forbidden", "You cannot delete this calendar event.");
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
        visibility: existing.event.visibility,
      },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk({ deleted: true });
  } catch (err) {
    return jsonError(err, request);
  }
}
