import { AuthError } from "@/lib/auth/types";

export type TrackingInput = {
  summary: string;
  happensOn: string;
};

export function harareToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Harare",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function addCalendarDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/** Calendar date, shown as 30 October 2026. */
export function formatTrackingDate(isoDate: string): string {
  const [y, m, d] = isoDate.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return isoDate;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function trackingDueAt(happensOn: string): string {
  return `${happensOn.slice(0, 10)}T00:00:00.000Z`;
}

export function parseTrackingInput(body: unknown): TrackingInput {
  if (!body || typeof body !== "object") {
    throw new AuthError("validation", "Enter what is happening and a date.");
  }
  const raw = body as Record<string, unknown>;
  const summary = typeof raw.summary === "string" ? raw.summary.trim() : "";
  if (summary.length < 3) {
    throw new AuthError("validation", "Describe what is happening in a few words.");
  }
  if (summary.length > 240) {
    throw new AuthError("validation", "Keep the update under 240 characters.");
  }
  const happensOn = typeof raw.happensOn === "string" ? raw.happensOn.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(happensOn)) {
    throw new AuthError("validation", "Choose a date.");
  }
  const [y, m, d] = happensOn.split("-").map(Number);
  if (y < 1990 || y > 2100) {
    throw new AuthError("validation", "Choose a date between 1990 and 2100.");
  }
  const check = new Date(Date.UTC(y, m - 1, d));
  if (
    check.getUTCFullYear() !== y ||
    check.getUTCMonth() !== m - 1 ||
    check.getUTCDate() !== d
  ) {
    throw new AuthError("validation", "Choose a real date.");
  }
  return { summary, happensOn };
}
