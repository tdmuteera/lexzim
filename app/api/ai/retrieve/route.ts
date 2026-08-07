import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { retrieveLegalContext } from "@/lib/ai/rag/retrieve";
import { hasPermission, requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

/**
 * RAG retrieval only (no LLM answer).
 * Requires ai.use. Diagnostic candidate preview requires ai.manage_settings.
 */
export async function POST(request: Request) {
  try {
    const session = await requirePermission("ai.use");
    const firmId = tenantFirmId(session);
    const body = (await request.json()) as {
      query?: string;
      topK?: number;
      minSimilarity?: number;
      diagnostic?: boolean;
    };

    const query = typeof body.query === "string" ? body.query.trim() : "";
    if (!query) {
      throw new AuthError("validation", "query is required.");
    }

    const wantDiagnostic = body.diagnostic === true;
    const canDiagnose = hasPermission(session, "ai.manage_settings");
    if (wantDiagnostic && !canDiagnose) {
      throw new AuthError("forbidden", "Permission required: ai.manage_settings");
    }

    const result = await retrieveLegalContext({
      firmIdForProvider: firmId,
      query,
      topK: typeof body.topK === "number" ? body.topK : undefined,
      minSimilarity:
        typeof body.minSimilarity === "number" ? body.minSimilarity : undefined,
      includeDiagnostic: wantDiagnostic && canDiagnose,
    });

    await writeAuditLog({
      action: "ai.retrieve_legal_context",
      firmId,
      userId: session.id,
      entityType: "knowledge_retrieval",
      entityId: firmId,
      metadata: {
        hitCount: result.retrievalMeta.hitCount,
        empty: result.retrievalMeta.empty,
        emptyReason: result.retrievalMeta.emptyReason,
        latencyMs: result.retrievalMeta.latencyMs,
        embeddingsModel: result.retrievalMeta.embeddingsModel,
        diagnostic: Boolean(result.diagnostic),
        // Never log full query text if very long; keep a short preview.
        queryPreview: query.slice(0, 120),
      },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk({
      hits: result.hits.map((h) => ({
        chunkId: h.chunkId,
        sourceId: h.sourceId,
        score: h.score,
        headingPath: h.headingPath,
        text: h.text,
        citationLabel: h.citationLabel,
        title: h.title,
        sourceUrl: h.sourceUrl,
        sourceType: h.sourceType,
      })),
      citations: result.citations,
      retrievalMeta: result.retrievalMeta,
      diagnostic: result.diagnostic ?? null,
    });
  } catch (err) {
    return jsonError(err);
  }
}
