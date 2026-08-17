import { jsonError, jsonOk } from "@/lib/auth/http";
import { getReminders } from "@/lib/repos/reminders";
import {
  BROWSER_NOTIFICATIONS_KEY,
  getFirmSetting,
} from "@/lib/repos/firm-settings";
import { canViewAllMatters, requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

export async function GET(request: Request) {
  try {
    const session = await requirePermission("calendar.view");
    const firmId = tenantFirmId(session);
    const viewAll = canViewAllMatters(session);

    const [reminders, browserPref] = await Promise.all([
      getReminders({
        firmId,
        userId: session.id,
        viewAll,
      }),
      getFirmSetting(firmId, BROWSER_NOTIFICATIONS_KEY),
    ]);

    return jsonOk({
      ...reminders,
      settings: {
        browserNotificationsEnabled: browserPref === "true",
      },
    });
  } catch (err) {
    return jsonError(err, request);
  }
}
