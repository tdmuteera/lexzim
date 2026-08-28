import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { aiLegalAsk } from "@/lib/ai/rag/answer";
import { aiMatterAsk } from "@/lib/ai/rag/matter-ask";
import {
  editUserMessageAndTruncate,
  getConversation,
} from "@/lib/repos/ai-conversations";
import { canViewAllMatters, requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Edit a user message, truncate later turns, then regenerate the assistant reply
 * without inserting a duplicate user row.
 */
export async function POST(request: Request, context: RouteContext) {
  try {
    const session = await requirePermission("ai.use");
    const firmId = tenantFirmId(session);
    const { id: conversationId } = await context.params;
    const body = (await request.json()) as {
      messageId?: string;
      content?: string;
    };

    const messageId = typeof body.messageId === "string" ? body.messageId.trim() : "";
    const content = typeof body.content === "string" ? body.content.trim() : "";
    if (!messageId) throw new AuthError("validation", "messageId is required.");
    if (!content) throw new AuthError("validation", "content is required.");

    const conversation = await getConversation(firmId, conversationId);
    if (!conversation || conversation.userId !== session.id) {
      throw new AuthError("not_found", "Conversation not found.");
    }

    let edited;
    try {
      edited = await editUserMessageAndTruncate({
        firmId,
        conversationId,
        messageId,
        content,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "edit_failed";
      if (message === "content_required") {
        throw new AuthError("validation", "content is required.");
      }
      throw err;
    }
    if (!edited) {
      throw new AuthError("validation", "Only user messages can be edited.");
    }

    if (conversation.mode === "matter_assist") {
      const matterId = conversation.matterId?.trim() || "";
      if (!matterId) {
        throw new AuthError("validation", "This conversation has no matter linked.");
      }

      let result;
      try {
        result = await aiMatterAsk({
          firmId,
          userId: session.id,
          viewAllMatters: canViewAllMatters(session),
          matterId,
          question: content,
          conversationId,
          skipCreateUserMessage: true,
          existingUserMessageId: messageId,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "ask_failed";
        if (message === "matter_forbidden") {
          throw new AuthError("forbidden", "You do not have access to this matter.");
        }
        if (message === "matter_not_found" || message === "matter_id_required") {
          throw new AuthError("not_found", "Matter not found.");
        }
        if (message === "matter_context_disabled") {
          throw new AuthError(
            "forbidden",
            "Matter context for AI is disabled for this firm. A Managing Partner can re-enable it in Settings → AI.",
          );
        }
        throw err;
      }

      await writeAuditLog({
        action: "ai.matter_regenerate",
        firmId,
        userId: session.id,
        entityType: "matter",
        entityId: result.matterId,
        metadata: {
          conversationId: result.conversationId,
          messageId,
          confidence: result.confidence,
          questionPreview: content.slice(0, 120),
        },
        ipOrUserAgent: clientInfo(request),
      });

      return jsonOk({
        conversationId: result.conversationId,
        userMessageId: result.userMessageId,
        assistantMessageId: result.assistantMessageId,
        answer: result.answer,
        confidence: result.confidence,
        confidenceScore: result.confidenceScore,
        citations: result.citations,
        grounding: result.grounding,
        sourceTiers: result.sourceTiers,
        exploreSources: result.exploreSources,
        matterId: result.matterId,
        matterHeader: result.matterHeader,
        retrievalMeta: result.retrievalMeta,
        notFound: result.notFound,
        disclaimer: result.disclaimer,
        document: result.document ?? null,
      });
    }

    if (conversation.mode !== "legal_research") {
      throw new AuthError("validation", "Unsupported conversation mode.");
    }

    let result;
    try {
      result = await aiLegalAsk({
        firmId,
        userId: session.id,
        question: content,
        conversationId,
        skipCreateUserMessage: true,
        existingUserMessageId: messageId,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "ask_failed";
      if (message === "conversation_not_found") {
        throw new AuthError("not_found", "Conversation not found.");
      }
      if (message === "conversation_mode_mismatch") {
        throw new AuthError("validation", "Conversation is not a legal research thread.");
      }
      throw err;
    }

    await writeAuditLog({
      action: "ai.legal_regenerate",
      firmId,
      userId: session.id,
      entityType: "ai_conversation",
      entityId: result.conversationId,
      metadata: {
        messageId,
        notFound: result.notFound,
        confidence: result.confidence,
        questionPreview: content.slice(0, 120),
      },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk({
      conversationId: result.conversationId,
      userMessageId: result.userMessageId,
      assistantMessageId: result.assistantMessageId,
      answer: result.answer,
      confidence: result.confidence,
      confidenceScore: result.confidenceScore,
      citations: result.citations,
      grounding: result.grounding,
      sourceTiers: result.sourceTiers,
      exploreSources: result.exploreSources,
      retrievalMeta: result.retrievalMeta,
      notFound: result.notFound,
      disclaimer: result.disclaimer,
      document: result.document ?? null,
    });
  } catch (err) {
    return jsonError(err, request);
  }
}
