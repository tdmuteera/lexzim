import { AuthError } from "@/lib/auth/types";
import type { CalendarEventType } from "@/lib/db/ops-types";

export const CALENDAR_EVENT_TYPES: CalendarEventType[] = [
  "hearing",
  "appointment",
  "filing",
  "deadline",
  "other",
];

export const CALENDAR_VISIBILITIES = ["private", "firm", "people"] as const;
export type CalendarVisibility = (typeof CALENDAR_VISIBILITIES)[number];

export type CalendarEventInput = {
  matterId: string | null;
  clientId: string | null;
  eventType: CalendarEventType;
  title: string;
  description: string | null;
  location: string;
  startsAt: Date;
  endsAt: Date | null;
  allDay: boolean;
  visibility: CalendarVisibility;
  sharedUserIds: string[];
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

export function isCalendarVisibility(value: unknown): value is CalendarVisibility {
  return typeof value === "string" && (CALENDAR_VISIBILITIES as readonly string[]).includes(value);
}

/** Default calendar colour shown in UI until the user saves a personal choice. */
export const DEFAULT_CALENDAR_COLOR = "#2F6FED";

/** Persistable hex colour for users.calendar_color (e.g. #2F6FED). */
export function parseCalendarColor(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new AuthError("validation", "Calendar colour is required.");
  }
  const colour = value.trim();
  if (!/^#[0-9A-Fa-f]{6}$/.test(colour)) {
    throw new AuthError("validation", "Calendar colour must be a hex value like #2F6FED.");
  }
  return colour.toUpperCase();
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

  const location = typeof raw.location === "string" ? raw.location.trim() : "";
  if (!location) {
    throw new AuthError("validation", "Location is required.");
  }
  if (location.length > 300) {
    throw new AuthError("validation", "Location must be 300 characters or fewer.");
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

  let visibility: CalendarVisibility = "private";
  if (raw.visibility != null && raw.visibility !== "") {
    if (!isCalendarVisibility(raw.visibility)) {
      throw new AuthError("validation", "Visibility must be private, firm, or people.");
    }
    visibility = raw.visibility;
  }

  const sharedUserIds: string[] = [];
  if (Array.isArray(raw.sharedUserIds)) {
    for (const id of raw.sharedUserIds) {
      if (typeof id !== "string" || !id.trim()) {
        throw new AuthError("validation", "sharedUserIds must be an array of user ids.");
      }
      const trimmed = id.trim();
      if (!sharedUserIds.includes(trimmed)) sharedUserIds.push(trimmed);
    }
  }

  if (visibility === "people" && sharedUserIds.length === 0) {
    throw new AuthError(
      "validation",
      "Select at least one person when visibility is Specific people.",
    );
  }
  if (visibility !== "people") {
    sharedUserIds.length = 0;
  }

  return {
    matterId,
    clientId,
    eventType: raw.eventType,
    title,
    description: trimOrNull(raw.description),
    location,
    startsAt,
    endsAt,
    allDay: Boolean(raw.allDay),
    visibility,
    sharedUserIds,
  };
}
