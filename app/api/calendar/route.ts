import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { serializeCalendarEvent } from "@/lib/calendar/serialize";
import {
  isCalendarEventType,
  parseCalendarEventInput,
} from "@/lib/calendar/validation";
import {
  createCalendarEvent,
  getCalendarEvent,
  listCalendarEvents,
} from "@/lib/repos/calendar";
import { getMatterById } from "@/lib/repos/matters";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

function parseOptionalDate(value: string | null, label: string): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new AuthError("validation", `${label} is invalid.`);
  }
  return d;
}

export async function GET(request: Request) {
  try {
    const session = await requirePermission("calendar.view");
    const firmId = tenantFirmId(session);
    const url = new URL(request.url);
    const from = parseOptionalDate(url.searchParams.get("from"), "from");
    const to = parseOptionalDate(url.searchParams.get("to"), "to");
    const eventTypeRaw = url.searchParams.get("eventType");
    const eventType =
      eventTypeRaw && isCalendarEventType(eventTypeRaw) ? eventTypeRaw : undefined;
    const matterId = url.searchParams.get("matterId")?.trim() || undefined;

    const rows = await listCalendarEvents(firmId, { from, to, eventType, matterId });

    return jsonOk({
      items: rows.map((r) =>
        serializeCalendarEvent(r.event, {
          matterNumber: r.matterNumber,
          title: r.matterTitle,
        }),
      ),
    });
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requirePermission("calendar.manage");
    const firmId = tenantFirmId(session);
    const body = await request.json();
    const input = parseCalendarEventInput(body);

    if (input.matterId) {
      const matter = await getMatterById(firmId, input.matterId);
      if (!matter) {
        throw new AuthError("validation", "Matter not found for this firm.");
      }
    }

    const row = await createCalendarEvent(firmId, session.id, input);
    const full = await getCalendarEvent(firmId, row.id);

    await writeAuditLog({
      action: "calendar.create",
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

    return jsonOk(
      {
        event: full
          ? serializeCalendarEvent(full.event, {
              matterNumber: full.matterNumber,
              title: full.matterTitle,
            })
          : serializeCalendarEvent(row),
      },
      { status: 201 },
    );
  } catch (err) {
    return jsonError(err);
  }
}
