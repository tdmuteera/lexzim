import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { parseToday } from "@/lib/my-day/validation";
import { createCalendarEvent } from "@/lib/repos/calendar";
import { userCanAccessMatter } from "@/lib/repos/matters";
import { getMyDayItem, getMyDayItemDto, markMyDayItemMoved } from "@/lib/repos/my-day";
import { canViewAllMatters, requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

type Ctx = { params: Promise<{ id: string }> };

function parseInstant(value: unknown, label: string): Date {
  const d = typeof value === "string" ? new Date(value) : new Date(NaN);
  if (Number.isNaN(d.getTime())) throw new AuthError("validation", `${label} is invalid.`);
  return d;
}

/**
 * POST /api/my-day/[id]/calendar — promote a to-do into a private calendar event
 * (which then follows normal calendar reminders). Body: startsAt, endsAt, allDay.
 */
export async function POST(request: Request, ctx: Ctx) {
  try {
    const session = await requirePermission("calendar.manage");
    const firmId = tenantFirmId(session);
    const { id } = await ctx.params;
    const body = (await request.json()) as Record<string, unknown>;
    const today = parseToday(body.today);

    const item = await getMyDayItem(firmId, session.id, id);
    if (!item) throw new AuthError("not_found", "Item not found.");
    if (item.calendarEventId) {
      throw new AuthError("validation", "This item is already on the calendar.");
    }

    const allDay = body.allDay === true;
    const startsAt = parseInstant(body.startsAt, "Start");
    const endsAt = body.endsAt ? parseInstant(body.endsAt, "End") : null;
    if (endsAt && endsAt < startsAt) throw new AuthError("validation", "End is before start.");

    let matterId = item.matterId;
    if (matterId) {
      const allowed = await userCanAccessMatter(
        firmId,
        matterId,
        session.id,
        canViewAllMatters(session),
      );
      if (!allowed) matterId = null;
    }

    const event = await createCalendarEvent(firmId, session.id, {
      matterId,
      clientId: item.clientId,
      eventType: "other",
      title: item.title,
      description: item.notes,
      location: "",
      startsAt,
      endsAt,
      allDay,
      visibility: "private",
      sharedUserIds: [],
    });

    await markMyDayItemMoved(firmId, session.id, id, event.id, today);

    await writeAuditLog({
      action: "calendar.create",
      firmId,
      userId: session.id,
      entityType: "calendar_event",
      entityId: event.id,
      metadata: { source: "my_day", startsAt: startsAt.toISOString(), visibility: "private" },
      ipOrUserAgent: clientInfo(request),
    }).catch(() => undefined);

    return jsonOk({ item: await getMyDayItemDto(firmId, session.id, id), eventId: event.id });
  } catch (err) {
    return jsonError(err, request);
  }
}
