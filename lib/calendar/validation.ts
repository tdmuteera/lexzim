import { AuthError } from "@/lib/auth/types";
import type { CalendarEventType } from "@/lib/db/ops-types";

export const CALENDAR_EVENT_TYPES: CalendarEventType[] = [
  "hearing",
  "appointment",
  "filing",
  "deadline",
  "other",
];

export type CalendarEventInput = {
  matterId: string | null;
  clientId: string | null;
  eventType: CalendarEventType;
  title: string;
  description: string | null;
  location: string | null;
  startsAt: Date;
  endsAt: Date | null;
  allDay: boolean;
};

function trimOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function parseDate(value: unknown, label: string): Date {
  if (typeof value !== "string" || !value.trim()) {
    throw new AuthError("validation", `${label} is required.`);
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new AuthError("validation", `${label} is invalid.`);
  }
  return d;
}

export function isCalendarEventType(value: unknown): value is CalendarEventType {
  return typeof value === "string" && CALENDAR_EVENT_TYPES.includes(value as CalendarEventType);
}

export function parseCalendarEventInput(body: unknown): CalendarEventInput {
  if (!body || typeof body !== "object") {
    throw new AuthError("validation", "Invalid calendar event payload.");
  }
  const raw = body as Record<string, unknown>;

  if (!isCalendarEventType(raw.eventType)) {
    throw new AuthError(
      "validation",
      "Event type must be hearing, appointment, filing, deadline, or other.",
    );
  }

  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  if (!title) {
    throw new AuthError("validation", "Title is required.");
  }
  if (title.length > 200) {
    throw new AuthError("validation", "Title must be 200 characters or fewer.");
  }

  const startsAt = parseDate(raw.startsAt, "Start time");
  let endsAt: Date | null = null;
  if (raw.endsAt != null && raw.endsAt !== "") {
    endsAt = parseDate(raw.endsAt, "End time");
    if (endsAt < startsAt) {
      throw new AuthError("validation", "End time must be on or after start time.");
    }
  }

  const matterRaw = raw.matterId;
  let matterId: string | null = null;
  if (typeof matterRaw === "string" && matterRaw.trim()) {
    matterId = matterRaw.trim();
  }

  const clientRaw = raw.clientId;
  let clientId: string | null = null;
  if (typeof clientRaw === "string" && clientRaw.trim()) {
    clientId = clientRaw.trim();
  }

  if (raw.eventType === "appointment" && !clientId && !matterId) {
    throw new AuthError(
      "validation",
      "Client is required for a client meeting (or link a matter with a client).",
    );
  }

  return {
    matterId,
    clientId,
    eventType: raw.eventType,
    title,
    description: trimOrNull(raw.description),
    location: trimOrNull(raw.location),
    startsAt,
    endsAt,
    allDay: Boolean(raw.allDay),
  };
}
