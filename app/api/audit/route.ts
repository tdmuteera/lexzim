import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { auditLogs, users } from "@/lib/db/schema";
import { jsonError, jsonOk } from "@/lib/auth/http";
import { requirePermission } from "@/lib/rbac/guards";

/** Firm audit history. Requires audit.view. */
export async function GET(request: Request) {
  try {
    const session = await requirePermission("audit.view");
    const db = getDb();

    const rows = await db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        entityType: auditLogs.entityType,
        createdAt: auditLogs.createdAt,
        actorName: users.fullName,
      })
      .from(auditLogs)
      .leftJoin(users, eq(users.id, auditLogs.userId))
      .where(eq(auditLogs.firmId, session.firm.id))
      .orderBy(desc(auditLogs.createdAt))
      .limit(50);

    return jsonOk({
      items: rows.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    return jsonError(err, request);
  }
}
