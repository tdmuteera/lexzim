import { AuthError } from "@/lib/auth/types";
import type { CalendarEventType, MatterDeadlineStatus } from "@/lib/db/ops-types";

export const DEADLINE_TEMPLATE_EVENT_TYPES = ["filing", "deadline", "hearing", "other"] as const;

export type DeadlineTemplateEventType = (typeof DEADLINE_TEMPLATE_EVENT_TYPES)[number];

export type DeadlineTemplateInput = {
  name: string;
  areaOfLaw: string | null;
  description: string | null;
  offsetDays: number;
  defaultEventType: DeadlineTemplateEventType;
  isActive: boolean;
};

export type ApplyDeadlineInput = {
  templateId: string;
  triggerDate: Date;
  createCalendarEvent: boolean;
  notes: string | null;
  titleOverride: string | null;
};

export type MatterDeadlineStatusUpdate = {
  status: MatterDeadlineStatus;
  notes?: string | null;
};

function trimOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function parseDateOnlyOrDateTime(value: unknown, label: string): Date {
  if (typeof value !== "string" || !value.trim()) {
    throw new AuthError("validation", `${label} is required.`);
  }
  const raw = value.trim();
  // Date-only YYYY-MM-DD → local noon to avoid timezone day shifts for calendar-day math.
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [y, m, d] = raw.split("-").map(Number);
    return new Date(y, m - 1, d, 12, 0, 0, 0);
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new AuthError("validation", `${label} is invalid.`);
  }
  return parsed;
}

/** Add whole calendar days (not business days). */
export function addCalendarDays(trigger: Date, offsetDays: number): Date {
  const due = new Date(trigger);
  due.setDate(due.getDate() + offsetDays);
  return due;
}

export function isDeadlineTemplateEventType(
  value: unknown,
): value is DeadlineTemplateEventType {
  return (
    typeof value === "string" &&
    (DEADLINE_TEMPLATE_EVENT_TYPES as readonly string[]).includes(value)
  );
}

export function parseDeadlineTemplateInput(body: unknown): DeadlineTemplateInput {
  if (!body || typeof body !== "object") {
    throw new AuthError("validation", "Invalid deadline template payload.");
  }
  const raw = body as Record<string, unknown>;
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!name) {
    throw new AuthError("validation", "Name is required.");
  }
  if (name.length > 200) {
    throw new AuthError("validation", "Name must be 200 characters or fewer.");
  }

  const offsetRaw = raw.offsetDays;
  const offsetDays =
    typeof offsetRaw === "number"
      ? offsetRaw
      : typeof offsetRaw === "string"
        ? Number(offsetRaw)
        : NaN;
  if (!Number.isInteger(offsetDays) || offsetDays < -3650 || offsetDays > 3650) {
    throw new AuthError("validation", "Offset days must be an integer between -3650 and 3650.");
  }

  const defaultEventType = isDeadlineTemplateEventType(raw.defaultEventType)
    ? raw.defaultEventType
    : "filing";

  return {
    name,
    areaOfLaw: trimOrNull(raw.areaOfLaw),
    description: trimOrNull(raw.description),
    offsetDays,
    defaultEventType,
    isActive: raw.isActive === undefined ? true : Boolean(raw.isActive),
  };
}

export function parseApplyDeadlineInput(body: unknown): ApplyDeadlineInput {
  if (!body || typeof body !== "object") {
    throw new AuthError("validation", "Invalid apply-deadline payload.");
  }
  const raw = body as Record<string, unknown>;
  const templateId = typeof raw.templateId === "string" ? raw.templateId.trim() : "";
  if (!templateId) {
    throw new AuthError("validation", "Template is required.");
  }

  return {
    templateId,
    triggerDate: parseDateOnlyOrDateTime(raw.triggerDate, "Trigger date"),
    createCalendarEvent: raw.createCalendarEvent === false ? false : true,
    notes: trimOrNull(raw.notes),
    titleOverride: trimOrNull(raw.titleOverride),
  };
}

export function parseMatterDeadlineStatusUpdate(body: unknown): MatterDeadlineStatusUpdate {
  if (!body || typeof body !== "object") {
    throw new AuthError("validation", "Invalid deadline update payload.");
  }
  const raw = body as Record<string, unknown>;
  const status = raw.status;
  if (status !== "open" && status !== "done" && status !== "cancelled") {
    throw new AuthError("validation", "Status must be open, done, or cancelled.");
  }
  const update: MatterDeadlineStatusUpdate = { status };
  if ("notes" in raw) {
    update.notes = trimOrNull(raw.notes);
  }
  return update;
}

export function toCalendarEventType(value: string): CalendarEventType {
  if (
    value === "hearing" ||
    value === "appointment" ||
    value === "filing" ||
    value === "deadline" ||
    value === "other"
  ) {
    return value;
  }
  return "filing";
}
