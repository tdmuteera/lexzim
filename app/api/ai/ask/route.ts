import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { aiLegalAsk } from "@/lib/ai/rag/answer";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

/** Legal research ask (RAG + grounded answer or not-found). Requires ai.use. */
export async function POST(request: Request) {
  try {
    const session = await requirePermission("ai.use");
    const firmId = tenantFirmId(session);
    const body = (await request.json()) as {
      question?: string;
      conversationId?: string | null;
    };

    const question = typeof body.question === "string" ? body.question.trim() : "";
    if (!question) {
      throw new AuthError("validation", "question is required.");
    }

    let result;
    try {
      result = await aiLegalAsk({
        firmId,
        userId: session.id,
        question,
        conversationId: body.conversationId ?? null,
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
      action: "ai.legal_ask",
      firmId,
      userId: session.id,
      entityType: "ai_conversation",
      entityId: result.conversationId,
      metadata: {
        notFound: result.notFound,
        confidence: result.confidence,
        hitCount: result.retrievalMeta.hitCount,
        emptyReason: result.retrievalMeta.emptyReason,
        webLookupEnabled: result.webLookup.enabled,
        webHitCount: result.webLookup.hitCount,
        questionPreview: question.slice(0, 120),
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
      retrievalMeta: result.retrievalMeta,
      webLookup: result.webLookup,
      notFound: result.notFound,
      disclaimer: result.disclaimer,
    });
  } catch (err) {
    return jsonError(err);
  }
}
