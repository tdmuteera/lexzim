import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { aiMatterAsk } from "@/lib/ai/rag/matter-ask";
import { canViewAllMatters, requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

/** Matter Assist ask. Requires ai.use + matter access. */
export async function POST(request: Request) {
  try {
    const session = await requirePermission("ai.use");
    const firmId = tenantFirmId(session);
    const body = (await request.json()) as {
      question?: string;
      matterId?: string;
      conversationId?: string | null;
      includeLegal?: boolean;
      attachmentContext?: string | null;
      documentIds?: string[] | null;
      selectedDocumentIds?: string[] | null;
    };

    const question = typeof body.question === "string" ? body.question.trim() : "";
    const matterId = typeof body.matterId === "string" ? body.matterId.trim() : "";
    const attachment =
      typeof body.attachmentContext === "string" ? body.attachmentContext.trim() : "";
    if (!question) throw new AuthError("validation", "question is required.");
    if (!matterId) throw new AuthError("validation", "matterId is required.");

    const rawDocIds = body.documentIds ?? body.selectedDocumentIds;
    const documentIds = Array.isArray(rawDocIds)
      ? rawDocIds.filter((id): id is string => typeof id === "string" && Boolean(id.trim()))
      : [];

    let result;
    try {
      result = await aiMatterAsk({
        firmId,
        userId: session.id,
        viewAllMatters: canViewAllMatters(session),
        matterId,
        question,
        conversationId: body.conversationId ?? null,
        includeLegal: body.includeLegal !== false,
        attachmentContext: attachment || null,
        documentIds,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "ask_failed";
      if (message === "matter_forbidden") {
        throw new AuthError("forbidden", "You do not have access to this matter.");
      }
      if (message === "matter_not_found" || message === "matter_id_required") {
        throw new AuthError("not_found", "Matter not found.");
      }
      if (message === "conversation_not_found") {
        throw new AuthError("not_found", "Conversation not found.");
      }
      if (message === "conversation_mode_mismatch") {
        throw new AuthError("validation", "Conversation is not a Matter Assist thread.");
      }
      if (message === "conversation_matter_mismatch") {
        throw new AuthError(
          "validation",
          "This conversation belongs to a different matter. Start a new chat.",
        );
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
      action: "ai.matter_ask",
      firmId,
      userId: session.id,
      entityType: "matter",
      entityId: result.matterId,
      metadata: {
        conversationId: result.conversationId,
        confidence: result.confidence,
        firmHitCount: result.retrievalMeta.firmHitCount,
        legalHitCount: result.retrievalMeta.legalHitCount,
        usedLlm: result.retrievalMeta.usedLlm,
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
  } catch (err) {
    return jsonError(err, request);
  }
}
