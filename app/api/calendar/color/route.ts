import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { parseCalendarColor, DEFAULT_CALENDAR_COLOR } from "@/lib/calendar/validation";
import { getUserCalendarColor, setUserCalendarColor } from "@/lib/repos/calendar";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

/** GET /api/calendar/color — current user's persistent calendar colour. */
export async function GET(request: Request) {
  try {
    const session = await requirePermission("calendar.view");
    const firmId = tenantFirmId(session);
    const myCalendarColor = await getUserCalendarColor(firmId, session.id);
    return jsonOk({ myCalendarColor: myCalendarColor ?? DEFAULT_CALENDAR_COLOR });
  } catch (err) {
    return jsonError(err, request);
  }
}

/** PATCH /api/calendar/color — set current user's calendar colour. */
export async function PATCH(request: Request) {
  try {
    const session = await requirePermission("calendar.view");
    const firmId = tenantFirmId(session);
    const body = await request.json();
    const colour = parseCalendarColor(
      body && typeof body === "object"
        ? (body as Record<string, unknown>).calendarColor ??
            (body as Record<string, unknown>).colour ??
            (body as Record<string, unknown>).color
        : null,
    );
    const myCalendarColor = await setUserCalendarColor(firmId, session.id, colour);

    await writeAuditLog({
      action: "calendar.color_update",
      firmId,
      userId: session.id,
      entityType: "user",
      entityId: session.id,
      metadata: { calendarColor: myCalendarColor },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk({ myCalendarColor });
  } catch (err) {
    return jsonError(err, request);
  }
}
