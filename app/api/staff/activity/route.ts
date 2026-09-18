import { and, desc, eq } from "drizzle-orm";
import { jsonError, jsonOk } from "@/lib/auth/http";
import { getDb } from "@/lib/db";
import { auditLogs, users } from "@/lib/db/schema";
import { requireAny } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

/** Firm audit events for the User activity tab (users.activity.view or users.manage). */
export async function GET(request: Request) {
  try {
    const session = await requireAny(["users.activity.view", "users.manage"]);
    const firmId = tenantFirmId(session);
    const params = new URL(request.url).searchParams;
    const userId = params.get("userId")?.trim() || null;
    const limitRaw = Number(params.get("limit") ?? "80");
    const limit = Number.isFinite(limitRaw) ? Math.min(200, Math.max(1, limitRaw)) : 80;

    const db = getDb();
    const conditions = [eq(auditLogs.firmId, firmId)];
    if (userId) conditions.push(eq(auditLogs.userId, userId));

    const rows = await db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        entityType: auditLogs.entityType,
        entityId: auditLogs.entityId,
        metadataJson: auditLogs.metadataJson,
        ipOrUserAgent: auditLogs.ipOrUserAgent,
        userId: auditLogs.userId,
        userFullName: users.fullName,
        userEmail: users.email,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.userId, users.id))
      .where(and(...conditions))
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit);

    return jsonOk({
      items: rows.map((row) => ({
        id: row.id,
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId,
        metadata: row.metadataJson ?? {},
        ipOrUserAgent: row.ipOrUserAgent,
        userId: row.userId,
        userFullName: row.userFullName,
        userEmail: row.userEmail,
        createdAt: row.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    return jsonError(err, request);
  }
}
