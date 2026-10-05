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
 * The only calendar reminder is 08:00 Africa/Harare on the day of the event
 * (06:00 UTC). Creation emails, day-before emails, and 30-minute reminders
 * are not sent. Run once during that hour. Repeat calls the same morning
 * do not send a second copy.
 *
 * Optional query: ?forceSlot=day_of for a manual test outside that hour.
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
    const forceSlot: CalendarEmailSlot | undefined =
      forceRaw === "day_of" ? "day_of" : undefined;

    const results = await sendCalendarEventEmailsForAllFirms({ forceSlot });
    const emailed = results.reduce((n, r) => n + r.emailed, 0);
    return jsonOk({
      ok: true,
      emailed,
      results,
      note: forceSlot
        ? `Forced slot ${forceSlot}`
        : "Calendar reminders send at 08:00 Africa/Harare on the day of the event only.",
    });
  } catch (err) {
    return jsonError(err, request);
  }
}

export async function POST(request: Request) {
  return GET(request);
}
