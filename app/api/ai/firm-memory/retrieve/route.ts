import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { retrieveFirmContext } from "@/lib/ai/firm-memory/retrieve";
import { canViewAllMatters, requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

/**
 * Matter-scoped firm memory retrieval (snippets only).
 * Requires ai.use + matter access. Never cross-matter.
 */
export async function POST(request: Request) {
  try {
    const session = await requirePermission("ai.use");
    const firmId = tenantFirmId(session);
    const body = (await request.json()) as {
      query?: string;
      matterId?: string;
      topK?: number;
      minSimilarity?: number;
    };

    const query = typeof body.query === "string" ? body.query.trim() : "";
    const matterId = typeof body.matterId === "string" ? body.matterId.trim() : "";
    if (!query) throw new AuthError("validation", "query is required.");
    if (!matterId) throw new AuthError("validation", "matterId is required.");

    const result = await retrieveFirmContext({
      firmId,
      userId: session.id,
      viewAllMatters: canViewAllMatters(session),
      matterId,
      query,
      topK: typeof body.topK === "number" ? body.topK : undefined,
      minSimilarity:
        typeof body.minSimilarity === "number" ? body.minSimilarity : undefined,
    });

    if (result.retrievalMeta.errorCode === "forbidden") {
      throw new AuthError("forbidden", "You do not have access to this matter.");
    }
    if (result.retrievalMeta.errorCode === "not_found") {
      throw new AuthError("not_found", "Matter not found.");
    }

    await writeAuditLog({
      action: "ai.retrieve_firm_context",
      firmId,
      userId: session.id,
      entityType: "matter",
      entityId: matterId,
      metadata: {
        hitCount: result.retrievalMeta.hitCount,
        empty: result.retrievalMeta.empty,
        emptyReason: result.retrievalMeta.emptyReason,
        latencyMs: result.retrievalMeta.latencyMs,
        queryPreview: query.slice(0, 120),
      },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk({
      hits: result.hits.map((h) => ({
        ownerType: h.ownerType,
        ownerId: h.ownerId,
        matterId: h.matterId,
        score: h.score,
        text: h.text,
        citationLabel: h.citationLabel,
        title: h.title,
      })),
      citations: result.citations,
      retrievalMeta: result.retrievalMeta,
    });
  } catch (err) {
    return jsonError(err, request);
  }
}
