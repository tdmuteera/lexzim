import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { serializeCalendarEventRow } from "@/lib/calendar/serialize";
import { syncMeetingRemindersForFirm } from "@/lib/calendar/meeting-notifications";
import { resolveCalendarClientId } from "@/lib/calendar/resolve-client";
import {
  isCalendarEventType,
  parseCalendarEventInput,
  DEFAULT_CALENDAR_COLOR,
} from "@/lib/calendar/validation";
import {
  assertSharedUsersInFirm,
  canEditCalendarEvent,
  createCalendarEvent,
  getCalendarEvent,
  getUserCalendarColor,
  listCalendarEvents,
  type CalendarListScope,
} from "@/lib/repos/calendar";
import { userCanAccessMatter } from "@/lib/repos/matters";
import { canViewAllMatters, hasPermission, requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

function parseOptionalDate(value: string | null, label: string): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new AuthError("validation", `${label} is invalid.`);
  }
  return d;
}

function parseScope(value: string | null): CalendarListScope {
  if (value === "firm" || value === "shared" || value === "mine") return value;
  return "mine";
}

export async function GET(request: Request) {
  try {
    const session = await requirePermission("calendar.view");
    const firmId = tenantFirmId(session);
    const viewAll = canViewAllMatters(session);
    const canManage = hasPermission(session, "calendar.manage");
    const url = new URL(request.url);
    const from = parseOptionalDate(url.searchParams.get("from"), "from");
    const to = parseOptionalDate(url.searchParams.get("to"), "to");
    const eventTypeRaw = url.searchParams.get("eventType");
    const eventType =
      eventTypeRaw && isCalendarEventType(eventTypeRaw) ? eventTypeRaw : undefined;
    const matterId = url.searchParams.get("matterId")?.trim() || undefined;
    const scope = parseScope(url.searchParams.get("scope"));

    if (matterId) {
      const allowed = await userCanAccessMatter(
        firmId,
        matterId,
        session.id,
        viewAll,
      );
      if (!allowed) {
        throw new AuthError("forbidden", "You do not have access to this matter.");
      }
    }

    const rows = await listCalendarEvents(firmId, {
      from,
      to,
      eventType,
      matterId,
      viewAll,
      userId: session.id,
      scope,
    });

    const myCalendarColor = await getUserCalendarColor(firmId, session.id);
    const effectiveMyColor = myCalendarColor ?? DEFAULT_CALENDAR_COLOR;

    void syncMeetingRemindersForFirm(firmId).catch(() => undefined);

    return jsonOk({
      items: rows.map((r) => {
        const creatorCalendarColor =
          r.creatorCalendarColor ??
          (r.event.createdBy === session.id ? effectiveMyColor : null);
        return serializeCalendarEventRow({
          ...r,
          creatorCalendarColor,
          canEdit: canEditCalendarEvent(r.event, session.id, {
            canManage,
            sharedUserIds: r.sharedUserIds ?? [],
          }),
        });
      }),
      myCalendarColor: effectiveMyColor,
    });
  } catch (err) {
    return jsonError(err, request);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requirePermission("calendar.manage");
    const firmId = tenantFirmId(session);
    const viewAll = canViewAllMatters(session);
    const body = await request.json();
    const parsed = parseCalendarEventInput(body);
    const input = await resolveCalendarClientId(firmId, parsed);

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

    const row = await createCalendarEvent(firmId, session.id, input);
    const full = await getCalendarEvent(firmId, row.id);
    const myColor =
      (await getUserCalendarColor(firmId, session.id)) ?? DEFAULT_CALENDAR_COLOR;

    if (row.eventType === "appointment") {
      void syncMeetingRemindersForFirm(firmId).catch(() => undefined);
    }

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
        visibility: row.visibility,
        sharedUserIds: input.sharedUserIds,
      },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk(
      {
        event: full
          ? serializeCalendarEventRow({
              ...full,
              creatorCalendarColor: full.creatorCalendarColor ?? myColor,
              canEdit: true,
            })
          : serializeCalendarEventRow({
              event: row,
              creatorCalendarColor: myColor,
              canEdit: true,
            }),
      },
      { status: 201 },
    );
  } catch (err) {
    return jsonError(err, request);
  }
}
