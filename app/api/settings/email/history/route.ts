/**
 * GET firm outbound email history from audit_logs (sent + failed).
 */
import { and, desc, eq, inArray } from "drizzle-orm";
import { jsonError, jsonOk } from "@/lib/auth/http";
import { getDb } from "@/lib/db";
import { auditLogs, users } from "@/lib/db/schema";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

const EMAIL_ACTIONS = [
  "email.sent",
  "email.failed",
  "email.test_sent",
  "staff_notify.email_sent",
  "staff_notify.email_failed",
  "staff_notify.test_sent",
  "staff_notify.test_failed",
] as const;

function labelForAction(action: string): string {
  switch (action) {
    case "email.sent":
      return "Client / document email";
    case "email.failed":
      return "Client / document email (failed)";
    case "email.test_sent":
      return "SMTP test";
    case "staff_notify.email_sent":
      return "Staff notification";
    case "staff_notify.email_failed":
      return "Staff notification (failed)";
    case "staff_notify.test_sent":
      return "Staff notification test";
    case "staff_notify.test_failed":
      return "Staff notification test (failed)";
    default:
      return action;
  }
}

function isFailedAction(action: string): boolean {
  return action.includes("failed");
}

export async function GET(request: Request) {
  try {
    const session = await requirePermission("settings.manage");
    const firmId = tenantFirmId(session);
    const params = new URL(request.url).searchParams;
    const limitRaw = Number(params.get("limit") ?? "50");
    const limit = Number.isFinite(limitRaw) ? Math.min(100, Math.max(1, limitRaw)) : 50;

    const db = getDb();
    const rows = await db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        entityType: auditLogs.entityType,
        entityId: auditLogs.entityId,
        metadataJson: auditLogs.metadataJson,
        createdAt: auditLogs.createdAt,
        userId: auditLogs.userId,
        userFullName: users.fullName,
        userEmail: users.email,
      })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.userId, users.id))
      .where(and(eq(auditLogs.firmId, firmId), inArray(auditLogs.action, [...EMAIL_ACTIONS])))
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit);

    const items = rows.map((row) => {
      const meta = (row.metadataJson ?? {}) as Record<string, unknown>;
      const to =
        (typeof meta.to === "string" && meta.to) ||
        (typeof meta.recipient === "string" && meta.recipient) ||
        null;
      const subject =
        (typeof meta.subject === "string" && meta.subject) ||
        (typeof meta.type === "string" && meta.type) ||
        null;
      const from = typeof meta.from === "string" ? meta.from : null;
      const error = typeof meta.error === "string" ? meta.error : null;
      const messageId = typeof meta.messageId === "string" ? meta.messageId : null;
      const transport = typeof meta.transport === "string" ? meta.transport : null;
      const documentNumber =
        typeof meta.documentNumber === "string" ? meta.documentNumber : null;

      return {
        id: row.id,
        action: row.action,
        kind: labelForAction(row.action),
        status: isFailedAction(row.action) ? ("failed" as const) : ("sent" as const),
        to,
        from,
        subject,
        error,
        messageId,
        transport,
        documentNumber,
        relatedUserName: row.userFullName,
        relatedUserEmail: row.userEmail,
        createdAt: row.createdAt.toISOString(),
      };
    });

    return jsonOk({ items });
  } catch (err) {
    return jsonError(err, request);
  }
}
