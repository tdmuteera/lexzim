import { and, desc, eq, gte, ilike, lte, or, sql, type SQL } from "drizzle-orm";
import { jsonError, jsonOk } from "@/lib/auth/http";
import { getDb } from "@/lib/db";
import { auditLogs, users } from "@/lib/db/schema";
import { requireAny } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

const CATEGORIES = new Set([
  "sign-in",
  "calendar",
  "finance",
  "email",
  "ai",
  "people",
  "clients",
  "documents",
  "settings",
  "other",
]);

function categoryCondition(category: string): SQL | undefined {
  const action = auditLogs.action;
  switch (category) {
    case "sign-in":
      return sql`${action} like 'auth.%'`;
    case "calendar":
      return sql`${action} like 'calendar.%' and ${action} <> 'calendar.guest_email_sent'`;
    case "email":
      return sql`${action} like 'staff_notify.%' or ${action} like 'staff_communication%' or ${action} = 'calendar.guest_email_sent'`;
    case "finance":
      return sql`${action} like 'finance%' or ${action} like 'gl_%' or ${action} like 'proformas.%' or ${action} like 'export.finance%' or ${action} = 'export.payment_intake'`;
    case "ai":
      return sql`${action} like 'ai.%'`;
    case "people":
      return sql`${action} like 'users.%' or ${action} like 'delegation.%'`;
    case "clients":
      return sql`${action} like 'clients.%'`;
    case "documents":
      return sql`${action} like 'export.%' and ${action} not like 'export.finance%' and ${action} <> 'export.payment_intake'`;
    case "settings":
      return sql`${action} like 'settings.%' or ${action} like 'onboarding.%'`;
    case "other":
      return sql`not (
        ${action} like 'auth.%'
        or ${action} like 'calendar.%'
        or ${action} like 'staff_notify.%'
        or ${action} like 'staff_communication%'
        or ${action} like 'finance%'
        or ${action} like 'gl_%'
        or ${action} like 'proformas.%'
        or ${action} like 'export.%'
        or ${action} like 'ai.%'
        or ${action} like 'users.%'
        or ${action} like 'delegation.%'
        or ${action} like 'clients.%'
        or ${action} like 'settings.%'
        or ${action} like 'onboarding.%'
      )`;
    default:
      return undefined;
  }
}

function harareBound(day: string, end: boolean): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  return new Date(`${day}T${end ? "23:59:59.999" : "00:00:00.000"}+02:00`);
}

function publicMetadata(meta: Record<string, unknown> | null): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta ?? {})) {
    if (key === "sessionId" || key === "messageId") continue;
    out[key] = value;
  }
  return out;
}

/** Firm audit events for the User activity tab (users.activity.view or users.manage). */
export async function GET(request: Request) {
  try {
    const session = await requireAny(["users.activity.view", "users.manage"]);
    const firmId = tenantFirmId(session);
    const params = new URL(request.url).searchParams;
    const userId = params.get("userId")?.trim() || null;
    const category = params.get("category")?.trim() || "";
    const q = params.get("q")?.trim() || "";
    const from = harareBound(params.get("from")?.trim() || "", false);
    const to = harareBound(params.get("to")?.trim() || "", true);
    const limitRaw = Number(params.get("limit") ?? "120");
    const limit = Number.isFinite(limitRaw) ? Math.min(400, Math.max(1, limitRaw)) : 120;

    const db = getDb();
    const conditions = [eq(auditLogs.firmId, firmId)];
    if (userId) conditions.push(eq(auditLogs.userId, userId));
    if (from) conditions.push(gte(auditLogs.createdAt, from));
    if (to) conditions.push(lte(auditLogs.createdAt, to));
    if (CATEGORIES.has(category)) {
      const categorySql = categoryCondition(category);
      if (categorySql) conditions.push(categorySql);
    }
    if (q) {
      const like = `%${q.replace(/[%_\\]/g, "\\$&")}%`;
      conditions.push(
        or(
          ilike(auditLogs.action, like),
          ilike(users.fullName, like),
          ilike(users.email, like),
          sql`coalesce(${auditLogs.metadataJson}::text, '') ilike ${like}`,
        )!,
      );
    }

    const where = and(...conditions);
    const [rows, counted, loginUsers] = await Promise.all([
      db
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
        .where(where)
        .orderBy(desc(auditLogs.createdAt))
        .limit(limit),
      db
        .select({ total: sql<number>`count(*)::int` })
        .from(auditLogs)
        .leftJoin(users, eq(auditLogs.userId, users.id))
        .where(where),
      db
        .select({
          id: users.id,
          fullName: users.fullName,
          email: users.email,
        })
        .from(users)
        .where(and(eq(users.firmId, firmId), eq(users.isSystemUser, true)))
        .orderBy(users.fullName),
    ]);

    return jsonOk({
      total: counted[0]?.total ?? rows.length,
      items: rows.map((row) => ({
        id: row.id,
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId,
        metadata: publicMetadata(row.metadataJson),
        ipOrUserAgent: row.ipOrUserAgent,
        userId: row.userId,
        userFullName: row.userFullName,
        userEmail: row.userEmail,
        createdAt: row.createdAt.toISOString(),
      })),
      loginUsers,
    });
  } catch (err) {
    return jsonError(err, request);
  }
}
