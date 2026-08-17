import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import {
  countExpiringAiConversations,
  purgeOldAiConversations,
  resolveAiConversationRetentionDays,
} from "@/lib/privacy/ai-retention";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

/** AI conversation retention status for this firm. */
export async function GET(request: Request) {
  try {
    const session = await requirePermission("ai.manage_settings");
    const firmId = tenantFirmId(session);
    const olderThanDays = await resolveAiConversationRetentionDays(firmId);
    const expiring = await countExpiringAiConversations({ firmId, olderThanDays });
    return jsonOk({
      olderThanDays,
      expiringCount: expiring.count,
      note: "Conversations older than the window are deleted; messages cascade. KB embeddings are not purged here.",
    });
  } catch (err) {
    return jsonError(err, request);
  }
}

/**
 * Purge old AI conversations for this firm.
 * Body optional: { olderThanDays?, dryRun? }
 */
export async function POST(request: Request) {
  try {
    const session = await requirePermission("ai.manage_settings");
    const firmId = tenantFirmId(session);
    const body = (await request.json().catch(() => ({}))) as {
      olderThanDays?: number;
      dryRun?: boolean;
    };

    let olderThanDays = await resolveAiConversationRetentionDays(firmId);
    if (body.olderThanDays !== undefined) {
      if (
        !Number.isInteger(body.olderThanDays) ||
        body.olderThanDays < 7 ||
        body.olderThanDays > 3650
      ) {
        throw new AuthError("validation", "olderThanDays must be an integer from 7 to 3650.");
      }
      olderThanDays = body.olderThanDays;
    }

    if (body.dryRun) {
      const expiring = await countExpiringAiConversations({ firmId, olderThanDays });
      return jsonOk({ dryRun: true, olderThanDays, wouldDelete: expiring.count });
    }

    const result = await purgeOldAiConversations({ firmId, olderThanDays });
    await writeAuditLog({
      action: "ai.conversations_purged",
      firmId,
      userId: session.id,
      entityType: "ai_conversations",
      entityId: firmId,
      metadata: { deleted: result.deleted, olderThanDays },
      ipOrUserAgent: clientInfo(request),
    });
    return jsonOk(result);
  } catch (err) {
    return jsonError(err, request);
  }
}
