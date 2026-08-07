import { jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { getConversation, listMessages } from "@/lib/repos/ai-conversations";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

type RouteContext = { params: Promise<{ id: string }> };

/** Load a legal research conversation + messages for the signed-in user. */
export async function GET(_request: Request, context: RouteContext) {
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
    return jsonError(err);
  }
}
