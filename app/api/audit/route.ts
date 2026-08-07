import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { auditLogs } from "@/lib/db/schema";
import { jsonError, jsonOk } from "@/lib/auth/http";
import { requirePermission } from "@/lib/rbac/guards";

/** Sample protected route: requires audit.view (P0-08). */
export async function GET() {
  try {
    const session = await requirePermission("audit.view");
    const db = getDb();

    const rows = await db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        entityType: auditLogs.entityType,
        entityId: auditLogs.entityId,
        userId: auditLogs.userId,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
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
    return jsonError(err);
  }
}
