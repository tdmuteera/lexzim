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

export const CALENDAR_RECURRENCE_RULES = ["weekly", "monthly"] as const;
export type CalendarRecurrenceRule = (typeof CALENDAR_RECURRENCE_RULES)[number];

export type CalendarGuestInput = {
  email: string;
  displayName: string | null;
  source: "client" | "external";
  notify: boolean;
};

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
  notifyClient?: boolean;
  guests?: CalendarGuestInput[];
  recurrenceRule?: CalendarRecurrenceRule | null;
  recurrenceUntil?: Date | null;
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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseEmail(value: string, label: string): string {
  const email = value.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    throw new AuthError("validation", `${label} is not a valid email.`);
  }
  return email;
}

export function isCalendarEventType(value: unknown): value is CalendarEventType {
  return typeof value === "string" && CALENDAR_EVENT_TYPES.includes(value as CalendarEventType);
}

export function isCalendarVisibility(value: unknown): value is CalendarVisibility {
  return typeof value === "string" && (CALENDAR_VISIBILITIES as readonly string[]).includes(value);
}

export function isCalendarRecurrenceRule(value: unknown): value is CalendarRecurrenceRule {
  return (
    typeof value === "string" &&
    (CALENDAR_RECURRENCE_RULES as readonly string[]).includes(value)
  );
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

  const notifyClient = Boolean(raw.notifyClient);

  const guests: CalendarGuestInput[] = [];
  if (Array.isArray(raw.guests)) {
    for (const item of raw.guests) {
      if (!item || typeof item !== "object") continue;
      const g = item as Record<string, unknown>;
      const emailRaw = typeof g.email === "string" ? g.email : "";
      if (!emailRaw.trim()) continue;
      const email = parseEmail(emailRaw, "Guest email");
      if (guests.some((x) => x.email === email)) continue;
      const source = g.source === "client" ? "client" : "external";
      guests.push({
        email,
        displayName: trimOrNull(g.displayName),
        source,
        notify: g.notify === false ? false : true,
      });
    }
  }
  if (guests.length > 20) {
    throw new AuthError("validation", "At most 20 guest emails per event.");
  }

  let recurrenceRule: CalendarRecurrenceRule | null = null;
  if (raw.recurrenceRule != null && raw.recurrenceRule !== "" && raw.recurrenceRule !== "none") {
    if (!isCalendarRecurrenceRule(raw.recurrenceRule)) {
      throw new AuthError("validation", "Recurrence must be weekly or monthly.");
    }
    recurrenceRule = raw.recurrenceRule;
  }

  let recurrenceUntil: Date | null = null;
  if (recurrenceRule) {
    if (raw.recurrenceUntil != null && raw.recurrenceUntil !== "") {
      recurrenceUntil = parseDate(raw.recurrenceUntil, "Recurrence end");
      if (recurrenceUntil < startsAt) {
        throw new AuthError("validation", "Recurrence end must be on or after the start.");
      }
    } else {
      // Default: 8 weeks or 6 months ahead.
      const until = new Date(startsAt);
      if (recurrenceRule === "weekly") until.setDate(until.getDate() + 7 * 8);
      else until.setMonth(until.getMonth() + 6);
      recurrenceUntil = until;
    }
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
    notifyClient,
    guests,
    recurrenceRule,
    recurrenceUntil,
  };
}

export function parsePostponeInput(body: unknown): {
  startsAt: Date;
  endsAt: Date | null;
  allDay: boolean;
} {
  if (!body || typeof body !== "object") {
    throw new AuthError("validation", "Invalid postpone payload.");
  }
  const raw = body as Record<string, unknown>;
  const startsAt = parseDate(raw.startsAt, "New start time");
  let endsAt: Date | null = null;
  if (raw.endsAt != null && raw.endsAt !== "") {
    endsAt = parseDate(raw.endsAt, "New end time");
    if (endsAt < startsAt) {
      throw new AuthError("validation", "End time must be on or after start time.");
    }
  }
  return {
    startsAt,
    endsAt,
    allDay: Boolean(raw.allDay),
  };
}
