import { jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import {
  sendCalendarEventEmailsForAllFirms,
  type CalendarEmailSlot,
} from "@/lib/calendar/calendar-event-emails";

/**
 * Cron endpoint for calendar event reminder emails.
 * Secure with CRON_SECRET header: Authorization: Bearer <CRON_SECRET>
 *
 * Railway: schedule two HTTP crons (Africa/Harare = UTC+2):
 * - 15:00 UTC daily → 17:00 Harare (day-before emails)
 * - 06:00 UTC daily → 08:00 Harare (day-of emails)
 *
 * Optional query: ?forceSlot=day_before|day_of for manual tests.
 */
export async function GET(request: Request) {
  try {
    const secret = process.env.CRON_SECRET?.trim();
    if (!secret) {
      throw new AuthError("forbidden", "CRON_SECRET is not configured on the server.");
    }
    const auth = request.headers.get("authorization")?.trim() ?? "";
    if (auth !== `Bearer ${secret}`) {
      throw new AuthError("forbidden", "Invalid cron authorization.");
    }

    const url = new URL(request.url);
    const forceRaw = url.searchParams.get("forceSlot");
    const forceSlot =
      forceRaw === "day_before" || forceRaw === "day_of"
        ? (forceRaw as CalendarEmailSlot)
        : undefined;

    const results = await sendCalendarEventEmailsForAllFirms({ forceSlot });
    const emailed = results.reduce((n, r) => n + r.emailed, 0);
    return jsonOk({
      ok: true,
      emailed,
      results,
      note: forceSlot
        ? `Forced slot ${forceSlot}`
        : "Runs only during Harare hours 17:00 (day before) or 08:00 (day of) unless forceSlot is set.",
    });
  } catch (err) {
    return jsonError(err, request);
  }
}

export async function POST(request: Request) {
  return GET(request);
}
