/** My Day shared types and date helpers (safe for server and client). */

export const MY_DAY_TAGS = [
  { code: "admin", label: "Admin", color: "#6B7A99" },
  { code: "website", label: "Website", color: "#2F6FED" },
  { code: "social", label: "Social media", color: "#C2418C" },
  { code: "accounts", label: "User accounts", color: "#7A5AF8" },
  { code: "client", label: "Client work", color: "#A07C38" },
  { code: "finance", label: "Finance", color: "#3A7356" },
  { code: "personal", label: "Personal", color: "#D9822B" },
] as const;

export type MyDayTag = (typeof MY_DAY_TAGS)[number]["code"];

export const MY_DAY_RULES = [
  { code: "daily", label: "Every day" },
  { code: "weekdays", label: "Every weekday (Mon to Fri)" },
  { code: "weekly", label: "Every week" },
  { code: "monthly", label: "Every month" },
] as const;

export type MyDayRule = (typeof MY_DAY_RULES)[number]["code"];

export type MyDayStatus = "open" | "done" | "dropped" | "moved";

export type MyDayItemDto = {
  id: string;
  title: string;
  notes: string | null;
  dueDate: string | null;
  dueTime: string | null;
  originalDate: string | null;
  tag: string | null;
  starred: boolean;
  status: MyDayStatus;
  carriedCount: number;
  completedOn: string | null;
  clientId: string | null;
  clientLabel: string | null;
  matterId: string | null;
  matterLabel: string | null;
  calendarEventId: string | null;
  recurrenceId: string | null;
  sortOrder: number;
};

export type MyDayRecurrenceDto = {
  id: string;
  title: string;
  rule: MyDayRule;
  weekday: number | null;
  monthDay: number | null;
  tag: string | null;
  dueTime: string | null;
};

export type MyDayPayload = {
  today: string;
  items: MyDayItemDto[];
  recurrences: MyDayRecurrenceDto[];
  streak: number;
};

/** Same order as the server query, so optimistic edits never make rows jump on the next refresh. */
export function sortMyDayItems(items: MyDayItemDto[]): MyDayItemDto[] {
  return [...items].sort((a, b) => {
    const da = a.dueDate ?? "9999-12-31";
    const db = b.dueDate ?? "9999-12-31";
    if (da !== db) return da < db ? -1 : 1;
    if (a.starred !== b.starred) return a.starred ? -1 : 1;
    const ta = a.dueTime ?? "99:99";
    const tb = b.dueTime ?? "99:99";
    if (ta !== tb) return ta < tb ? -1 : 1;
    return a.sortOrder - b.sortOrder;
  });
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function localToday(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(`${fromIso}T00:00:00Z`);
  const b = Date.parse(`${toIso}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/** 0 = Sunday ... 6 = Saturday */
export function weekdayOf(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}

/** Next Monday strictly after the given day. */
export function nextMonday(iso: string): string {
  const wd = weekdayOf(iso);
  const delta = wd === 1 ? 7 : (8 - wd) % 7 || 7;
  return addDays(iso, delta);
}

export function recurrenceMatches(
  rule: string,
  iso: string,
  weekday: number | null,
  monthDay: number | null,
): boolean {
  const wd = weekdayOf(iso);
  if (rule === "daily") return true;
  if (rule === "weekdays") return wd >= 1 && wd <= 5;
  if (rule === "weekly") return wd === (weekday ?? 1);
  if (rule === "monthly") {
    const day = Number(iso.slice(8, 10));
    const target = monthDay ?? 1;
    const lastDay = new Date(
      Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)), 0),
    ).getUTCDate();
    return day === Math.min(target, lastDay);
  }
  return false;
}

export function tagMeta(code: string | null | undefined) {
  return MY_DAY_TAGS.find((t) => t.code === code) ?? null;
}

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function recurrenceLabel(r: Pick<MyDayRecurrenceDto, "rule" | "weekday" | "monthDay">) {
  if (r.rule === "daily") return "Every day";
  if (r.rule === "weekdays") return "Weekdays";
  if (r.rule === "weekly") return `Every ${WEEKDAY_NAMES[r.weekday ?? 1]}`;
  if (r.rule === "monthly") return `Monthly on day ${r.monthDay ?? 1}`;
  return r.rule;
}

/** Today, the seven days before today, or anything finished before that. */
export type FinishedBucket = "today" | "week" | "earlier";

export function finishedBucket(completedOn: string | null, today: string): FinishedBucket | null {
  if (!completedOn || completedOn > today) return null;
  if (completedOn === today) return "today";
  if (completedOn >= addDays(today, -7)) return "week";
  return "earlier";
}

export function friendlyDay(iso: string, today: string): string {
  const diff = daysBetween(today, iso);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}
