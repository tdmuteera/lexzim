import { and, desc, eq, gte, sql } from "drizzle-orm";
import { jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { getDb } from "@/lib/db";
import { auditLogs } from "@/lib/db/schema";
import { isPortalEnabled } from "@/lib/portal/config";
import { requireAny } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

export const runtime = "nodejs";

const PORTAL_ACTIONS = [
  "portal.matter_viewed",
  "portal.document_download",
  "portal.matter_shared",
  "portal.matter_share_revoked",
  "portal.document_shared",
  "portal.document_share_revoked",
  "portal.inbox_upload",
  "portal.inbox_accepted",
  "portal.inbox_dismissed",
] as const;

/**
 * Staff: recent portal activity for a matter (views, downloads, share changes).
 * GET /api/portal/activity?matterId=
 */
export async function GET(request: Request) {
  try {
    if (!isPortalEnabled()) {
      throw new AuthError("portal_disabled", "Client portal is disabled.");
    }
    const session = await requireAny([
      "matters.edit",
      "matters.create",
      "matters.view",
      "clients.edit",
    ]);
    const firmId = tenantFirmId(session);
    const matterId = new URL(request.url).searchParams.get("matterId")?.trim();
    if (!matterId) {
      throw new AuthError("validation", "matterId is required.");
    }

    const db = getDb();
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    const rows = await db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        userId: auditLogs.userId,
        createdAt: auditLogs.createdAt,
        metadataJson: auditLogs.metadataJson,
      })
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.firmId, firmId),
          gte(auditLogs.createdAt, since),
          sql`${auditLogs.action} in (${sql.join(
            PORTAL_ACTIONS.map((a) => sql`${a}`),
            sql`, `,
          )})`,
          sql`(${auditLogs.metadataJson}->>'matterId') = ${matterId}`,
        ),
      )
      .orderBy(desc(auditLogs.createdAt))
      .limit(40);

    return jsonOk({
      items: rows.map((r) => ({
        id: r.id,
        action: r.action,
        actorUserId: r.userId,
        createdAt: r.createdAt.toISOString(),
        metadata: r.metadataJson ?? {},
      })),
    });
  } catch (err) {
    return jsonError(err);
  }
}
