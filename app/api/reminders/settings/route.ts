import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import {
  BROWSER_NOTIFICATIONS_KEY,
  getFirmSetting,
  upsertFirmSetting,
} from "@/lib/repos/firm-settings";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

export async function GET() {
  try {
    const session = await requirePermission("calendar.view");
    const firmId = tenantFirmId(session);
    const value = await getFirmSetting(firmId, BROWSER_NOTIFICATIONS_KEY);
    return jsonOk({
      browserNotificationsEnabled: value === "true",
    });
  } catch (err) {
    return jsonError(err);
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await requirePermission("settings.manage");
    const firmId = tenantFirmId(session);
    const body = (await request.json()) as { browserNotificationsEnabled?: unknown };

    if (typeof body.browserNotificationsEnabled !== "boolean") {
      throw new AuthError(
        "validation",
        "browserNotificationsEnabled must be a boolean.",
      );
    }

    const enabled = body.browserNotificationsEnabled;
    await upsertFirmSetting(
      firmId,
      BROWSER_NOTIFICATIONS_KEY,
      enabled ? "true" : "false",
    );

    await writeAuditLog({
      action: "reminders.settings_update",
      firmId,
      userId: session.id,
      entityType: "firm_settings",
      entityId: firmId,
      metadata: {
        key: BROWSER_NOTIFICATIONS_KEY,
        browserNotificationsEnabled: enabled,
      },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk({ browserNotificationsEnabled: enabled });
  } catch (err) {
    return jsonError(err);
  }
}
