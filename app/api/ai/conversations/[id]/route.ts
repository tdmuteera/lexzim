import { jsonError, jsonOk } from "@/lib/auth/http";
import { writeAuditLog } from "@/lib/auth/audit";
import { AuthError } from "@/lib/auth/types";
import {
  deleteConversation,
  getConversation,
  listMessages,
} from "@/lib/repos/ai-conversations";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

type RouteContext = { params: Promise<{ id: string }> };

/** Load a legal research conversation + messages for the signed-in user. */
export async function GET(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("ai.use");
    const firmId = tenantFirmId(session);
    const { id } = await context.params;

    const conversation = await getConversation(firmId, id);
    if (!conversation || conversation.userId !== session.id) {
      throw new AuthError("not_found", "Conversation not found.");
    }

    const messages = await listMessages(firmId, id);
    return jsonOk({
      conversation: {
        id: conversation.id,
        mode: conversation.mode,
        matterId: conversation.matterId,
        title: conversation.title,
        createdAt: conversation.createdAt.toISOString(),
        updatedAt: conversation.updatedAt.toISOString(),
      },
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        confidence: m.confidence,
        citationsJson: m.citationsJson,
        retrievalMetaJson: m.retrievalMetaJson,
        createdAt: m.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    return jsonError(err, request);
  }
}

/** Permanently delete own conversation (confidential cleanup). */
export async function DELETE(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("ai.use");
    const firmId = tenantFirmId(session);
    const { id } = await context.params;

    const deleted = await deleteConversation({
      firmId,
      userId: session.id,
      conversationId: id,
    });
    if (!deleted) {
      throw new AuthError("not_found", "Conversation not found.");
    }

    await writeAuditLog({
      firmId,
      userId: session.id,
      action: "ai.conversation_deleted",
      entityType: "ai_conversation",
      entityId: id,
      metadata: {},
    });

    return jsonOk({ deleted: true });
  } catch (err) {
    return jsonError(err, request);
  }
}
