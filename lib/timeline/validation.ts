import { AuthError } from "@/lib/auth/types";

/** User-authored communication / file note types. */
export const USER_EVENT_TYPES = ["note", "call", "email", "meeting"] as const;
export type UserEventType = (typeof USER_EVENT_TYPES)[number];

/** Includes system-generated types already written by other modules. */
export const ALL_EVENT_TYPES = [
  ...USER_EVENT_TYPES,
  "system",
  "status_change",
  "procedure",
  "document",
] as const;

export type TimelineNoteInput = {
  eventType: UserEventType;
  title: string;
  body?: string | null;
  eventAt?: string | null;
};

function trimOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function requireString(value: unknown, label: string): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) throw new AuthError("validation", `${label} is required.`);
  return trimmed;
}

export function parseTimelineNoteInput(body: unknown): TimelineNoteInput {
  if (!body || typeof body !== "object") {
    throw new AuthError("validation", "Invalid timeline payload.");
  }
  const raw = body as Record<string, unknown>;
  const eventType = raw.eventType;
  if (!USER_EVENT_TYPES.includes(eventType as UserEventType)) {
    throw new AuthError(
      "validation",
      "Event type must be note, call, email, or meeting.",
    );
  }

  const eventAt = trimOrNull(raw.eventAt);
  if (eventAt && Number.isNaN(Date.parse(eventAt))) {
    throw new AuthError("validation", "Event date is invalid.");
  }

  return {
    eventType: eventType as UserEventType,
    title: requireString(raw.title, "Title"),
    body: trimOrNull(raw.body),
    eventAt,
  };
}

export function eventTypeLabel(eventType: string): string {
  switch (eventType) {
    case "note":
      return "Note";
    case "call":
      return "Call";
    case "email":
      return "Email";
    case "meeting":
      return "Meeting";
    case "system":
      return "System";
    case "status_change":
      return "Status";
    case "procedure":
      return "Procedure";
    case "document":
      return "Document";
    default:
      return eventType;
  }
}
