import { AuthError } from "@/lib/auth/types";
import type { MyDayItemInput, MyDayRecurrenceInput } from "@/lib/repos/my-day";
import { addDays, isIsoDate, MY_DAY_RULES, MY_DAY_TAGS, type MyDayRule } from "@/lib/my-day/shared";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function trimOrNull(value: unknown, max: number, label: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new AuthError("validation", `${label} is invalid.`);
  const t = value.trim();
  if (t.length > max) throw new AuthError("validation", `${label} is too long.`);
  return t.length ? t : null;
}

function optionalUuid(value: unknown, label: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !UUID_RE.test(value)) {
    throw new AuthError("validation", `${label} is invalid.`);
  }
  return value;
}

/**
 * The browser sends its local calendar day so "today" follows the user, not the server.
 * Accept only dates within a day of server UTC to stop clients rewriting history.
 */
export function parseToday(value: unknown): string {
  const serverToday = new Date().toISOString().slice(0, 10);
  if (!isIsoDate(value)) return serverToday;
  if (value < addDays(serverToday, -1) || value > addDays(serverToday, 1)) return serverToday;
  return value;
}

export function parseDueDate(value: unknown, today: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (!isIsoDate(value)) throw new AuthError("validation", "Date must be YYYY-MM-DD.");
  if (value < today) throw new AuthError("validation", "Pick today or a future date.");
  return value;
}

function parseTag(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (!MY_DAY_TAGS.some((t) => t.code === value)) {
    throw new AuthError("validation", "Unknown tag.");
  }
  return value as string;
}

function parseTime(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !TIME_RE.test(value)) {
    throw new AuthError("validation", "Time must be HH:MM.");
  }
  return value;
}

export function parseItemInput(body: Record<string, unknown>, today: string): MyDayItemInput {
  const title = trimOrNull(body.title, 300, "Title");
  if (!title) throw new AuthError("validation", "Write what you need to do.");
  return {
    title,
    notes: trimOrNull(body.notes, 2000, "Notes"),
    dueDate: parseDueDate(body.dueDate, today),
    dueTime: parseTime(body.dueTime),
    tag: parseTag(body.tag),
    starred: body.starred === true,
    clientId: optionalUuid(body.clientId, "Client"),
    matterId: optionalUuid(body.matterId, "Matter"),
  };
}

export function parseItemPatch(
  body: Record<string, unknown>,
  today: string,
): Partial<MyDayItemInput> {
  const out: Partial<MyDayItemInput> = {};
  if ("title" in body) {
    const title = trimOrNull(body.title, 300, "Title");
    if (!title) throw new AuthError("validation", "Title cannot be empty.");
    out.title = title;
  }
  if ("notes" in body) out.notes = trimOrNull(body.notes, 2000, "Notes");
  if ("dueDate" in body) out.dueDate = parseDueDate(body.dueDate, today);
  if ("dueTime" in body) out.dueTime = parseTime(body.dueTime);
  if ("tag" in body) out.tag = parseTag(body.tag);
  if ("starred" in body) out.starred = body.starred === true;
  if ("clientId" in body) out.clientId = optionalUuid(body.clientId, "Client");
  if ("matterId" in body) out.matterId = optionalUuid(body.matterId, "Matter");
  return out;
}

export function parseRecurrence(value: unknown, anchorDate: string): MyDayRecurrenceInput | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const rule = raw.rule;
  if (rule === undefined || rule === null || rule === "" || rule === "none") return null;
  if (!MY_DAY_RULES.some((r) => r.code === rule)) {
    throw new AuthError("validation", "Unknown repeat rule.");
  }
  const anchor = new Date(`${anchorDate}T00:00:00Z`);
  const weekday =
    typeof raw.weekday === "number" && raw.weekday >= 0 && raw.weekday <= 6
      ? Math.floor(raw.weekday)
      : anchor.getUTCDay();
  const monthDay =
    typeof raw.monthDay === "number" && raw.monthDay >= 1 && raw.monthDay <= 31
      ? Math.floor(raw.monthDay)
      : anchor.getUTCDate();
  return {
    rule: rule as MyDayRule,
    weekday: rule === "weekly" ? weekday : null,
    monthDay: rule === "monthly" ? monthDay : null,
  };
}
