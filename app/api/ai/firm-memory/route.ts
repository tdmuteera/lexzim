import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import {
  firmMemoryReindexAll,
  firmMemoryReindexMatter,
  getFirmMemoryStats,
} from "@/lib/ai/firm-memory";
import { canViewAllMatters, hasPermission, requirePermission } from "@/lib/rbac/guards";
import { userCanAccessMatter } from "@/lib/repos/matters";
import { tenantFirmId } from "@/lib/tenant/scope";

/** Firm memory index stats. */
export async function GET() {
  try {
    const session = await requirePermission("ai.use");
    const firmId = tenantFirmId(session);
    const stats = await getFirmMemoryStats(firmId);
    return jsonOk(stats);
  } catch (err) {
    return jsonError(err);
  }
}

/**
 * Re-index firm memory.
 * body.action:
 * - "reindex_matter" (requires matterId; ai.use + matter access)
 * - "reindex_all" (requires ai.manage_settings)
 */
export async function POST(request: Request) {
  try {
    const session = await requirePermission("ai.use");
    const firmId = tenantFirmId(session);
    const body = (await request.json().catch(() => ({}))) as {
      action?: string;
      matterId?: string;
    };
    const action = (body.action ?? "").trim().toLowerCase();

    if (action === "reindex_all") {
      if (!hasPermission(session, "ai.manage_settings")) {
        throw new AuthError("forbidden", "Permission required: ai.manage_settings");
      }
      const result = await firmMemoryReindexAll({ firmId });
      await writeAuditLog({
        action: "ai.firm_memory_reindex_all",
        firmId,
        userId: session.id,
        entityType: "firm_memory",
        entityId: firmId,
        metadata: {
          mattersAttempted: result.mattersAttempted,
          mattersOk: result.mattersOk,
          embedded: result.embedded,
          failed: result.failed,
          errorCode: result.errorCode ?? null,
        },
        ipOrUserAgent: clientInfo(request),
      });
      const stats = await getFirmMemoryStats(firmId);
      return jsonOk({ action, result, stats });
    }

    if (action === "reindex_matter") {
      const matterId = typeof body.matterId === "string" ? body.matterId.trim() : "";
      if (!matterId) {
        throw new AuthError("validation", "matterId is required.");
      }
      const viewAll = canViewAllMatters(session);
      const allowed = await userCanAccessMatter(firmId, matterId, session.id, viewAll);
      if (!allowed) {
        throw new AuthError("forbidden", "You do not have access to this matter.");
      }

      const result = await firmMemoryReindexMatter({ firmId, matterId });
      await writeAuditLog({
        action: "ai.firm_memory_reindex_matter",
        firmId,
        userId: session.id,
        entityType: "matter",
        entityId: matterId,
        metadata: {
          embedded: result.embedded,
          failed: result.failed,
          attempted: result.attempted,
          errorCode: result.errorCode ?? null,
        },
        ipOrUserAgent: clientInfo(request),
      });
      const stats = await getFirmMemoryStats(firmId);
      return jsonOk({ action, result, stats });
    }

    throw new AuthError(
      "validation",
      'action must be "reindex_matter" or "reindex_all".',
    );
  } catch (err) {
    return jsonError(err);
  }
}
