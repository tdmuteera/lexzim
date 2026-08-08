import { jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import {
  listStaffNotifications,
  markAllStaffNotificationsRead,
  markStaffNotificationRead,
} from "@/lib/notifications/staff";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

/** Staff: list recent in-app notifications. */
export async function GET(request: Request) {
  try {
    const session = await requirePermission("matters.view");
    const firmId = tenantFirmId(session);
    const unreadOnly = new URL(request.url).searchParams.get("unreadOnly") === "1";
    const rows = await listStaffNotifications(firmId, session.id, {
      limit: 25,
      unreadOnly,
    });
    return jsonOk({
      items: rows.map((r) => ({
        id: r.id,
        type: r.type,
        title: r.title,
        body: r.body,
        href: r.href,
        readAt: r.readAt ? r.readAt.toISOString() : null,
        createdAt: r.createdAt.toISOString(),
        metadata: r.metadataJson ?? {},
      })),
      unreadCount: rows.filter((r) => !r.readAt).length,
    });
  } catch (err) {
    return jsonError(err);
  }
}

/** Staff: mark one or all notifications read. */
export async function POST(request: Request) {
  try {
    const session = await requirePermission("matters.view");
    const firmId = tenantFirmId(session);
    const body = (await request.json()) as {
      notificationId?: string;
      markAll?: boolean;
    };
    if (body.markAll) {
      await markAllStaffNotificationsRead(firmId, session.id);
      return jsonOk({ ok: true });
    }
    if (!body.notificationId?.trim()) {
      throw new AuthError("validation", "notificationId or markAll is required.");
    }
    const row = await markStaffNotificationRead(
      firmId,
      session.id,
      body.notificationId.trim(),
    );
    if (!row) throw new AuthError("not_found", "Notification not found.");
    return jsonOk({ id: row.id, readAt: row.readAt?.toISOString() ?? null });
  } catch (err) {
    return jsonError(err);
  }
}
